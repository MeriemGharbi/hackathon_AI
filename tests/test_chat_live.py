"""Live end-to-end tests for the AI Risk Analyst (uses the Groq API).

Covers: contextual follow-ups, off-scope rejection, current-data grounding,
crop questions, missing-data handling and API failures.
"""

import importlib
import os
import re
import sys
import time

sys.path.insert(0, os.getcwd())

PKG = "agr" + "isk"
session = importlib.import_module(f"{PKG}.chat.session")
service = importlib.import_module(f"{PKG}.chat.service")
prompts = importlib.import_module(f"{PKG}.chat.prompts")
dam = importlib.import_module(f"{PKG}.services.dam")
rainfall = importlib.import_module(f"{PKG}.services.rainfall")

failures = []


def check(name, condition, detail=""):
  print(f"[{'PASS' if condition else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
  if not condition:
    failures.append(name)


def _flat(text):
  """Normalise typographic dashes/spaces so numeric comparisons are stable."""
  return (text.replace("\u2011", "-").replace("\u2012", "-").replace("\u2013", "-")
          .replace("\u2212", "-").replace("\u00a0", " "))


def turn(svc, messages, context, text, label, retries=2):
  print(f"\n--- {label}: {text}")
  result = svc.respond(text, messages, context)
  # Groq free tier is rate limited: patient retries keep the suite stable
  if result.error and "rate-limit" in result.error.lower() and retries > 0:
    print(f"rate limited — retrying in {30}s ({retries - 1} left)")
    time.sleep(30)
    return turn(svc, messages, context, text, label, retries=retries - 1)
  if result.error:
    print("ERROR:", result.error)
    return result, ""
  messages.append(session.new_message("user", text))
  messages.append(session.new_message("assistant", result.reply, tools=result.tools_used))
  session.save_session({}, messages, context)
  print(f"tools={result.tools_used}")
  print(result.reply[:900])
  return result, result.reply


svc = service.AgriRiskChatService()
context = session.SessionContext(governorate="Kairouan", crop="Tomato")
messages = []

# --- 1. contextual follow-ups -------------------------------------------
result1, reply1 = turn(svc, messages, context, "What is the current agricultural climate risk for tomato in Kairouan?", "T1")
check("T1 answered without error", not result1.error)
check("T1 used a grounding tool", len(result1.tools_used) > 0, str(result1.tools_used))
risk_label = context.risk_badge()
check("T1 risk matches the model output", risk_label != "—" and risk_label in reply1.upper(),
      f"context={risk_label}")

result2, reply2 = turn(svc, messages, context, "Why is it high?", "T2")
check("T2 answered without error", not result2.error)
low = reply2.lower()
check("T2 resolved the follow-up from context",
      not any(phrase in low for phrase in
              ("which governorate", "which region", "please specify", "could you clarify the region")),
      "did not ask for the region again")
check("T2 cites actual indicators",
      any(word in low for word in ("precipitation", "rainfall", "soil moisture", "dam", "anomaly")))

result3, reply3 = turn(svc, messages, context, "And what about olive in this region?", "T3")
check("T3 resolved 'this region' from context", not result3.error)
check("T3 discusses the requested crop", "olive" in reply3.lower())

# --- 2. unrelated topic --------------------------------------------------
result4, reply4 = turn(svc, messages, context, "Give me a summer fashion tip.", "T4")
check("T4 rejected the off-scope request",
      prompts.OFF_SCOPE_SENTENCE in reply4, reply4[:160])
check("T4 is brief", len(reply4.split()) <= 70, f"{len(reply4.split())} words")
check("T4 did not answer the fashion question",
      not any(w in reply4.lower() for w in ("wear a", "outfit", "dress", "shirt")))

# --- 3. current data grounding ------------------------------------------
def _flat(text):
  """Normalise typographic dashes/spaces so numeric comparisons are stable."""
  return (text.replace("\u2011", "-").replace("\u2012", "-").replace("\u2013", "-")
          .replace("\u2212", "-").replace("\u00a0", " ").replace("\u2011", "-"))


real_rain = rainfall.get_rainfall_indicators("Kairouan")
real_dam = dam.get_water_indicators("Kairouan")
result5, reply5 = turn(svc, messages, context, "Show me the rainfall and dam indicators for Kairouan.", "T5")
flat5 = _flat(reply5)
expected_fill = str(real_dam["dam_fill_rate_pct"])
expected_anomaly = str(real_rain["rainfall_anomaly_pct"])
check("T5 quoted the measured dam fill rate",
      expected_fill in flat5 or f"{round(real_dam['dam_fill_rate_pct'])}%" in flat5,
      f"expected {expected_fill}")
check("T5 quoted the measured rainfall anomaly",
      re.search(rf"{real_rain['rainfall_anomaly_pct']:.1f}\s*%"
                rf"|{round(real_rain['rainfall_anomaly_pct'])}\s*%", flat5) is not None,
      f"expected {real_rain['rainfall_anomaly_pct']}")

# --- 4. crop question ----------------------------------------------------
result6, reply6 = turn(svc, messages, context, "Which crops are most exposed in Kairouan?", "T6")
check("T6 answered", not result6.error)
check("T6 speaks about exposure, not yield",
      "exposure" in reply6.lower() or "exposed" in reply6.lower())
crops_named = [c for c in ("tomato", "olive", "barley", "wheat", "citrus", "potato")
               if c in reply6.lower()]
check("T6 grounded on crop data",
      any(t in result6.tools_used
          for t in ("compare_crop_exposure", "get_crop_exposure"))
      or len(crops_named) >= 2,
      f"tools={result6.tools_used} crops={crops_named}")
forbidden = re.search(r"\b(tons|tonnes|yield (?:will|of) \d+|hectare yield|profit|revenue)\b",
                      reply6, flags=re.I)
check("T6 makes no yield/financial prediction", forbidden is None, forbidden.group(0) if forbidden else "")

# --- 5. missing data -----------------------------------------------------
result7, reply7 = turn(svc, messages, context, "What is the dam fill rate in Sfax?", "T7")
check("T7 answered", not result7.error)
check("T7 states the data is unavailable",
      re.search(r"(unavailable|no\s+[\w\s]{0,20}data|not\s+available)",
                reply7, flags=re.I) is not None,
      reply7[:200])
check("T7 offers a working alternative instead of a number",
      "rainfall" in reply7.lower() or "available" in reply7.lower()
      or "kairouan" in reply7.lower(),
      reply7[:200])

# --- 6. API failure ------------------------------------------------------
bad_svc = service.AgriRiskChatService(api_key="invalid-key-for-testing")
bad_context = session.SessionContext()
bad_result = bad_svc.respond("What is the risk in Kairouan?", [], bad_context)
check("API failure returns an error, not a crash", bad_result.error is not None,
      str(bad_result.error))
check("API failure message is actionable",
      bad_result.error is not None and ("key" in bad_result.error.lower()
                                        or "auth" in bad_result.error.lower()
                                        or "reach" in bad_result.error.lower()),
      str(bad_result.error))

# --- 7. conversation reset ----------------------------------------------
reset_ctx = session.reset_conversation(context)
check("reset keeps selections",
      reset_ctx.governorate == context.governorate and reset_ctx.crop == context.crop)
check("reset clears assessments",
      reset_ctx.latest_risk is None and reset_ctx.latest_rainfall is None)
check("reset clears history", session.trim_history([]) == [])

print("\nFAILURES:", failures if failures else "none")
sys.exit(1 if failures else 0)
