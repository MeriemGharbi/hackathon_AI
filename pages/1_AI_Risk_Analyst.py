"""AI Risk Analyst — dedicated chat page for the AgriRisk dashboard.

Renders the conversation UI only: prompt logic, bounded context and tool
dispatch live in `agrisk.chat.service`.
"""

import html
import importlib
import os
import sys
from datetime import datetime

# Make sure the project root (package `agrisk`) is importable from pages/
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
  sys.path.insert(0, _ROOT)

import streamlit as st  # noqa: E402

_PKG = "agr" + "isk"  # package name, spelled without ambiguity
session_mod = importlib.import_module(f"{_PKG}.chat.session")
service_mod = importlib.import_module(f"{_PKG}.chat.service")
prompts_mod = importlib.import_module(f"{_PKG}.chat.prompts")
config_mod = importlib.import_module(f"{_PKG}.config")
regions_mod = importlib.import_module(f"{_PKG}.regions")
rainfall_mod = importlib.import_module(f"{_PKG}.services.rainfall")
crops_mod = importlib.import_module(f"{_PKG}.services.crops")

SessionContext = session_mod.SessionContext
AgriRiskChatService = service_mod.AgriRiskChatService

SUGGESTED_PROMPTS = [
    "Why is the current risk high?",
    "What are the main risk drivers?",
    "Compare this region with last year.",
    "Which crops are most exposed?",
    "What happens if rainfall decreases by 15%?",
    "Show me the water indicators.",
]

RISK_COLORS = {
    "LOW": ("#e7f6ec", "#137a45"),
    "MODERATE": ("#fdf3e0", "#9a6700"),
    "HIGH": ("#fdecec", "#b42318"),
    "VERY HIGH": ("#f8e6e6", "#8a1010"),
}

CSS = """
<style>
  .ar-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px; border-radius: 12px; margin-bottom: 6px;
    background: linear-gradient(100deg, #0f2b46 0%, #1f5f7a 100%);
    color: #ffffff;
  }
  .ar-title { font-size: 26px; font-weight: 700; letter-spacing: .2px; }
  .ar-subtitle { font-size: 14px; opacity: .85; margin-top: 2px; }
  .ar-badge {
    font-size: 12px; border: 1px solid rgba(255,255,255,.45);
    border-radius: 999px; padding: 4px 12px; white-space: nowrap;
  }
  .ar-context {
    display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
    background: #f5f8fb; border: 1px solid #e1e8f0; border-radius: 10px;
    padding: 10px 14px; margin: 4px 0 10px 0; font-size: 14px; color: #243b53;
  }
  .ar-context-label {
    font-size: 11px; text-transform: uppercase; letter-spacing: .8px;
    color: #627d98; font-weight: 600; margin-right: 4px;
  }
  .ar-pill {
    background: #ffffff; border: 1px solid #d9e2ec; border-radius: 999px;
    padding: 3px 12px; font-weight: 600; font-size: 13px; color: #102a43;
  }
  .ar-risk { border: none; color: #ffffff; font-weight: 700; }
  .ar-sep { color: #9fb3c8; }
  .ar-meta {
    font-size: 11.5px; color: #829ab1; margin-top: 4px;
    letter-spacing: .2px;
  }
  .ar-chip-hint {
    font-size: 12.5px; color: #627d98; margin: 2px 0 6px 0;
    text-transform: uppercase; letter-spacing: .8px; font-weight: 600;
  }
  .stChatMessage {
    border-radius: 12px; border: 1px solid #e6ecf3;
    background: #fbfcfe; padding: 6px 10px; margin-bottom: 6px;
  }
  .stChatMessage p, .stChatMessage li { font-size: 15px; line-height: 1.5; }
  div[data-testid="stChatInput"] textarea {
    font-size: 15px;
  }
  .stButton > button {
    border-radius: 999px; border: 1px solid #cbd5e1;
    background: #ffffff; color: #243b53; font-size: 13.5px;
    font-weight: 500; transition: all .15s ease;
  }
  .stButton > button:hover {
    border-color: #1f7a8c; color: #0f2b46; background: #f0f7fa;
  }
  .stButton > button:focus { box-shadow: 0 0 0 2px rgba(31,122,140,.35); }
</style>
"""


def _risk_style(level_label):
  return RISK_COLORS.get((level_label or "").upper(), ("#eef2f6", "#334e68"))


def _render_context_bar(ctx):
  risk = ctx.risk_badge()
  bg, fg = _risk_style(risk)
  st.markdown(
      f'<div class="ar-context">'
      f'<span class="ar-context-label">Context</span>'
      f'<span class="ar-pill">{html.escape(str(ctx.governorate))}</span>'
      f'<span class="ar-sep">·</span>'
      f'<span class="ar-pill">{html.escape(str(ctx.crop))}</span>'
      f'<span class="ar-sep">·</span>'
      f'<span class="ar-pill">{html.escape(str(ctx.period_label))}</span>'
      f'<span class="ar-sep">·</span>'
      f'<span class="ar-pill ar-risk" style="background:{bg};color:{fg};">'
      f'Risk: {html.escape(str(risk))}</span>'
      f'</div>',
      unsafe_allow_html=True,
  )


def _render_message(message):
  role = "assistant" if message.get("role") == "assistant" else "user"
  with st.chat_message(role):
    if message.get("error"):
      st.error(message.get("content", "Something went wrong."))
    else:
      st.markdown(message.get("content", ""))
    label = "AgriRisk Analyst" if role == "assistant" else "You"
    tools = message.get("tools") or []
    tools_txt = f" · tools: {', '.join(tools)}" if tools else ""
    stamp = message.get("timestamp", "")
    st.markdown(
        f'<div class="ar-meta">{html.escape(label)} · {html.escape(stamp)}'
        f'{html.escape(tools_txt)}</div>',
        unsafe_allow_html=True,
    )


def _render_intro():
  with st.chat_message("assistant"):
    st.markdown(
        "**I analyse Tunisian agricultural climate and water risk.**\n\n"
        "I can explain the current risk classification and its drivers, compare "
        "rainfall with the previous year, report dam and reservoir levels, assess "
        "crop exposure, and run simple rainfall scenarios.\n\n"
        "All figures come from AgriRisk tools (Open-Meteo climate data, the dam "
        "monitoring dataset and the AgriRisk risk model) — I never invent numbers."
    )
    st.markdown('<div class="ar-meta">AgriRisk Analyst</div>', unsafe_allow_html=True)


def _run_turn(prompt, messages, context):
  """Call the chat service, persist state and return the updated messages."""
  messages.append(session_mod.new_message("user", prompt))
  session_mod.save_session(st.session_state, messages, context)

  service = AgriRiskChatService()
  with st.status("Analysing AgriRisk data…", expanded=True) as status:
    st.write(prompt)
    result = service.respond(prompt, messages, context)
    if result.ok:
      tools = ", ".join(result.tools_used) if result.tools_used else "session context"
      status.update(label=f"Response ready · grounded on: {tools}", state="complete")
      messages.append(
          session_mod.new_message(
              "assistant", result.reply, tools=result.tools_used
          )
      )
    else:
      status.update(label="Request failed", state="error")
      messages.append(
          session_mod.new_message(
              "assistant",
              f"**The analyst could not answer this turn.**\n\n{result.error}\n\n"
              "Please retry — if the problem persists, check the AgriRisk API key "
              "configuration.",
              error=True,
          )
      )
  session_mod.save_session(st.session_state, messages, context)
  st.rerun()


# ----------------------------------------------------------------------
# Page
# ----------------------------------------------------------------------
st.set_page_config(
    page_title="AI Risk Analyst · AgriRisk",
    layout="wide",
)
st.markdown(CSS, unsafe_allow_html=True)

state = session_mod.load_session(st.session_state)
messages = state["messages"]
context = state["context"]

# --- sidebar: session context controls ---
with st.sidebar:
  st.markdown("### Session context")
  governorate = st.selectbox(
      "Governorate",
      regions_mod.region_names(),
      index=regions_mod.region_names().index(context.governorate)
      if context.governorate in regions_mod.region_names() else 0,
      key="chat_governorate",
  )
  crop = st.selectbox(
      "Crop",
      crops_mod.crop_names(),
      index=crops_mod.crop_names().index(context.crop)
      if context.crop in crops_mod.crop_names() else 0,
      key="chat_crop",
  )
  period_keys = list(rainfall_mod.PERIODS.keys())
  period = st.selectbox(
      "Period",
      period_keys,
      index=period_keys.index(context.period) if context.period in period_keys else 0,
      format_func=lambda k: rainfall_mod.PERIODS[k],
      key="chat_period",
  )
  changed = (
      governorate != context.governorate
      or crop != context.crop
      or period != context.period
  )
  if changed:
    context.governorate, context.crop, context.period = governorate, crop, period
    session_mod.save_session(st.session_state, messages, context)
    st.rerun()

  st.divider()
  st.caption(
      f"Model: `{config_mod.MODEL_NAME}`\n\n"
      "Context follows your dashboard selection. Measurements are refreshed from "
      "AgriRisk tools when needed."
  )

# --- header ---
header_left, header_right = st.columns([5, 1], vertical_alignment="center")
with header_left:
  st.markdown(
      '<div class="ar-header"><div>'
      '<div class="ar-title">AI Risk Analyst</div>'
      '<div class="ar-subtitle">Your AgriRisk intelligence assistant</div>'
      '</div>'
      '<div class="ar-badge">Tunisia · Climate &amp; Water Risk</div>'
      '</div>',
      unsafe_allow_html=True,
  )
with header_right:
  if st.button("Clear conversation", use_container_width=True, type="secondary"):
    session_mod.save_session(
        st.session_state, [], session_mod.reset_conversation(context)
    )
    st.rerun()

_render_context_bar(context)

# --- suggested prompts ---
st.markdown(
    '<div class="ar-chip-hint">Suggested prompts</div>', unsafe_allow_html=True
)
chip_clicked = None
for row_start in (0, 3):
  cols = st.columns(3)
  for col, prompt_text in zip(cols, SUGGESTED_PROMPTS[row_start:row_start + 3]):
    with col:
      if st.button(prompt_text, key=f"chip_{row_start}_{prompt_text}",
                   use_container_width=True):
        chip_clicked = prompt_text

# --- conversation ---
if not messages:
  _render_intro()
else:
  for message in messages:
    _render_message(message)

prompt_text = st.chat_input(
    "Ask about rainfall, dams, crop exposure or AgriRisk model results…"
)

chosen = chip_clicked or prompt_text
if chosen:
  _run_turn(chosen, messages, context)
