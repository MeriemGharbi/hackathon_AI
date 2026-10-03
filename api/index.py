"""AgriRisk web API.

Single FastAPI application that exposes the whole risk engine over HTTP *and*
serves the built React dashboard from the same origin, so the browser never
needs a second deployment or a cross-origin API URL.

All risk, climate, water, crop and chat logic lives in the shared `agrisk`
package; this module is transport only.

Routes are exposed under `/api/*` and mirrored at the root so the app works
identically behind a Vercel Function mounted at `/api`, behind `uvicorn
api.index:app`, and behind a reverse proxy that strips the prefix.
"""

from __future__ import annotations

import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from agrisk.chat.service import AgriRiskChatService
from agrisk.chat.session import SessionContext
from agrisk.config import get_api_key
from agrisk.regions import TUNISIA_REGIONS, region_names, resolve_region
from agrisk.services import crops, rainfall
from agrisk.services.assessment import assess_region, run_rainfall_scenario
from agrisk.services.dam import (
    dam_data_coverage,
    get_dam_dataframe,
    get_water_indicators,
)

API_TITLE = "AgriRisk API"
API_VERSION = "2.0.0"

REPO_ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = Path(os.environ.get("AGRIRISK_DIST", REPO_ROOT / "dist"))

# Governorate fan-out endpoints hit Open-Meteo once per region. Run them in
# parallel with a bounded pool so a 24-region request stays well inside the
# serverless request budget.
_FANOUT_WORKERS = 8

# National/regional fan-out is expensive (24 upstream windows) but the answer
# only changes when the climate cache expires, so memoise it briefly.
_FANOUT_TTL_SECONDS = float(os.environ.get("AGRIRISK_FANOUT_TTL", "300"))
_fanout_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_fanout_lock = threading.Lock()


def _cached_fanout(key: str, builder) -> dict[str, Any]:
    now = time.monotonic()
    with _fanout_lock:
        hit = _fanout_cache.get(key)
        if hit and hit[0] > now:
            return hit[1]
    payload = builder()
    with _fanout_lock:
        _fanout_cache[key] = (now + _FANOUT_TTL_SECONDS, payload)
    return payload


# ---------------------------------------------------------------------------
# App + CORS
# ---------------------------------------------------------------------------
# Docs live under /api so the SPA catch-all can own every other path without
# shadowing them.
app = FastAPI(
    title=API_TITLE,
    version=API_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

_origins = [
    origin.strip()
    for origin in os.environ.get("AGRIRISK_CORS_ORIGINS", "*").split(",")
    if origin.strip()
] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------
class AssessmentRequest(BaseModel):
    governorate: str
    crop: str | None = None
    period: str = "current"


class ScenarioRequest(BaseModel):
    governorate: str
    rainfall_change_pct: float = Field(..., ge=-90, le=200)
    crop: str | None = None
    period: str = "current"


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = Field(default_factory=list)
    governorate: str = "Kairouan"
    crop: str | None = None
    period: str = "current"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _canonical(governorate: str) -> str:
    canonical = resolve_region(governorate)
    if canonical is None:
        raise HTTPException(
            status_code=400,
            detail={
                "error": f"Unknown governorate '{governorate}'.",
                "available_governorates": region_names(),
            },
        )
    return canonical


def _require(governorate: str) -> str:
    """Validate a governorate name before it reaches a service."""
    return _canonical(governorate)


def _fail(payload: dict[str, Any]) -> dict[str, Any]:
    if "error" in payload:
        raise HTTPException(status_code=502, detail=payload)
    return payload


def _day(value) -> str:
    """ISO date for a pandas Timestamp or date."""
    return str(getattr(value, "date", lambda: value)())


def _map(name: str, function, *args, **kwargs):
    """Run one fan-out job, converting service errors into a value."""
    try:
        return function(name, *args, **kwargs)
    except Exception as exc:  # noqa: BLE001 — one bad region must not fail the set
        return {"error": f"{type(exc).__name__}: {exc}"}


def _fanout(function, names, **kwargs):
    if not names:
        return []
    workers = min(_FANOUT_WORKERS, len(names))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(_map, name, function, **kwargs) for name in names]
        return [future.result() for future in futures]


def _period_or_422(period: str) -> str:
    if period not in rainfall.PERIODS:
        raise HTTPException(
            status_code=400,
            detail={"error": f"Unknown period '{period}'.", "available": rainfall.available_periods()},
        )
    return period


def _round(value, digits=1):
    return None if value is None else round(float(value), digits)


# ---------------------------------------------------------------------------
# Meta / health
# ---------------------------------------------------------------------------
@app.get("/api")
@app.get("/api/", include_in_schema=False)
def root() -> dict[str, Any]:
    """Service metadata.

    Deliberately not mounted on ``/``: when ``dist/`` exists the SPA catch-all
    owns ``/`` so the dashboard opens on the same origin as the API.
    """
    return {
        "name": API_TITLE,
        "version": API_VERSION,
        "docs": "/api/docs",
        "dashboard": "/" if DIST_DIR.is_dir() else None,
        "endpoints": sorted(
            route.path for route in app.routes if getattr(route, "path", "").startswith("/api")
        ),
    }


@app.get("/api/health")
def health() -> dict[str, Any]:
    coverage = dam_data_coverage()
    return {
        "status": "ok",
        "service": "agrisk-api",
        "version": API_VERSION,
        "llm_configured": bool(get_api_key()),
        "climate_source": "Open-Meteo Archive API (ERA5)",
        "dam_source": "AgriRisk dam monitoring dataset",
        "dam_coverage": coverage,
        "governorates": len(TUNISIA_REGIONS),
        "crops": len(crops.crop_names()),
    }


@app.get("/api/reference")
def reference() -> dict[str, Any]:
    return {
        "governorates": region_names(),
        "crops": crops.crop_names(),
        "periods": rainfall.PERIODS,
        "dam_coverage": dam_data_coverage(),
        "risk_levels": ["LOW", "MODERATE", "HIGH", "VERY_HIGH"],
        "exposure_levels": ["LOW", "MODERATE", "HIGH"],
    }


# ---------------------------------------------------------------------------
# Assessment
# ---------------------------------------------------------------------------
@app.get("/api/assessment")
def assessment(
    governorate: str,
    crop: str | None = None,
    period: str = "current",
) -> dict[str, Any]:
    canonical = _canonical(governorate)
    _period_or_422(period)
    return _fail(assess_region(canonical, crop=crop, period=period))


@app.get("/api/national")
def national(period: str = "current") -> dict[str, Any]:
    """National aggregate: every governorate assessed, rolled into one payload.

    One request powers the indicator strip, the watchlist, the map and the
    national charts, instead of the browser fanning out 24 calls itself.
    """
    period = _period_or_422(period)
    return _cached_fanout(f"national:{period}", lambda: _build_national(period))


@app.get("/api/map")
def risk_map(period: str = "current") -> dict[str, Any]:
    """Choropleth payload for the governorate map."""
    return national(period=period)


def _build_national(period: str) -> dict[str, Any]:
    names = region_names()
    results = _fanout(assess_region, names, period=period)

    points: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    for name, result in zip(names, results):
        if "error" in result:
            failures.append({"governorate": name, "error": result["error"]})
            continue
        coords = TUNISIA_REGIONS[name]
        climate = result.get("rainfall") or {}
        water = result.get("water") or {}
        risk = result.get("risk") or {}
        points.append({
            "name": name,
            "latitude": coords[0],
            "longitude": coords[1],
            "risk_level": risk.get("level_code"),
            "risk_label": risk.get("level_label"),
            "risk_category": risk.get("category"),
            "precipitation_mm": climate.get("precipitation_mm"),
            "rainfall_anomaly_pct": climate.get("rainfall_anomaly_pct"),
            "mean_soil_moisture_0_7cm": climate.get("mean_soil_moisture_0_7cm"),
            "et0_total_mm": climate.get("et0_total_mm"),
            "dam_fill_rate_pct": water.get("dam_fill_rate_pct"),
            "fill_status": water.get("fill_status"),
            "worst_dam_name": water.get("worst_dam_name"),
            "region": water.get("region"),
            "data_through": result.get("data_through"),
        })

    return _fail(_national_payload(points, failures, period))


@app.get("/api/map")
def risk_map(period: str = "current") -> dict[str, Any]:
    """Choropleth payload for the governorate map."""
    return national(period=period)


# ---------------------------------------------------------------------------
# Climate
# ---------------------------------------------------------------------------
@app.get("/api/climate")
def climate(period: str = "current") -> dict[str, Any]:
    """Per-governorate climate table: precipitation, soil moisture, ET0, anomaly."""
    period = _period_or_422(period)
    return _cached_fanout(f"climate:{period}", lambda: _build_climate(period))


def _build_climate(period: str) -> dict[str, Any]:
    names = region_names()
    results = _fanout(rainfall.get_rainfall_indicators, names, period=period)

    rows = []
    failures = []
    for name, result in zip(names, results):
        if "error" in result:
            failures.append({"governorate": name, "error": result["error"]})
            continue
        risk = result.get("risk") or {}
        rows.append({
            "governorate": name,
            "latitude": TUNISIA_REGIONS[name][0],
            "longitude": TUNISIA_REGIONS[name][1],
            "precipitation_mm": result.get("precipitation_mm"),
            "precipitation_previous_mm": result.get("precipitation_previous_mm"),
            "rainfall_anomaly_pct": result.get("rainfall_anomaly_pct"),
            "mean_soil_moisture_0_7cm": result.get("mean_soil_moisture_0_7cm"),
            "et0_total_mm": result.get("et0_total_mm"),
            "period_label": result.get("period_label"),
            "data_through": result.get("data_through"),
            "risk_level": risk.get("level_code"),
            "risk_label": risk.get("level_label"),
        })

    return _fail({
        "period": period,
        "periods": rainfall.PERIODS,
        "rows": rows,
        "failures": failures,
        "source": "Open-Meteo Archive API (ERA5 reanalysis) — measured climate data",
    })


# ---------------------------------------------------------------------------
# Water
# ---------------------------------------------------------------------------
@app.get("/api/water")
def water(governorate: str) -> dict[str, Any]:
    return _fail(get_water_indicators(_canonical(governorate)))


@app.get("/api/water/summary")
def water_summary() -> dict[str, Any]:
    """Latest measured row for every monitored dam."""
    dataframe = get_dam_dataframe()
    latest_date = dataframe["Date"].max()
    latest = dataframe[dataframe["Date"] == latest_date]

    rows = []
    for _, row in latest.iterrows():
        previous_inflow = row.get("Previous_Season_Inflow_Mm3")
        current_inflow = row.get("Current_Season_Inflow_Mm3")
        rows.append({
            "dam": row.get("Dam_Name"),
            "governorate": row.get("Governorate_Served"),
            "region": row.get("Region"),
            "capacity_mm3": _round(row.get("Capacity_Mm3"), 2),
            "stock_mm3": _round(row.get("Current_Volume_Mm3"), 2),
            "fill_pct": _round(row.get("Per_Dam_Fill_Rate_Pct"), 2),
            "current_season_inflow_mm3": _round(current_inflow, 2),
            "previous_season_inflow_mm3": _round(previous_inflow, 2),
            "inflow_change_pct": (
                _round(float(current_inflow) / float(previous_inflow) * 100 - 100, 2)
                if previous_inflow
                else None
            ),
        })

    rows.sort(key=lambda item: (item["fill_pct"] is None, item["fill_pct"]))
    return {
        "date": str(latest_date.date()),
        "count": len(rows),
        "rows": rows,
        "source": "AgriRisk dam monitoring dataset — measured monthly reservoir data",
    }


@app.get("/api/water/history")
def water_history(limit: int = Query(default=24, ge=3, le=200)) -> dict[str, Any]:
    """National stock vs three-year average and seasonal inflow, by month."""
    dataframe = get_dam_dataframe()
    frame = dataframe.sort_values("Date")
    dates = sorted(frame["Date"].unique())[-limit:]

    series = []
    for date in dates:
        subset = frame[frame["Date"] == date]
        first = subset.iloc[0]
        series.append({
            "date": _day(date),
            "national_stock_mm3": _round(first.get("National_Total_Stock_Mm3"), 2),
            "three_year_average_mm3": _round(first.get("Three_Year_Average_Stock_Mm3"), 2),
            "last_year_stock_mm3": _round(first.get("Last_Year_Stock_Mm3"), 2),
            "north_mm3": _round(first.get("North_Dams_Total_Mm3"), 2),
            "centre_mm3": _round(first.get("Centre_Dams_Total_Mm3"), 2),
            "cap_bon_mm3": _round(first.get("Cap_Bon_Dams_Total_Mm3"), 2),
            "current_season_inflow_mm3": _round(first.get("Current_Season_Inflow_Mm3"), 2),
            "previous_season_inflow_mm3": _round(first.get("Previous_Season_Inflow_Mm3"), 2),
        })

    return {
        "count": len(series),
        "series": series,
        "source": "AgriRisk dam monitoring dataset — measured monthly reservoir data",
    }


@app.get("/api/water/dams/{dam_name}/history")
def dam_history(dam_name: str, limit: int = Query(default=12, ge=3, le=200)) -> dict[str, Any]:
    """Fill-rate history for one dam, for the sparklines in the water table."""
    dataframe = get_dam_dataframe()
    subset = dataframe[dataframe["Dam_Name"] == dam_name].sort_values("Date")
    if subset.empty:
        raise HTTPException(status_code=404, detail={"error": f"No dam named '{dam_name}'."})

    tail = subset.tail(limit)
    return {
        "dam": dam_name,
        "governorate": str(tail.iloc[-1]["Governorate_Served"]),
        "series": [
            {
                "date": _day(row["Date"]),
                "fill_pct": _round(row["Per_Dam_Fill_Rate_Pct"], 2),
                "stock_mm3": _round(row["Current_Volume_Mm3"], 2),
            }
            for _, row in tail.iterrows()
        ],
    }


# ---------------------------------------------------------------------------
# Crops
# ---------------------------------------------------------------------------
@app.get("/api/crops")
def crop_profiles() -> dict[str, Any]:
    """Reference crop sensitivity profiles (no regional data required)."""
    return {
        "crops": [crops.get_crop_profile(name) for name in crops.crop_names()],
        "source": "AgriRisk crop sensitivity profile — reference agronomic information",
    }


@app.get("/api/crops/exposure")
def crop_exposure(governorate: str, period: str = "current") -> dict[str, Any]:
    """Every profiled crop scored against one governorate's measured conditions."""
    canonical = _canonical(governorate)
    period = _period_or_422(period)
    comparison = crops.compare_crop_exposure(canonical, period=period)
    if "error" in comparison:
        raise HTTPException(status_code=502, detail=comparison)

    profiles = {name: crops.get_crop_profile(name) for name in crops.crop_names()}
    rows = []
    for item in comparison["ranking"]:
        profile = profiles.get(item["crop"], {})
        rows.append({
            "crop": item["crop"],
            "exposure_level": item["exposure_level"],
            "exposure_score": item["exposure_score"],
            "water_need_mm": profile.get("water_need_mm"),
            "drought_sensitivity": profile.get("drought_sensitivity"),
            "season": profile.get("season"),
            "peak_water_demand": profile.get("peak_water_demand"),
            "production_system": profile.get("production_system"),
            "profile_note": profile.get("profile_note"),
        })

    return {
        "governorate": comparison["region"],
        "period_label": comparison["period_label"],
        "climate": comparison["climate"],
        "rows": rows,
        "source": comparison["source"],
        "note": comparison["note"],
    }


# ---------------------------------------------------------------------------
# Scenario
# ---------------------------------------------------------------------------
@app.post("/api/scenario")
def scenario(request: ScenarioRequest) -> dict[str, Any]:
    canonical = _canonical(request.governorate)
    _period_or_422(request.period)
    return _fail(run_rainfall_scenario(
        canonical,
        request.rainfall_change_pct,
        crop=request.crop,
        period=request.period,
    ))


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------
@app.get("/api/reports")
def reports(governorate: str = "Kairouan", crop: str | None = None,
            period: str = "current") -> dict[str, Any]:
    """Report catalogue. Each entry names the endpoint that renders its content."""
    canonical = _canonical(governorate)
    period = _period_or_422(period)
    result = assess_region(canonical, crop=crop, period=period)
    if "error" in result:
        raise HTTPException(status_code=502, detail=result)

    risk = result.get("risk") or {}
    climate_data = result.get("rainfall") or {}
    water = result.get("water") or {}
    stamp = result.get("data_through")

    catalogue = [
        {
            "id": f"assessment-{canonical}",
            "title": f"{canonical} climate risk assessment",
            "kind": "assessment",
            "coverage": canonical,
            "date": stamp,
            "risk_level": risk.get("level_code"),
            "risk_label": risk.get("level_label"),
            "summary": (
                f"{climate_data.get('precipitation_mm')} mm precipitation, "
                f"soil moisture {climate_data.get('mean_soil_moisture_0_7cm')} m3/m3, "
                f"dam fill {water.get('dam_fill_rate_pct')}%"
            ),
        },
        {
            "id": f"water-{canonical}",
            "title": f"{canonical} water resources brief",
            "kind": "water",
            "coverage": canonical,
            "date": water.get("date") or stamp,
            "risk_level": risk.get("level_code"),
            "risk_label": risk.get("level_label"),
            "summary": (
                f"{water.get('worst_dam_name')} at {water.get('dam_fill_rate_pct')}%, "
                f"national stock {water.get('national_stock_mm3')} Mm3"
            ),
        },
    ]
    if crop:
        exposure = result.get("crop_exposure") or {}
        if "error" not in exposure:
            catalogue.append({
                "id": f"crop-{canonical}-{crop}",
                "title": f"{crop} exposure in {canonical}",
                "kind": "crop",
                "coverage": canonical,
                "date": stamp,
                "risk_level": "HIGH" if exposure.get("exposure_level") == "HIGH" else "MODERATE",
                "risk_label": f"{exposure.get('exposure_level')} exposure",
                "summary": f"Exposure score {exposure.get('exposure_score')}/100",
            })

    return {
        "governorate": canonical,
        "period_label": result.get("period_label"),
        "reports": catalogue,
    }


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------
@app.post("/api/chat")
def chat(request: ChatRequest) -> dict[str, Any]:
    canonical = resolve_region(request.governorate) or request.governorate
    context = SessionContext(governorate=canonical, crop=request.crop, period=request.period)
    history = [
        {"role": item.role, "content": item.content}
        for item in request.history[-20:]
        if item.role in {"user", "assistant"} and item.content.strip()
    ]
    result = AgriRiskChatService().respond(request.message, history, context)
    if result.error:
        raise HTTPException(
            status_code=502,
            detail={"error": result.error, "tools_used": result.tools_used},
        )
    return {
        "reply": result.reply,
        "tools_used": result.tools_used,
        "model": result.model,
        "context": context.to_dict(),
    }


# ---------------------------------------------------------------------------
# National aggregation
# ---------------------------------------------------------------------------
def _national_payload(points: list[dict[str, Any]], failures: list[dict[str, str]],
                      period: str) -> dict[str, Any]:
    """Roll per-governorate assessments into the national indicator set."""
    values = [p for p in points if p.get("precipitation_mm") is not None]
    anomalies = [p["rainfall_anomaly_pct"] for p in points if p.get("rainfall_anomaly_pct") is not None]
    soils = [p["mean_soil_moisture_0_7cm"] for p in points if p.get("mean_soil_moisture_0_7cm") is not None]
    fills = [p["dam_fill_rate_pct"] for p in points if p.get("dam_fill_rate_pct") is not None]

    counts: dict[str, int] = {}
    for point in points:
        code = point.get("risk_level") or "UNKNOWN"
        counts[code] = counts.get(code, 0) + 1

    mean_fill = round(sum(fills) / len(fills), 2) if fills else None
    mean_anomaly = round(sum(anomalies) / len(anomalies), 2) if anomalies else None

    return {
        "period": period,
        "periods": rainfall.PERIODS,
        "points": points,
        "failures": failures,
        "coverage": {
            "assessed": len(points),
            "requested": len(points) + len(failures),
            "with_climate_data": len(values),
            "with_dam_data": len(fills),
        },
        "summary": {
            "risk_counts": counts,
            "mean_dam_fill_pct": mean_fill,
            "mean_rainfall_anomaly_pct": mean_anomaly,
            "mean_precipitation_mm": round(sum(p["precipitation_mm"] for p in values) / len(values), 1) if values else None,
            "mean_soil_moisture_0_7cm": round(sum(soils) / len(soils), 3) if soils else None,
            "highest_risk": _highest_risk(points),
        },
    }


def _highest_risk(points: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not points:
        return None
    order = {"VERY_HIGH": 0, "HIGH": 1, "MODERATE": 2, "LOW": 3, "UNKNOWN": 4}
    ranked = sorted(
        (p for p in points if p.get("risk_level")),
        key=lambda p: (order.get(p["risk_level"], 9), p["name"]),
    )
    if not ranked:
        return None
    top = ranked[0]
    return {"governorate": top["name"], "risk_level": top["risk_level"], "risk_label": top.get("risk_label")}


# ---------------------------------------------------------------------------
# Static dashboard (same-origin hosting)
# ---------------------------------------------------------------------------
_ASSETS_DIR = DIST_DIR / "assets"
if _ASSETS_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=_ASSETS_DIR), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str):
    """Serve the built SPA, falling back to index.html for client routes.

    The bundle is resolved per request rather than at import time, so building
    the dashboard after the server has started does not require a restart.
    """
    if full_path == "api" or full_path.startswith("api/"):
        return JSONResponse({"error": "Unknown API route."}, status_code=404)

    if not DIST_DIR.is_dir():
        return JSONResponse(
            {
                "error": "Dashboard bundle not found.",
                "hint": "Run `pnpm build` (or set AGRIRISK_DIST) so `dist/` exists.",
                "api_docs": "/api/docs",
            },
            status_code=503,
        )

    candidate = (DIST_DIR / full_path).resolve() if full_path else None
    if candidate and DIST_DIR.resolve() in candidate.parents and candidate.is_file():
        return FileResponse(candidate)
    return FileResponse(DIST_DIR / "index.html")