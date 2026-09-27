"""Composite AgriRisk assessment — orchestrates the existing services.

One call returns risk classification + rainfall + dam + crop exposure, so the
AI analyst can answer "why is the high risk?" questions from measured data and
model output instead of guessing.
"""

from agrisk.services import crops as crop_service
from agrisk.services import dam as dam_service
from agrisk.services import rainfall as rainfall_service
from agrisk.services.risk_model import apply_rainfall_scenario, classify_climate_risk


def assess_region(governorate, crop=None, period="current"):
  """Full risk assessment for a governorate (+ optional crop)."""
  indicators = rainfall_service.get_rainfall_indicators(governorate, period)
  if "error" in indicators:
    return {"error": indicators["error"], "governorate": governorate}

  risk = classify_climate_risk(
      indicators["precipitation_mm"],
      indicators["mean_soil_moisture_0_7cm"],
      indicators["rainfall_anomaly_pct"],
  )

  water = dam_service.get_water_indicators(governorate)
  water_note = None
  if "error" in water:
    water_note = water["error"]
    water = None

  exposure = None
  if crop:
    exposure = crop_service.assess_crop_exposure_from_indicators(indicators, crop, water)
    if "error" in exposure:
      exposure = exposure if "error" not in indicators else None

  return {
      "governorate": indicators["region"],
      "period": indicators["period"],
      "period_label": indicators["period_label"],
      "data_through": indicators["data_through"],
      "risk": risk,
      "rainfall": indicators,
      "water": water,
      "water_note": water_note,
      "crop_exposure": exposure,
      "sources": [
          indicators["source"],
          "AgriRisk dam monitoring dataset — measured monthly reservoir data",
          "AgriRisk risk model",
      ],
      "note": (
          "Risk level is model output and cannot be changed by conversation; "
          "rainfall and dam figures are measured data; crop exposure is a "
          "regional exposure assessment, not a yield prediction."
      ),
  }


def run_rainfall_scenario(governorate, change_pct, crop=None, period="current"):
  """What-if: re-run risk and exposure models after a rainfall change."""
  assessment = assess_region(governorate, crop, period)
  if "error" in assessment:
    return assessment

  indicators = assessment["rainfall"]
  scenario = apply_rainfall_scenario(
      indicators["precipitation_mm"],
      indicators["mean_soil_moisture_0_7cm"],
      change_pct,
      indicators["rainfall_anomaly_pct"],
  )
  if "error" in scenario:
    return {"error": scenario["error"]}

  exposure_before = assessment.get("crop_exposure")
  exposure_after = None
  if crop and exposure_before and "error" not in exposure_before:
    adjusted = dict(indicators)
    factor = 1.0 + float(change_pct) / 100.0
    adjusted["precipitation_mm"] = round(indicators["precipitation_mm"] * factor, 1)
    adjusted["mean_soil_moisture_0_7cm"] = min(
        0.60, max(0.03, indicators["mean_soil_moisture_0_7cm"] * factor)
    )
    adjusted["rainfall_anomaly_pct"] = (
        round(indicators["rainfall_anomaly_pct"] + float(change_pct), 1)
        if indicators.get("rainfall_anomaly_pct") is not None else None
    )
    exposure_after = crop_service.assess_crop_exposure_from_indicators(
        adjusted, crop, assessment.get("water")
    )

  return {
      "governorate": assessment["governorate"],
      "period_label": assessment["period_label"],
      "scenario": scenario["scenario"],
      "risk_before": scenario["risk_before"],
      "risk_after": scenario["risk_after"],
      "changed": scenario["changed"],
      "drivers_after": scenario["drivers_after"],
      "crop_exposure_before": (
          {"level": exposure_before.get("exposure_level"),
           "score": exposure_before.get("exposure_score")}
          if exposure_before and "error" not in exposure_before else None
      ),
      "crop_exposure_after": (
          {"level": exposure_after.get("exposure_level"),
           "score": exposure_after.get("exposure_score")}
          if exposure_after and "error" not in exposure_after else None
      ),
      "note": scenario["note"],
      "source": "AgriRisk risk model + exposure model (deterministic what-if)",
  }
