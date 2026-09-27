"""Crop sensitivity profiles and regional crop-exposure assessment.

AgriRisk performs an EXPOSURE ASSESSMENT: regional climate/water conditions
combined with crop-specific sensitivity profiles. It does not predict yields,
farm outcomes, batch failures or financial losses.
"""

import unicodedata

from agrisk.regions import region_names

EXPOSURE_CAVEAT = (
    "Exposure assessment only: regional climate and water conditions combined "
    "with crop sensitivity profiles. Not a prediction of yield, farm, field or "
    "batch outcomes."
)

# drought_sensitivity: 1 = resilient, 5 = very sensitive
# water_need_mm: indicative annual crop water requirement (mm/season)
CROP_PROFILES = {
    "Tomato": {
        "water_need_mm": 600,
        "drought_sensitivity": 4,
        "season": "Spring-summer (Mar-Jul)",
        "peak_water_demand": "Flowering to fruit set",
        "production_system": "Mostly irrigated",
        "profile_note": (
            "Short cycle with high evapotranspiration demand; strongly sensitive "
            "to water stress at flowering and fruit set."
        ),
    },
    "Durum wheat": {
        "water_need_mm": 450,
        "drought_sensitivity": 3,
        "season": "Winter (Nov-May)",
        "peak_water_demand": "Tillering to grain filling",
        "production_system": "Rainfed with irrigated pockets",
        "profile_note": (
            "Main cereal of the Tunisian drylands; yield formation is highly "
            "dependent on spring rainfall distribution."
        ),
    },
    "Barley": {
        "water_need_mm": 350,
        "drought_sensitivity": 2,
        "season": "Winter (Nov-May)",
        "peak_water_demand": "Tillering to heading",
        "production_system": "Mainly rainfed",
        "profile_note": (
            "The most drought-tolerant cereal in Tunisia, widely grown on the "
            "Central and Southern plains."
        ),
    },
    "Olive": {
        "water_need_mm": 400,
        "drought_sensitivity": 2,
        "season": "Perennial, alternate bearing",
        "peak_water_demand": "Fruit development (Jun-Aug)",
        "production_system": "Largely rainfed",
        "profile_note": (
            "Deep-rooted and drought-tolerant, but sustained multi-season "
            "water stress reduces olive yield and oil content."
        ),
    },
    "Date palm": {
        "water_need_mm": 900,
        "drought_sensitivity": 3,
        "season": "Perennial (oasis systems)",
        "peak_water_demand": "Fruit bunch development (May-Jul)",
        "production_system": "Irrigated oasis agriculture",
        "profile_note": (
            "High water requirement; depends on reliable groundwater and oasis "
            "irrigation rather than on reservoir releases alone."
        ),
    },
    "Citrus": {
        "water_need_mm": 900,
        "drought_sensitivity": 4,
        "season": "Perennial, harvest (Nov-Feb)",
        "peak_water_demand": "Fruit swelling (Jun-Sep)",
        "production_system": "Intensively irrigated",
        "profile_note": (
            "Very sensitive to irrigation deficits; even short deficits during "
            "fruit swelling cause quality and size losses."
        ),
    },
    "Grapevine": {
        "water_need_mm": 550,
        "drought_sensitivity": 3,
        "season": "Perennial (Mar-Sep)",
        "peak_water_demand": "Veraison to ripening (Jul-Aug)",
        "production_system": "Irrigated and rainfed vineyards",
        "profile_note": (
            "Moderate deficit can be tolerated deliberately; severe or prolonged "
            "stress shifts balance between vegetative growth and berry quality."
        ),
    },
    "Pepper": {
        "water_need_mm": 550,
        "drought_sensitivity": 4,
        "season": "Spring-summer (Apr-Aug)",
        "peak_water_demand": "Flowering to fruit set",
        "production_system": "Mostly irrigated",
        "profile_note": (
            "Sensitive to heat and water stress around flowering; grown in the "
            "Central and Coastal governorates."
        ),
    },
    "Potato": {
        "water_need_mm": 500,
        "drought_sensitivity": 4,
        "season": "Winter-spring (Oct-Apr)",
        "peak_water_demand": "Tuber initiation to bulking",
        "production_system": "Irrigated",
        "profile_note": (
            "Short cycle with a narrow optimal water window; stress during "
            "tuber initiation reduces marketable yield."
        ),
    },
    "Onion": {
        "water_need_mm": 450,
        "drought_sensitivity": 3,
        "season": "Winter-spring (Oct-Apr)",
        "peak_water_demand": "Bulbing",
        "production_system": "Irrigated",
        "profile_note": (
            "Moderate water demand with a critical bulbing stage; sensitive to "
            "salinity combined with water deficit."
        ),
    },
}


def crop_names():
  return sorted(CROP_PROFILES.keys())


def resolve_crop(name):
  if not isinstance(name, str) or not name.strip():
    return None
  cleaned = name.strip()
  if cleaned in CROP_PROFILES:
    return cleaned

  def _key(text):
    folded = unicodedata.normalize("NFKD", text).lower()
    return "".join(c for c in folded if not unicodedata.combining(c))

  target = _key(cleaned)
  for known in CROP_PROFILES:
    if _key(known) == target:
      return known
  aliases = {
      "tomate": "Tomato", "blé dur": "Durum wheat", "ble dur": "Durum wheat",
      "wheat": "Durum wheat", "orge": "Barley", "olive tree": "Olive",
      "olives": "Olive", "datte": "Date palm", "palmier dattier": "Date palm",
      "agrume": "Citrus", "orange": "Citrus", "vigne": "Grapevine",
      "raisin": "Grapevine", "piment": "Pepper", "chili": "Pepper",
      "pomme de terre": "Potato", "oignon": "Onion",
  }
  if target in aliases:
    return aliases[target]
  for known in CROP_PROFILES:
    if target and (target in _key(known) or _key(known) in target):
      return known
  return None


def get_crop_profile(crop):
  """Reference sensitivity profile for a crop ([profile] information)."""
  canonical = resolve_crop(crop)
  if canonical is None:
    return {"error": f"Unknown crop '{crop}'.", "available_crops": crop_names()}
  profile = dict(CROP_PROFILES[canonical])
  profile.update({
      "crop": canonical,
      "source": "AgriRisk crop sensitivity profile — reference agronomic information",
      "note": EXPOSURE_CAVEAT,
  })
  return profile


def _clamp(value, low=0.0, high=100.0):
  return max(low, min(high, value))


def _score_balance(precip_mm, need_mm):
  if not precip_mm or not need_mm:
    return None
  ratio = float(precip_mm) / float(need_mm)
  return _clamp((1.0 - ratio) / 0.6 * 100.0)


def _score_soil(soil):
  if soil is None:
    return None
  return _clamp((0.30 - float(soil)) / 0.18 * 100.0)


def _score_anomaly(anomaly):
  if anomaly is None:
    return None
  return _clamp((-float(anomaly)) / 40.0 * 100.0)


def _score_water(fill_pct):
  if fill_pct is None:
    return None
  return _clamp((70.0 - float(fill_pct)) / 55.0 * 100.0)


def _level(score):
  if score is None:
    return None
  if score >= 65:
    return "HIGH"
  if score >= 40:
    return "MODERATE"
  return "LOW"


def assess_crop_exposure_from_indicators(indicators, crop, water=None):
  """Combine regional climate/water indicators with a crop sensitivity profile.

  Returns an exposure level (LOW / MODERATE / HIGH), the contributing factors
  and an explicit method description. Never returns yield or farm predictions.
  """
  canonical = resolve_crop(crop)
  if canonical is None:
    return {"error": f"Unknown crop '{crop}'.", "available_crops": crop_names()}
  if not isinstance(indicators, dict) or "error" in indicators:
    return {"error": "Regional climate indicators unavailable for crop exposure."}

  profile = CROP_PROFILES[canonical]
  region = indicators.get("region")

  components = {
      "water_balance": _score_balance(
          indicators.get("precipitation_mm"), profile["water_need_mm"]
      ),
      "soil_moisture": _score_soil(indicators.get("mean_soil_moisture_0_7cm")),
      "rainfall_anomaly": _score_anomaly(indicators.get("rainfall_anomaly_pct")),
      "reservoir_reliability": _score_water(
          (water or {}).get("dam_fill_rate_pct")
      ),
      "crop_sensitivity": (profile["drought_sensitivity"] - 1) / 4 * 100.0,
  }
  weights = {
      "water_balance": 0.30,
      "soil_moisture": 0.20,
      "rainfall_anomaly": 0.15,
      "reservoir_reliability": 0.15,
      "crop_sensitivity": 0.20,
  }

  used = {k: v for k, v in components.items() if v is not None}
  weight_total = sum(weights[k] for k in used)
  if not used or weight_total == 0:
    return {"error": "Not enough indicators to assess crop exposure."}
  score = round(sum(used[k] * weights[k] for k in used) / weight_total, 1)

  factors = []
  labels = {
      "water_balance": (
          "Rainfall vs crop water requirement",
          f"{indicators.get('precipitation_mm')} mm vs {profile['water_need_mm']} mm",
      ),
      "soil_moisture": (
          "Mean topsoil moisture (0-7 cm)",
          str(indicators.get("mean_soil_moisture_0_7cm")),
      ),
      "rainfall_anomaly": (
          "Rainfall anomaly vs previous 12 months",
          f"{indicators.get('rainfall_anomaly_pct')}%",
      ),
      "reservoir_reliability": (
          "Dam fill rate (worst dam serving the governorate)",
          f"{(water or {}).get('dam_fill_rate_pct')}%",
      ),
      "crop_sensitivity": (
          "Crop drought sensitivity",
          f"{profile['drought_sensitivity']}/5",
      ),
  }
  for key, value in used.items():
    name, display = labels[key]
    factors.append({
        "factor": name,
        "value": display,
        "stress_score": round(value, 1),
        "weight": weights[key],
    })
  unavailable = [labels[k][0] for k in components if components[k] is None]

  return {
      "region": region,
      "crop": canonical,
      "exposure_score": score,
      "exposure_level": _level(score),
      "factors": factors,
      "unavailable_factors": unavailable,
      "profile": {
          "water_need_mm": profile["water_need_mm"],
          "drought_sensitivity": profile["drought_sensitivity"],
          "season": profile["season"],
          "peak_water_demand": profile["peak_water_demand"],
          "profile_note": profile["profile_note"],
      },
      "method": (
          "Weighted exposure score: rainfall balance (0.30), soil moisture (0.20), "
          "rainfall anomaly (0.15), reservoir reliability (0.15), crop sensitivity "
          "(0.20). Levels: LOW <40, MODERATE 40-64, HIGH >=65."
      ),
      "period": indicators.get("period_label"),
      "source": "AgriRisk exposure model — regional indicators x crop sensitivity profile",
      "note": EXPOSURE_CAVEAT,
  }


def assess_crop_exposure(governorate, crop, period="current", water=None):
  """Crop exposure for a governorate using live climate (+ optional dam) data."""
  from agrisk.services.rainfall import get_rainfall_indicators

  indicators = get_rainfall_indicators(governorate, period)
  if "error" in indicators:
    return indicators
  if water is None:
    from agrisk.services.dam import get_water_indicators

    water = get_water_indicators(governorate)
    if "error" in water:
      water = None
  return assess_crop_exposure_from_indicators(indicators, crop, water)


def compare_crop_exposure(governorate, period="current", crops=None):
  """Rank every profiled crop by regional exposure for one governorate."""
  from agrisk.services.dam import get_water_indicators
  from agrisk.services.rainfall import get_rainfall_indicators

  indicators = get_rainfall_indicators(governorate, period)
  if "error" in indicators:
    return indicators

  water = get_water_indicators(governorate)
  if "error" in water:
    water = None

  ranking = []
  for name in (crops or crop_names()):
    exposure = assess_crop_exposure_from_indicators(indicators, name, water)
    if "error" in exposure:
      continue
    ranking.append({
        "crop": name,
        "exposure_level": exposure["exposure_level"],
        "exposure_score": exposure["exposure_score"],
        "drought_sensitivity": exposure["profile"]["drought_sensitivity"],
    })
  ranking.sort(key=lambda item: item["exposure_score"], reverse=True)

  return {
      "region": indicators["region"],
      "period_label": indicators["period_label"],
      "ranking": ranking,
      "climate": {
          "precipitation_mm": indicators["precipitation_mm"],
          "rainfall_anomaly_pct": indicators["rainfall_anomaly_pct"],
          "mean_soil_moisture_0_7cm": indicators["mean_soil_moisture_0_7cm"],
          "dam_fill_rate_pct": (water or {}).get("dam_fill_rate_pct"),
      },
      "source": "AgriRisk exposure model — regional indicators x crop sensitivity profiles",
      "note": EXPOSURE_CAVEAT,
  }
