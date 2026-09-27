"""AgriRisk risk model — the single source of truth for risk classification.

The model is deterministic and threshold based. Both the dashboard and the AI
Risk Analyst read its output; neither the dashboard UI nor the LLM may change a
classification — they may only explain it.

If a TabPFN / ML classifier is plugged in later, expose it through
`classify_climate_risk()` so every consumer keeps working unchanged.
"""

# Level codes used across the app (chat context bar, dashboard, tools)
LEVEL_LOW = "LOW"
LEVEL_MODERATE = "MODERATE"
LEVEL_HIGH = "HIGH"
LEVEL_VERY_HIGH = "VERY_HIGH"

LEVEL_ORDER = [LEVEL_LOW, LEVEL_MODERATE, LEVEL_HIGH, LEVEL_VERY_HIGH]

LEVEL_LABEL_EN = {
    LEVEL_LOW: "LOW",
    LEVEL_MODERATE: "MODERATE",
    LEVEL_HIGH: "HIGH",
    LEVEL_VERY_HIGH: "VERY HIGH",
}

# Classification rules (window = 12 months of precipitation + mean topsoil moisture)
# Dryness is evaluated first, then water excess — matching the legacy dashboard rules.


def _dry_trigger(p, s, soil_threshold, precip_threshold):
  """Explain precisely which dryness indicator triggered the level."""
  hits = []
  if s < soil_threshold:
    hits.append(f"soil_moisture={s:.3f} < {soil_threshold}")
  if p < precip_threshold:
    hits.append(f"precipitation={p:.0f} mm < {precip_threshold} mm")
  return "; ".join(hits) or f"within {soil_threshold} / {precip_threshold} thresholds"


def _wet_trigger(p, s, precip_threshold, soil_threshold=None):
  hits = [f"precipitation={p:.0f} mm > {precip_threshold} mm"]
  if soil_threshold is not None and s > soil_threshold:
    hits.append(f"soil_moisture={s:.3f} > {soil_threshold}")
  return " and ".join(hits)


RULES = [
    {
        "level": LEVEL_VERY_HIGH,
        "category": "drought",
        "label_en": "Very high drought risk",
        "label_fr": "Risque de Sécheresse Très Élevé",
        "action_fr": "Ajustement suggéré : Hausse de prime de 25% / Revue des engagements",
        "condition": lambda p, s: s < 0.10 or p < 60,
        "trigger": lambda p, s: _dry_trigger(p, s, 0.10, 60),
    },
    {
        "level": LEVEL_HIGH,
        "category": "drought",
        "label_en": "High drought risk",
        "label_fr": "Risque de Sécheresse Élevé",
        "action_fr": (
            "Ajustement suggéré : Hausse de prime de 15% / Prudence sur les prêts agricoles"
        ),
        "condition": lambda p, s: s < 0.15 or p < 100,
        "trigger": lambda p, s: _dry_trigger(p, s, 0.15, 100),
    },
    {
        "level": LEVEL_MODERATE,
        "category": "drought",
        "label_en": "Moderate drought risk",
        "label_fr": "Risque de Sécheresse Modéré",
        "action_fr": "Ajustement suggéré : Surveillance rapprochée / Révision de la couverture",
        "condition": lambda p, s: s < 0.19 or p < 160,
        "trigger": lambda p, s: _dry_trigger(p, s, 0.19, 160),
    },
    {
        "level": LEVEL_VERY_HIGH,
        "category": "water_excess",
        "label_en": "Very high water-excess risk",
        "label_fr": "Risque d'Excès d'Eau Critique",
        "action_fr": "Ajustement suggéré : Suspension des nouvelles garanties / Contrôle des inondations",
        "condition": lambda p, s: p > 900,
        "trigger": lambda p, s: _wet_trigger(p, s, 900),
    },
    {
        "level": LEVEL_HIGH,
        "category": "water_excess",
        "label_en": "High water-excess / flood risk",
        "label_fr": "Risque d'Excès d'Eau / Inondation",
        "action_fr": "Ajustement suggéré : Vérification du drainage / Garantie requise",
        "condition": lambda p, s: p > 600,
        "trigger": lambda p, s: _wet_trigger(p, s, 600),
    },
    {
        "level": LEVEL_MODERATE,
        "category": "water_excess",
        "label_en": "Moderate water-excess risk",
        "label_fr": "Risque d'Excès d'Eau Modéré",
        "action_fr": "Ajustement suggéré : Vérification du drainage",
        "condition": lambda p, s: p > 500 and s > 0.32,
        "trigger": lambda p, s: _wet_trigger(p, s, 500, 0.32),
    },
]

DEFAULT_RULE = {
    "level": LEVEL_LOW,
    "category": "normal",
    "label_en": "Normal",
    "label_fr": "Normal",
    "action_fr": "Terms Standard (Favorable)",
    "trigger": lambda p, s: "precipitation and soil moisture within normal ranges",
}


def classify_climate_risk(precipitation_mm, soil_moisture, rainfall_anomaly_pct=None):
  """Classify agricultural climate risk from a 12-month window of indicators.

  Returns a dict describing the classification (level code, labels, action and
  the drivers that triggered it). This output is model output — it may be
  explained, never overwritten.
  """
  try:
    precip = float(precipitation_mm)
    soil = float(soil_moisture)
  except (TypeError, ValueError):
    return {
        "error": "Risk model requires numeric precipitation and soil moisture values.",
        "level_code": None,
    }

  rule = DEFAULT_RULE
  for candidate in RULES:
    if candidate["condition"](precip, soil):
      rule = candidate
      break

  drivers = [
      {
          "indicator": "Precipitation (12 months)",
          "value": f"{precip:.0f} mm",
          "signal": rule["trigger"](precip, soil),
      },
      {
          "indicator": "Mean topsoil moisture (0-7 cm)",
          "value": f"{soil:.2f}",
          "signal": "measured over the analysed window",
      },
  ]
  if rainfall_anomaly_pct is not None:
    try:
      anomaly = float(rainfall_anomaly_pct)
      drivers.append({
          "indicator": "Rainfall anomaly vs previous 12 months",
          "value": f"{anomaly:+.0f}%",
          "signal": "measured comparison with the previous window",
      })
    except (TypeError, ValueError):
      pass

  return {
      "level_code": rule["level"],
      "level_label": LEVEL_LABEL_EN[rule["level"]],
      "category": rule["category"],
      "label_en": rule["label_en"],
      # Legacy dashboard field names — kept identical on purpose
      "risk_level": rule["label_fr"],
      "recommended_action": rule["action_fr"],
      "drivers": drivers,
      "source": "AgriRisk risk model (threshold rules on 12-month climate indicators)",
      "modifiable": False,
  }


def apply_rainfall_scenario(precipitation_mm, soil_moisture, change_pct,
                            rainfall_anomaly_pct=None):
  """Re-run the risk model on a hypothetical rainfall change (scenario only).

  Deterministic what-if: never presented as a forecast or a measurement.
  """
  try:
    precip = float(precipitation_mm)
    soil = float(soil_moisture)
    change = float(change_pct)
  except (TypeError, ValueError):
    return {"error": "Scenario requires numeric precipitation, soil moisture and change %."}

  factor = 1.0 + change / 100.0
  scenario_precip = max(0.0, precip * factor)
  scenario_soil = min(0.60, max(0.03, soil * factor))
  scenario_anomaly = None
  if rainfall_anomaly_pct is not None:
    try:
      scenario_anomaly = float(rainfall_anomaly_pct) + change
    except (TypeError, ValueError):
      scenario_anomaly = None

  before = classify_climate_risk(precip, soil, rainfall_anomaly_pct)
  after = classify_climate_risk(scenario_precip, scenario_soil, scenario_anomaly)

  return {
      "scenario": {
          "rainfall_change_pct": change,
          "precipitation_mm_before": round(precip, 1),
          "precipitation_mm_after": round(scenario_precip, 1),
          "soil_moisture_before": round(soil, 3),
          "soil_moisture_after": round(scenario_soil, 3),
          "rainfall_anomaly_pct_after": round(scenario_anomaly, 1) if scenario_anomaly is not None else None,
      },
      "risk_before": {k: before.get(k) for k in ("level_code", "level_label", "risk_level", "category")},
      "risk_after": {k: after.get(k) for k in ("level_code", "level_label", "risk_level", "category")},
      "drivers_after": after.get("drivers", []),
      "changed": before.get("level_code") != after.get("level_code"),
      "note": "[model] Scenario output of the AgriRisk risk model — a deterministic what-if, not a forecast and not measured data.",
      "source": "AgriRisk risk model",
  }
