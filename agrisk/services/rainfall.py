"""Rainfall / climate indicators — single source of truth for climate data.

Reuses the Open-Meteo Archive API already used by the AgriRisk dashboard
(`fetch_open_meteo_stats`), extended with period windows, rainfall anomalies
and soil-moisture / ET0 indicators shared by the dashboard and the AI analyst.
"""

import datetime as dt
import threading
import time

import requests

from agrisk.config import CLIMATE_CACHE_TTL_SECONDS, CLIMATE_DATA_LAG_DAYS
from agrisk.regions import resolve_region, region_names, TUNISIA_REGIONS
from agrisk.services.risk_model import classify_climate_risk

OPEN_METEO_URL = "https://archive-api.open-meteo.com/v1/archive"
DAILY_VARS = (
    "precipitation_sum,soil_moisture_0_to_7cm_mean,et0_fao_evapotranspiration_sum"
)

PERIODS = {
    "current": "Current period",
    "last_year": "Last year",
}

_CACHE = {}
_CACHE_LOCK = threading.Lock()

# Open-Meteo is a free public endpoint and rate-limits bursts. The API
# assesses every governorate at once, so a throttled request must be retried
# rather than reported as missing data.
_MAX_ATTEMPTS = 4
_BACKOFF_SECONDS = (1.0, 2.5, 5.0)
_TIMEOUT_SECONDS = 25


def available_periods():
  return list(PERIODS.keys())


def period_label(period):
  return PERIODS.get(period, PERIODS["current"])


def _shift_year(day, years):
  try:
    return day.replace(year=day.year + years)
  except ValueError:  # 29 February
    return day.replace(month=2, day=28, year=day.year + years)


def period_window(period="current"):
  """Return the 12-month windows (current + previous) for a period key."""
  end = dt.date.today() - dt.timedelta(days=CLIMATE_DATA_LAG_DAYS)
  offset = 1 if period == "last_year" else 0
  if offset:
    end = _shift_year(end, -offset)
  start = _shift_year(end, -1) + dt.timedelta(days=1)
  prev_end = start - dt.timedelta(days=1)
  prev_start = _shift_year(prev_end, -1) + dt.timedelta(days=1)
  label = period_label(period)
  return {
      "period": period if period in PERIODS else "current",
      "period_label": label,
      "start": start,
      "end": end,
      "prev_start": prev_start,
      "prev_end": prev_end,
      "display": f"{label} ({start.isoformat()} to {end.isoformat()})",
  }


def _fetch_daily(region, start, end):
  """Fetch one window of daily indicators from Open-Meteo (cached)."""
  key = (region, start.isoformat(), end.isoformat())
  with _CACHE_LOCK:
    cached = _CACHE.get(key)
  if cached and cached[0] > dt.datetime.now().timestamp():
    return cached[1]

  coords = TUNISIA_REGIONS[region]
  params = {
      "latitude": coords[0],
      "longitude": coords[1],
      "start_date": start.isoformat(),
      "end_date": end.isoformat(),
      "daily": DAILY_VARS,
      "timezone": "auto",
  }
  try:
    daily, error = _request_with_retry(params)
  except requests.RequestException as exc:
    return {"error": f"Open-Meteo request failed: {exc}"}
  if error:
    return {"error": error}
  if not daily or not daily.get("time"):
    return {"error": "No daily data returned from Open-Meteo."}

  with _CACHE_LOCK:
    _CACHE[key] = (dt.datetime.now().timestamp() + CLIMATE_CACHE_TTL_SECONDS, daily)
  return daily


def _request_with_retry(params):
  """GET the Open-Meteo archive with backoff on 429 / 5xx / transport errors.

  Returns `(daily_fields, error_message)`; exactly one is set.
  """
  last_error = "unknown error"
  for attempt in range(_MAX_ATTEMPTS):
    try:
      response = requests.get(
          OPEN_METEO_URL, params=params, timeout=_TIMEOUT_SECONDS
      )
    except requests.RequestException as exc:
      last_error = str(exc)
    else:
      if response.status_code == 200:
        return (response.json() or {}).get("daily") or {}, None
      last_error = f"HTTP {response.status_code}: {response.text[:160]}"
      # 4xx other than 429 will not improve on retry.
      if response.status_code < 500 and response.status_code != 429:
        break
    if attempt < len(_BACKOFF_SECONDS):
      time.sleep(_BACKOFF_SECONDS[attempt])

  return None, f"Open-Meteo request failed: {last_error}"


def _values(daily, field):
  return [float(v) for v in daily.get(field, []) if v is not None]


def _window_totals(daily):
  times = daily.get("time", [])
  precip = _values(daily, "precipitation_sum")
  soil = _values(daily, "soil_moisture_0_to_7cm_mean")
  et0 = _values(daily, "et0_fao_evapotranspiration_sum")

  data_through = None
  precip_series = daily.get("precipitation_sum", [])
  for idx in range(len(precip_series) - 1, -1, -1):
    if precip_series[idx] is not None and idx < len(times):
      data_through = times[idx]
      break

  return {
      "precipitation_mm": round(sum(precip), 1) if precip else None,
      "mean_soil_moisture": round(sum(soil) / len(soil), 3) if soil else None,
      "et0_total_mm": round(sum(et0), 1) if et0 else None,
      "coverage_days": len(precip),
      "data_through": data_through,
  }


def get_rainfall_indicators(region, period="current"):
  """Measured rainfall / soil moisture / ET0 indicators for a 12-month window.

  Includes the previous 12-month window so "compare with last year" questions
  are answered from measured data, not from memory.
  """
  canonical = resolve_region(region)
  if canonical is None:
    return {
        "error": f"Unknown governorate '{region}'.",
        "available_regions": region_names(),
    }

  window = period_window(period)
  current = _fetch_daily(canonical, window["start"], window["end"])
  if isinstance(current, dict) and "error" in current:
    return {"error": current["error"], "region": canonical, "period": window["period"]}
  previous = _fetch_daily(canonical, window["prev_start"], window["prev_end"])
  if isinstance(previous, dict) and "error" in previous:
    return {"error": previous["error"], "region": canonical, "period": window["period"]}

  cur = _window_totals(current)
  prev = _window_totals(previous)

  anomaly = None
  if cur["precipitation_mm"] is not None and prev["precipitation_mm"]:
    anomaly = round(
        (cur["precipitation_mm"] - prev["precipitation_mm"]) / prev["precipitation_mm"] * 100,
        1,
    )

  return {
      "source": "Open-Meteo Archive API (ERA5 reanalysis) — measured climate data",
      "region": canonical,
      "period": window["period"],
      "period_label": window["display"],
      "period_start": window["start"].isoformat(),
      "period_end": window["end"].isoformat(),
      "previous_window": f"{window['prev_start'].isoformat()} to {window['prev_end'].isoformat()}",
      "data_through": cur["data_through"],
      "precipitation_mm": cur["precipitation_mm"],
      "precipitation_previous_mm": prev["precipitation_mm"],
      "rainfall_anomaly_pct": anomaly,
      "mean_soil_moisture_0_7cm": cur["mean_soil_moisture"],
      "soil_moisture_previous": prev["mean_soil_moisture"],
      "et0_total_mm": cur["et0_total_mm"],
      "et0_previous_mm": prev["et0_total_mm"],
      "coverage_days": cur["coverage_days"],
  }


def fetch_open_meteo_stats(region, period="current"):
  """Dashboard-compatible climate assessment (legacy keys preserved).

  Same behaviour as before (12-month window, threshold risk labels in French),
  now backed by `get_rainfall_indicators` + `classify_climate_risk` so the
  dashboard and the AI analyst always share one classification.
  """
  indicators = get_rainfall_indicators(region, period)
  if "error" in indicators:
    return {"error": indicators["error"]}

  risk = classify_climate_risk(
      indicators["precipitation_mm"],
      indicators["mean_soil_moisture_0_7cm"],
      indicators["rainfall_anomaly_pct"],
  )

  return {
      "region": indicators["region"],
      "analyzed_year": int(indicators["period_end"][:4]),
      "period": indicators["period_label"],
      "period_start": indicators["period_start"],
      "period_end": indicators["period_end"],
      "data_through": indicators["data_through"],
      "total_precipitation_mm": indicators["precipitation_mm"],
      "previous_precipitation_mm": indicators["precipitation_previous_mm"],
      "rainfall_anomaly_pct": indicators["rainfall_anomaly_pct"],
      "mean_soil_moisture": indicators["mean_soil_moisture_0_7cm"],
      "et0_total_mm": indicators["et0_total_mm"],
      "risk_level": risk["risk_level"],
      "risk_level_code": risk["level_code"],
      "recommended_action": risk["recommended_action"],
      "risk_drivers": risk["drivers"],
      "source": indicators["source"],
      "indicators": indicators,
      "risk": risk,
  }
