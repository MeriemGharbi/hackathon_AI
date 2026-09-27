"""Tool schemas and dispatch for the AgriRisk AI Risk Analyst.

Every tool delegates to the existing AgriRisk services — no duplicated logic,
no numbers produced by the LLM itself.
"""

import json

from agrisk.services import assessment as assessment_service
from agrisk.services import crops as crop_service
from agrisk.services import dam as dam_service
from agrisk.services import rainfall as rainfall_service
from agrisk.regions import region_names

_SECTOR = {
    "type": "string",
    "enum": region_names(),
    "description": "Tunisian governorate, e.g. 'Kairouan', 'Béja', 'Sfax'",
}
_PERIOD = {
    "type": "string",
    "enum": list(rainfall_service.PERIODS.keys()),
    "description": "'current' = last 12 months of data, 'last_year' = same window one year earlier",
}
_CROP = {
    "type": "string",
    "description": "Crop name, e.g. 'Tomato', 'Durum wheat', 'Olive'",
}

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "get_risk_assessment",
            "description": (
                "Full AgriRisk assessment for a governorate: risk model classification "
                "+ drivers, rainfall indicators, dam/water indicators and optional crop "
                "exposure. Use for 'why is the risk high', 'current risk', 'status of X'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "governorate": _SECTOR,
                    "crop": _CROP,
                    "period": _PERIOD,
                },
                "required": ["governorate"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_rainfall_indicators",
            "description": (
                "Measured rainfall, rainfall anomaly vs the previous 12 months, topsoil "
                "moisture and ET0 for a governorate."
            ),
            "parameters": {
                "type": "object",
                "properties": {"governorate": _SECTOR, "period": _PERIOD},
                "required": ["governorate"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_water_indicators",
            "description": (
                "Dam/reservoir indicators: fill rate of the worst dam serving the "
                "governorate, stock vs 3-year average and last year, seasonal inflow change."
            ),
            "parameters": {
                "type": "object",
                "properties": {"governorate": _SECTOR},
                "required": ["governorate"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_crop_exposure",
            "description": (
                "Regional crop exposure assessment (climate + water conditions combined "
                "with the crop sensitivity profile). Not a yield or farm prediction."
            ),
            "parameters": {
                "type": "object",
                "properties": {"governorate": _SECTOR, "crop": _CROP, "period": _PERIOD},
                "required": ["governorate", "crop"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_crop_exposure",
            "description": (
                "Rank all profiled crops by regional exposure for one governorate. "
                "Use for 'which crops are most exposed' / 'compare crops'."
            ),
            "parameters": {
                "type": "object",
                "properties": {"governorate": _SECTOR, "period": _PERIOD},
                "required": ["governorate"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_crop_profile",
            "description": "Reference crop sensitivity profile (water need, sensitivity, season).",
            "parameters": {
                "type": "object",
                "properties": {"crop": _CROP},
                "required": ["crop"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_rainfall_scenario",
            "description": (
                "Deterministic what-if: re-run the risk model (and crop exposure when a "
                "crop is given) after a rainfall change in percent, e.g. -15 for 'rainfall "
                "decreases by 15%'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "governorate": _SECTOR,
                    "change_pct": {
                        "type": "number",
                        "description": "Rainfall change in percent, e.g. -15 or +10",
                    },
                    "crop": _CROP,
                    "period": _PERIOD,
                },
                "required": ["governorate", "change_pct"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_reference_data",
            "description": "List what exists in AgriRisk: governorates, crops or periods.",
            "parameters": {
                "type": "object",
                "properties": {
                    "kind": {
                        "type": "string",
                        "enum": ["regions", "crops", "periods"],
                    }
                },
                "required": ["kind"],
            },
        },
    },
]


def _list_reference(kind):
  kind = (kind or "regions").lower()
  if kind in ("crops", "crop"):
    return {"kind": "crops", "crops": crop_service.crop_names()}
  if kind in ("periods", "period"):
    return {
        "kind": "periods",
        "periods": rainfall_service.PERIODS,
        "note": "Windows are 12 months long; 'current' ends at the latest available data.",
    }
  return {"kind": "regions", "regions": region_names()}


def execute_tool(name, arguments):
  """Run one tool call. Always returns a JSON-serialisable dict."""
  arguments = arguments or {}
  if isinstance(arguments, str):
    try:
      arguments = json.loads(arguments)
    except json.JSONDecodeError:
      return {"error": "Tool arguments were not valid JSON."}
  if not isinstance(arguments, dict):
    return {"error": "Tool arguments must be an object."}

  try:
    if name == "get_risk_assessment":
      return assessment_service.assess_region(
          arguments.get("governorate"),
          crop=arguments.get("crop"),
          period=arguments.get("period", "current"),
      )
    if name == "get_rainfall_indicators":
      return rainfall_service.get_rainfall_indicators(
          arguments.get("governorate"), arguments.get("period", "current")
      )
    if name == "get_water_indicators":
      return dam_service.get_water_indicators(arguments.get("governorate"))
    if name == "get_crop_exposure":
      return crop_service.assess_crop_exposure(
          arguments.get("governorate"),
          arguments.get("crop"),
          period=arguments.get("period", "current"),
      )
    if name == "compare_crop_exposure":
      return crop_service.compare_crop_exposure(
          arguments.get("governorate"), arguments.get("period", "current")
      )
    if name == "get_crop_profile":
      return crop_service.get_crop_profile(arguments.get("crop"))
    if name == "run_rainfall_scenario":
      return assessment_service.run_rainfall_scenario(
          arguments.get("governorate"),
          arguments.get("change_pct"),
          crop=arguments.get("crop"),
          period=arguments.get("period", "current"),
      )
    if name == "list_reference_data":
      return _list_reference(arguments.get("kind"))
    return {"error": f"Unknown tool '{name}'."}
  except Exception as exc:  # tool failures must reach the model as data, not crash the chat
    return {"error": f"{type(exc).__name__}: {exc}"}
