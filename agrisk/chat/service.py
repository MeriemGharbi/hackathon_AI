"""AgriRisk chat service: system prompt, bounded history, tool-grounded LLM calls.

The Streamlit page only renders state and calls `respond()` — all prompt logic,
context bounds and tool dispatch live here.
"""

import json

from agrisk.config import (
    API_BASE_URL,
    LLM_MAX_TOKENS,
    LLM_TEMPERATURE,
    LLM_TIMEOUT_SECONDS,
    MAX_HISTORY_EXCHANGES,
    MAX_TOOL_ROUNDS,
    MODEL_NAME,
    get_api_key,
)
from agrisk.chat.prompts import build_system_prompt
from agrisk.chat.session import history_for_llm
from agrisk.chat.tools import TOOL_SCHEMAS, execute_tool

_MAX_TOOL_RESULT_CHARS = 20000

_FALLBACK_REPLY = (
    "I could not produce an answer with the available data. "
    "Please rephrase your AgriRisk question or try again."
)


class ChatResult:
  """Outcome of one analyst turn."""

  def __init__(self, reply="", tools_used=None, error=None, model=""):
    self.reply = reply
    self.tools_used = list(tools_used or [])
    self.error = error
    self.model = model

  @property
  def ok(self):
    return self.error is None

  def to_dict(self):
    return {
        "reply": self.reply,
        "tools_used": self.tools_used,
        "error": self.error,
        "model": self.model,
    }


def _friendly_error(exc):
  """Turn an SDK/network exception into an actionable message for the UI."""
  name = type(exc).__name__
  text = str(exc)
  lowered = text.lower()
  if "authentication" in name.lower() or "401" in text or "invalid api key" in lowered:
    return "LLM authentication failed: check the GROQ_API_KEY configured for AgriRisk."
  if "connection" in name.lower() or "timed out" in lowered or "timeout" in lowered:
    return "The LLM service could not be reached (network/timeout). Please retry."
  if "rate limit" in lowered or "429" in text:
    return "The LLM service is rate-limited right now. Please retry in a moment."
  if "missing api key" in lowered:
    return text
  return f"LLM request failed ({name}): {text[:300]}"


def _serialise_tool_result(result):
  try:
    payload = json.dumps(result, ensure_ascii=False, default=str)
  except (TypeError, ValueError):
    payload = str(result)
  if len(payload) > _MAX_TOOL_RESULT_CHARS:
    payload = payload[:_MAX_TOOL_RESULT_CHARS] + ' ..."(truncated)"'
  return payload


class AgriRiskChatService:
  """Sends bounded conversation + structured context to the Groq LLM."""

  def __init__(self, api_key=None, model=None, base_url=None, client=None):
    self.model = model or MODEL_NAME
    self.base_url = base_url or API_BASE_URL
    self._api_key = api_key
    self._client = client

  @property
  def client(self):
    if self._client is not None:
      return self._client
    from openai import OpenAI

    key = self._api_key or get_api_key()
    if not key:
      raise RuntimeError(
          "Missing API key: set GROQ_API_KEY in your environment or .env file."
      )
    self._client = OpenAI(
        base_url=self.base_url, api_key=key, timeout=LLM_TIMEOUT_SECONDS
    )
    return self._client

  # ------------------------------------------------------------------
  def _complete(self, messages, tools=None):
    kwargs = dict(
        model=self.model,
        messages=messages,
        temperature=LLM_TEMPERATURE,
        max_tokens=LLM_MAX_TOKENS,
    )
    if tools:
      kwargs["tools"] = tools
    return self.client.chat.completions.create(**kwargs)

  def respond(self, user_text, history, context):
    """Run one turn: bounded history + session context + tool-grounded answer.

    `history` is the stored conversation (list of dicts), `context` a
    SessionContext that is updated in place when tools return fresh data.
    Returns a ChatResult (never raises for LLM/tool failures).
    """
    user_text = (user_text or "").strip()
    if not user_text:
      return ChatResult(error="Empty message.", model=self.model)

    system_prompt = build_system_prompt(context)
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history_for_llm(history))
    messages.append({"role": "user", "content": user_text})

    tools_used = []
    try:
      for round_index in range(MAX_TOOL_ROUNDS):
        use_tools = TOOL_SCHEMAS
        if round_index == MAX_TOOL_ROUNDS - 1:
          use_tools = None  # final round: answer from what has been gathered
        response = self._complete(messages, tools=use_tools)
        message = response.choices[0].message
        tool_calls = list(getattr(message, "tool_calls", None) or [])

        if not tool_calls:
          reply = (message.content or "").strip()
          return ChatResult(
              reply=reply or _FALLBACK_REPLY,
              tools_used=tools_used,
              model=self.model,
          )

        messages.append({
            "role": "assistant",
            "content": message.content or "",
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments or "{}",
                    },
                }
                for tc in tool_calls
            ],
        })
        for tc in tool_calls:
          name = tc.function.name
          result = execute_tool(name, tc.function.arguments)
          tools_used.append(name)
          context.update_from_tool(name, result)
          messages.append({
              "role": "tool",
              "tool_call_id": tc.id,
              "content": _serialise_tool_result(result),
          })

      # Safety net: one last attempt without tools
      response = self._complete(messages, tools=None)
      message = response.choices[0].message
      reply = (message.content or "").strip()
      return ChatResult(
          reply=reply or _FALLBACK_REPLY, tools_used=tools_used, model=self.model
      )
    except Exception as exc:  # noqa: BLE001 — surfaced as an error state in the UI
      return ChatResult(error=_friendly_error(exc), tools_used=tools_used, model=self.model)
