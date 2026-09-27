"""Central configuration for AgriRisk.

API keys and model configuration live here — never inside the Streamlit UI.
"""

import os

try:
  from dotenv import load_dotenv

  load_dotenv()
except ImportError:
  pass

# --- LLM (Groq, OpenAI-compatible endpoint) ---
MODEL_NAME = os.environ.get("AGRIRISK_MODEL", "openai/gpt-oss-20b")
API_BASE_URL = os.environ.get("AGRIRISK_API_BASE_URL", "https://api.groq.com/openai/v1")
API_KEY_ENV_VAR = "GROQ_API_KEY"
LLM_TIMEOUT_SECONDS = float(os.environ.get("AGRIRISK_LLM_TIMEOUT", "60"))
LLM_TEMPERATURE = 0.2
LLM_MAX_TOKENS = 900
# Groq free tier throttles bursts: retry a few times with SDK backoff before failing
LLM_MAX_RETRIES = int(os.environ.get("AGRIRISK_LLM_MAX_RETRIES", "4"))

# --- Chat bounds ---
MAX_HISTORY_EXCHANGES = 10   # ~last 8-10 user/assistant exchanges sent to the LLM
MAX_TOOL_ROUNDS = 4          # tool-call rounds allowed per user turn

# --- Data access ---
DAM_CSV_PATH = os.environ.get(
    "AGRIRISK_DAM_CSV",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dam_data.csv"),
)
CLIMATE_CACHE_TTL_SECONDS = float(os.environ.get("AGRIRISK_CLIMATE_CACHE_TTL", "600"))
CLIMATE_DATA_LAG_DAYS = 7     # Open-Meteo archive lags a few days behind today


def get_api_key():
  """Return the Groq API key or None when it is not configured."""
  return os.environ.get(API_KEY_ENV_VAR) or None


def make_client(timeout=None):
  """Build the OpenAI-compatible client pointed at Groq.

  Raises RuntimeError when no key is configured so the UI can show a clear
  configuration error instead of crashing.
  """
  from openai import OpenAI

  api_key = get_api_key()
  if not api_key:
    raise RuntimeError(
        f"Missing API key: set {API_KEY_ENV_VAR} in your environment or .env file."
    )
  return OpenAI(
      base_url=API_BASE_URL,
      api_key=api_key,
      timeout=timeout or LLM_TIMEOUT_SECONDS,
      max_retries=LLM_MAX_RETRIES,
  )
