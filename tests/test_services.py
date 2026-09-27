"""Unit tests for AgriRisk services + chat plumbing (no network, no API key)."""

import importlib
import os
import sys

sys.path.insert(0, os.getcwd())

PKG = "agr" + "isk"
failures = []


def check(name, condition, detail=""):
  print(f"[{'PASS' if condition else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
  if not condition:
    failures.append(name)


session = importlib.import_module(f"{PKG}.chat.session")
prompts = importlib.import_module(f"{PKG}.chat.prompts")
tools = importlib.import_module(f"{PKG}.chat.tools")
risk_model = importlib.import_module(f"{PKG}.services.risk_model")
rainfall = importlib.import_module(f"{PKG}.services.rainfall")
dam = importlib.import_module(f"{PKG}.services.dam")
crops = importlib.import_module(f"{PKG}.services.crops")
assessment = importlib.import_module(f"{PKG}.services.assessment")

# --- 1. bounded conversation window -------------------------------------
history = []
for i in range(15):
  history.append(session.new_message("user", f"question {i}"))
  history.append(session.new_message("assistant", f"answer {i}"))
history.append(session.new_message("assistant", "failed turn", error=True))
trimmed = session.trim_history(history, max_exchanges=10)
check("history bounded to 10 exchanges", len(trimmed) <= 20, f"{len(trimmed)} msgs")
check("history starts with a user turn", trimmed[0]["role"] == "user")
check("history keeps the newest turns", trimmed[-1]["content"] == "answer 14")
check("history drops error notices",
      not any(m.get("error") for m in trimmed))

llm_msgs = session.history_for_llm(history + [session.new_message("user", "next")])
check("history_for_llm returns only role/content",
      all(set(m) == {"role", "content"} for m in llm_msgs))
check("LLM payload excludes turns outside the window",
      not any("question 0" in m["content"] for m in llm_msgs)
      and any("answer 14" in m["content"] for m in llm_msgs))

# --- 2. session context --------------------------------------------------
ctx = session.SessionContext(governorate="Kairouan", crop="Tomato", period="current")
check("context bar format",
      ctx.context_bar() == "Kairouan · Tomato · Current period · Risk: —",
      ctx.context_bar())
snapshot = ctx.snapshot_block()
check("snapshot marks missing data instead of inventing it",
      "not available yet" in snapshot)
ctx.update_from_tool("get_rainfall_indicators", {
    "region": "Kairouan", "precipitation_mm": 319.4, "rainfall_anomaly_pct": -13.2,
})
ctx.update_from_tool("get_rainfall_indicators", {"error": "boom"})
check("tool errors do not overwrite context", ctx.latest_rainfall.get("precipitation_mm") == 319.4)

# --- 3. risk model (legacy thresholds preserved) --------------------------
dry = risk_model.classify_climate_risk(80, 0.12)
check("legacy high-drought threshold",
      dry["level_code"] == "HIGH" and dry["risk_level"] == "Risque de Sécheresse Élevé",
      dry["risk_level"])
critical = risk_model.classify_climate_risk(50, 0.08)
check("very-high drought band exists",
      critical["level_code"] == "VERY_HIGH"
      and critical["risk_level"] == "Risque de Sécheresse Très Élevé",
      critical["risk_level"])
normal = risk_model.classify_climate_risk(300, 0.25)
check("legacy normal case", normal["level_code"] == "LOW" and normal["risk_level"] == "Normal")
flood = risk_model.classify_climate_risk(700, 0.30)
check("legacy flood threshold",
      flood["level_code"] == "HIGH" and flood["risk_level"] == "Risque d'Excès d'Eau / Inondation",
      flood["risk_level"])
check("risk model marked immutable", dry.get("modifiable") is False)
check("drivers cite measured indicators",
      any("Precipitation" in d["indicator"] for d in dry["drivers"]))

scenario = risk_model.apply_rainfall_scenario(319.4, 0.158, -15, -13.2)
check("scenario changes classification when applicable",
      scenario["changed"] is True and scenario["risk_after"]["level_code"] == "HIGH",
      f"{scenario['risk_before']['level_code']} -> {scenario['risk_after']['level_code']}")
check("scenario labelled as model output", "[model]" in scenario["note"])

# --- 4. crop exposure claims --------------------------------------------
exposure = crops.assess_crop_exposure_from_indicators(
    {"region": "Kairouan", "precipitation_mm": 319.4,
     "mean_soil_moisture_0_7cm": 0.158, "rainfall_anomaly_pct": -13.2,
     "period_label": "Current period"},
    "Tomato",
    {"dam_fill_rate_pct": 31.2},
)
check("exposure has a level and a score",
      exposure["exposure_level"] in ("LOW", "MODERATE", "HIGH")
      and isinstance(exposure["exposure_score"], float))
check("exposure denies yield/farm predictions",
      "Not a prediction of yield" in exposure["note"])
for forbidden in ("yield_prediction", "farm_outcome", "batch_failure", "tonnage"):
  check(f"exposure has no '{forbidden}' field", forbidden not in exposure)
check("exposure lists factors", len(exposure["factors"]) >= 3)
check("unknown crop returns an error",
      "error" in crops.assess_crop_exposure_from_indicators(
          {"region": "X", "precipitation_mm": 1}, "Unicorn", None))

# --- 5. missing dam data -------------------------------------------------
sfax = dam.get_water_indicators("Sfax")
check("missing dam data returns an error dict", "error" in sfax)
check("missing dam data lists what is available",
      "available_governorates" in sfax and "Kairouan" in sfax["available_governorates"])
kairouan = dam.get_water_indicators("Kairouan")
check("dam indicators expose fill rate",
      kairouan.get("dam_fill_rate_pct") is not None
      and kairouan.get("seasonal_inflow_change_pct") is not None)

# --- 6. tool dispatch ----------------------------------------------------
unknown = tools.execute_tool("does_not_exist", {})
check("unknown tool -> error", "error" in unknown)
bad_args = tools.execute_tool("get_risk_assessment", "{not json")
check("malformed tool args -> error", "error" in bad_args)
ref = tools.execute_tool("list_reference_data", {"kind": "crops"})
check("list_reference_data returns crops", "Tomato" in ref.get("crops", []))
unknown_region = tools.execute_tool("get_rainfall_indicators", {"governorate": "Atlantis"})
check("unknown governorate -> error", "error" in unknown_region)

# --- 7. rainfall periods -------------------------------------------------
window = rainfall.period_window("current")
check("current window is ~12 months", 360 <= (window["end"] - window["start"]).days <= 367,
      f"{(window['end'] - window['start']).days} days")
check("previous window ends before current",
      window["prev_end"] < window["start"])

# --- 8. system prompt guarantees ----------------------------------------
prompt = prompts.SYSTEM_PROMPT
check("prompt defines the exact off-scope sentence",
      prompts.OFF_SCOPE_SENTENCE.replace(" ", "") in prompt.replace("\n", " ").replace(" ", ""))
check("prompt forbids hallucinated numbers", "Never invent" in prompt)
check("prompt protects the risk classification", "NEVER change" in prompt)
check("prompt limits crop claims", "yield" in prompt)
check("prompt enforces provenance labels",
      all(tag in prompt for tag in ("[measured]", "[model]", "[profile]", "[interpretation]")))

# --- 9. composite assessment --------------------------------------------
full = assessment.assess_region("Kairouan", crop="Tomato")
check("assessment returns risk + rainfall + water + exposure",
      all(k in full for k in ("risk", "rainfall", "water", "crop_exposure")))
check("assessment sources are documented", len(full["sources"]) >= 3)

# --- 10. multi-crop ranking ----------------------------------------------
ranking = crops.compare_crop_exposure("Kairouan")
scores = [item["exposure_score"] for item in ranking.get("ranking", [])]
check("crop ranking covers most profiles", len(scores) >= 8, f"{len(scores)} crops")
check("crop ranking is sorted by exposure",
      scores == sorted(scores, reverse=True))
check("crop ranking carries the exposure caveat", "Not a prediction of yield" in ranking["note"])

print()
print("FAILURES:", failures if failures else "none")
sys.exit(1 if failures else 0)
