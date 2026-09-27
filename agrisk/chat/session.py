"""Conversation state and structured session context for the AI Risk Analyst.

Kept in Streamlit session state by the chat page:
  - bounded conversation window (last ~10 exchanges)
  - structured context: governorate, crop, period, latest assessments
"""

import datetime as dt
import json

from agrisk.config import MAX_HISTORY_EXCHANGES
from agrisk.regions import region_names
from agrisk.services.crops import crop_names
from agrisk.services.rainfall import PERIODS, period_label

SESSION_KEY = "agririsk_analyst_session"

# Session-state keys of the chat page selectors, so the dashboard can pre-select
# the governorate/crop it just analysed.
WIDGET_KEYS = {
    "governorate": "chat_governorate",
    "crop": "chat_crop",
    "period": "chat_period",
}


def sync_selectors(state, governorate, crop, period):
  """Push a selection made elsewhere (dashboard) into the chat page widgets."""
  for field, value in (("governorate", governorate), ("crop", crop), ("period", period)):
    if value:
      state[WIDGET_KEYS[field]] = value


def _now():
  return dt.datetime.now().strftime("%H:%M")


def _iso_now():
  return dt.datetime.now().isoformat(timespec="seconds")


class SessionContext:
  """Structured context resolved for follow-up questions."""

  def __init__(self, governorate=None, crop=None, period="current", **latest):
    self.governorate = governorate or "Kairouan"
    self.crop = crop or "Tomato"
    self.period = period if period in PERIODS else "current"
    self.latest_risk = latest.get("latest_risk")
    self.latest_rainfall = latest.get("latest_rainfall")
    self.latest_dam = latest.get("latest_dam")
    self.latest_crop_exposure = latest.get("latest_crop_exposure")
    self.updated_at = latest.get("updated_at")

  # --- serialisation -----------------------------------------------------
  def to_dict(self):
    return {
        "governorate": self.governorate,
        "crop": self.crop,
        "period": self.period,
        "period_label": period_label(self.period),
        "latest_risk": self.latest_risk,
        "latest_rainfall": self.latest_rainfall,
        "latest_dam": self.latest_dam,
        "latest_crop_exposure": self.latest_crop_exposure,
        "updated_at": self.updated_at,
    }

  @classmethod
  def from_dict(cls, data):
    data = data or {}
    return cls(
        governorate=data.get("governorate"),
        crop=data.get("crop"),
        period=data.get("period", "current"),
        latest_risk=data.get("latest_risk"),
        latest_rainfall=data.get("latest_rainfall"),
        latest_dam=data.get("latest_dam"),
        latest_crop_exposure=data.get("latest_crop_exposure"),
        updated_at=data.get("updated_at"),
    )

  # --- context bar -------------------------------------------------------
  @property
  def period_label(self):
    return period_label(self.period)

  def risk_badge(self):
    if not self.latest_risk:
      return "—"
    return self.latest_risk.get("level_label") or self.latest_risk.get("level_code") or "—"

  def context_bar(self):
    return f"{self.governorate} · {self.crop} · {self.period_label} · Risk: {self.risk_badge()}"

  # --- tool results ------------------------------------------------------
  def update_from_tool(self, tool_name, result):
    """Persist the latest assessments produced by a tool call."""
    if not isinstance(result, dict) or "error" in result:
      return
    if tool_name in ("get_risk_assessment", "run_rainfall_scenario"):
      if isinstance(result.get("risk"), dict):
        self.latest_risk = result["risk"]
      if isinstance(result.get("rainfall"), dict):
        self.latest_rainfall = result["rainfall"]
      if isinstance(result.get("water"), dict):
        self.latest_dam = result["water"]
      if isinstance(result.get("crop_exposure"), dict):
        self.latest_crop_exposure = result["crop_exposure"]
      if result.get("governorate"):
        self.governorate = result["governorate"]
    elif tool_name == "get_rainfall_indicators":
      self.latest_rainfall = result
    elif tool_name == "get_water_indicators":
      self.latest_dam = result
    elif tool_name == "get_crop_exposure":
      self.latest_crop_exposure = result
    self.updated_at = _iso_now()

  def apply_assessment(self, assessment):
    """Store a dashboard-run assessment so the chat starts with context."""
    if not isinstance(assessment, dict) or "error" in assessment:
      return
    if assessment.get("risk"):
      self.latest_risk = assessment["risk"]
    if assessment.get("indicators"):
      self.latest_rainfall = assessment["indicators"]
    if assessment.get("water"):
      self.latest_dam = assessment["water"]
    if assessment.get("crop_exposure"):
      self.latest_crop_exposure = assessment["crop_exposure"]
    if assessment.get("region"):
      self.governorate = assessment["region"]
    self.updated_at = _iso_now()

  # --- prompt block ------------------------------------------------------
  def snapshot_block(self):
    """Compact, structured block injected into the system prompt."""
    lines = [
        "SESSION CONTEXT",
        f"- Selected governorate: {self.governorate}",
        f"- Selected crop: {self.crop}",
        f"- Selected period: {self.period_label} ({self.period})",
        f"- Context bar shown to the user: {self.context_bar()}",
    ]

    def _add(label, payload):
      if payload:
        lines.append(f"- {label}: {json.dumps(payload, ensure_ascii=False, default=str)}")
      else:
        lines.append(f"- {label}: not available yet in this session (fetch with a tool if needed)")

    _add("Latest risk assessment (model output, immutable)", self.latest_risk)
    _add("Latest rainfall indicators (measured)", self.latest_rainfall)
    _add("Latest dam/water indicators (measured)", self.latest_dam)
    _add("Latest crop exposure assessment (model output)", self.latest_crop_exposure)
    if self.updated_at:
      lines.append(f"- Last updated: {self.updated_at}")
    return "\n".join(lines)


# ----------------------------------------------------------------------
# Conversation window
# ----------------------------------------------------------------------
def new_message(role, content, error=False, tools=None):
  return {
      "role": role,
      "content": content,
      "timestamp": _now(),
      "error": bool(error),
      "tools": list(tools or []),
  }


def trim_history(messages, max_exchanges=MAX_HISTORY_EXCHANGES):
  """Keep only the last `max_exchanges` exchanges and drop error notices."""
  usable = [
      m for m in messages
      if m.get("role") in ("user", "assistant") and not m.get("error") and m.get("content")
  ]
  limit = max(1, int(max_exchanges)) * 2
  trimmed = usable[-limit:]
  # Never start the window on an assistant turn
  while trimmed and trimmed[0]["role"] != "user":
    trimmed = trimmed[1:]
  return trimmed


def history_for_llm(messages):
  return [{"role": m["role"], "content": m["content"]} for m in trim_history(messages)]


# ----------------------------------------------------------------------
# Streamlit session-state helpers (no streamlit import required)
# ----------------------------------------------------------------------
def load_session(state):
  """Return {'messages': [...], 'context': SessionContext} from session state."""
  raw = state.get(SESSION_KEY)
  if not isinstance(raw, dict):
    raw = {}
  return {
      "messages": list(raw.get("messages", [])),
      "context": SessionContext.from_dict(raw.get("context")),
  }


def save_session(state, messages, context):
  state[SESSION_KEY] = {
      "messages": list(messages),
      "context": context.to_dict(),
  }


def reset_conversation(context):
  """Clear the conversation window and cached assessments, keep selections."""
  return SessionContext(
      governorate=context.governorate,
      crop=context.crop,
      period=context.period,
  )


def reference_data_block():
  """What exists in AgriRisk — helps the model answer scope questions."""
  return (
      "REFERENCE DATA\n"
      f"- Governorates available: {', '.join(region_names())}\n"
      f"- Crops with sensitivity profiles: {', '.join(crop_names())}\n"
      f"- Periods: {', '.join(PERIODS.keys())} (current = last 12 months of data, "
      "last_year = the same window one year earlier)\n"
  )
