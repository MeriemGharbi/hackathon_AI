"""UI behaviour tests for the AI Analyst chat page (AppTest, real API)."""

import importlib
import os
import sys

sys.path.insert(0, os.getcwd())

from streamlit.testing.v1 import AppTest  # noqa: E402

PKG = "agr" + "isk"
session = importlib.import_module(f"{PKG}.chat.session")

PAGE = os.path.join("pages", "1_AI_Risk_Analyst.py")
failures = []


def check(name, condition, detail=""):
  print(f"[{'PASS' if condition else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
  if not condition:
    failures.append(name)


def messages_of(at):
  key = session.SESSION_KEY
  if key not in at.session_state:
    return []
  raw = at.session_state[key]
  return list(raw.get("messages", [])) if isinstance(raw, dict) else []


# --- 1. render -----------------------------------------------------------
at = AppTest.from_file(PAGE, default_timeout=180)
at.run()
check("page renders", not at.exception, str(at.exception))
check("starts with an empty conversation", messages_of(at) == [])
check("shows the intro card", any("Tunisian agricultural climate" in str(m.value)
                                  for m in at.markdown))

# --- 2. a real turn through the chat input (loading -> messages) ---------
at.chat_input[0].set_value("Show me the water indicators for Kairouan").run()
check("page still renders after a turn", not at.exception, str(at.exception))
msgs = messages_of(at)
check("conversation recorded user + assistant turns",
      len(msgs) >= 2 and msgs[0]["role"] == "user" and msgs[-1]["role"] == "assistant",
      str([m["role"] for m in msgs]))
check("assistant turn is not an error", not msgs[-1].get("error"), msgs[-1].get("content", "")[:200])
check("assistant turn lists the grounding tools",
      len(msgs[-1].get("tools", [])) > 0, str(msgs[-1].get("tools")))
check("timestamps are stored", all(m.get("timestamp") for m in msgs))

# --- 3. suggested prompt chip -------------------------------------------
first_chip = None
for button in at.button:
  if str(button.key).startswith("chip_"):
    first_chip = button
    break
if first_chip is not None:
  first_chip.click()
  at.run()
  msgs = messages_of(at)
  check("chip submits a prompt", len(msgs) >= 2 and msgs[-2]["role"] == "user",
        str([m["role"] for m in msgs]))
else:
  check("chip submits a prompt", False, "no chip button found")

# --- 4. clear conversation ----------------------------------------------
for button in at.button:
  if button.label == "Clear conversation":
    button.click()
    at.run()
    break
check("clear conversation empties the window", messages_of(at) == [])
cleared = at.session_state[session.SESSION_KEY] if session.SESSION_KEY in at.session_state else {}
check("clear conversation keeps the selected context",
      isinstance(cleared, dict) and cleared.get("context", {}).get("governorate") == "Kairouan",
      str(cleared.get("context") if isinstance(cleared, dict) else cleared))
check("clear conversation resets the risk badge",
      cleared.get("context", {}).get("latest_risk") is None)
check("context bar renders after clear",
      any("Risk:" in str(m.value) for m in at.markdown))

# --- 5. error state (invalid API key) -----------------------------------
real_key = os.environ.get("GROQ_API_KEY")
os.environ["GROQ_API_KEY"] = "invalid-key-for-ui-test"
try:
  at.chat_input[0].set_value("What is the current risk in Kairouan?").run()
  msgs = messages_of(at)
  last = msgs[-1] if msgs else {}
  check("failed turn is stored as an error message",
        bool(last) and last.get("role") == "assistant" and last.get("error") is True,
        str(last.get("content", ""))[:160])
  check("error state is rendered with st.error", len(at.error) > 0,
        f"{len(at.error)} error elements")
  check("page did not crash on failure", not at.exception, str(at.exception))
finally:
  if real_key:
    os.environ["GROQ_API_KEY"] = real_key

print("\nFAILURES:", failures if failures else "none")
sys.exit(1 if failures else 0)
