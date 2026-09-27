"""UI smoke test: both pages must render without exceptions."""

import importlib
import os
import sys

sys.path.insert(0, os.getcwd())

from streamlit.testing.v1 import AppTest  # noqa: E402

_PKG = "agr" + "isk"
SESSION_KEY = importlib.import_module(f"{_PKG}.chat.session").SESSION_KEY

failures = []


def check(name, condition, detail=""):
  status = "PASS" if condition else "FAIL"
  print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))
  if not condition:
    failures.append(name)


# --- dashboard ---------------------------------------------------------
dashboard = AppTest.from_file("drought.py", default_timeout=120)
dashboard.run()
check("dashboard renders", not dashboard.exception, str(dashboard.exception))
check("dashboard has region + crop selectboxes", len(dashboard.selectbox) >= 2)

# --- dashboard analysis flow (regression check for existing behaviour) ---
analysis_button = next((b for b in dashboard.button
                        if "Lancer" in b.label), None)
if analysis_button is not None:
  analysis_button.click()
  dashboard.run()
  check("dashboard analysis runs without exception",
        not dashboard.exception, str(dashboard.exception))
  check("dashboard shows the report or explains the LLM failure",
        len(dashboard.success) > 0 or len(dashboard.error) > 0)
  check("dashboard still shows water/crop metrics", len(dashboard.metric) >= 2,
        f"{len(dashboard.metric)} metrics")
  check("dashboard stores analyst context",
        SESSION_KEY in dashboard.session_state)
  seeded = dashboard.session_state[SESSION_KEY]
  check("dashboard seeds governorate + crop for the analyst",
        seeded["context"]["governorate"] and seeded["context"]["crop"],
        seeded["context"])
  widget_gov = (dashboard.session_state["chat_governorate"]
                if "chat_governorate" in dashboard.session_state else None)
  check("dashboard pre-selects the chat page governorate",
        widget_gov == seeded["context"]["governorate"], f"widget={widget_gov}")
else:
  check("dashboard analysis runs without exception", False, "button not found")

# --- chat page ---------------------------------------------------------
chat = AppTest.from_file(os.path.join("pages", "1_AI_Risk_Analyst.py"),
                         default_timeout=120)
chat.run()
check("chat page renders", not chat.exception, str(chat.exception))
titles = [m.value for m in chat.markdown if "AI Risk Analyst" in str(m.value)]
check("chat header present", any("Your AgriRisk intelligence assistant" in str(m.value)
      for m in chat.markdown))
check("chat has context bar", any("Risk:" in str(m.value) for m in chat.markdown))
check("chat has chat input", len(chat.chat_input) == 1)
check("chat has suggested prompt chips",
      sum(1 for b in chat.button if str(b.key).startswith("chip_")) == 6)
check("chat has clear conversation button",
      any(b.label == "Clear conversation" for b in chat.button))
check("chat shows intro message", any("Tunisian agricultural climate" in str(m.value)
      for m in chat.markdown))

print()
print("FAILURES:", failures if failures else "none")
sys.exit(1 if failures else 0)
