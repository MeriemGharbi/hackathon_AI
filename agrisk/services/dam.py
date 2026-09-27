"""Dam / reservoir indicators — single source of truth for water data.

Logic moved unchanged from the original `dam_main.py` (mojibake repair,
governorate normalisation, worst-case dam selection), now shared by the
dashboard, the CLI and the AI analyst chat.
"""

import threading
import unicodedata

import pandas as pd

from agrisk.config import DAM_CSV_PATH


# ---------------------------------------------------------
# Encoding fix — handles the "BÃ©ja" / "BÃ@ja" mojibake
# ---------------------------------------------------------
def fix_mojibake(text):
  if not isinstance(text, str):
    return text
  try:
    return text.encode("latin1").decode("utf8")
  except (UnicodeDecodeError, UnicodeEncodeError):
    return text  # already clean, or a different corruption — leave as-is


GOVERNORATE_FIXES = {
    "béja": "Béja", "beja": "Béja", "bã©ja": "Béja", "bã@ja": "Béja",
    "kairouan": "Kairouan",
    "le kef": "Le Kef", "kef": "Le Kef",
    "siliana": "Siliana",
    "bizerte": "Bizerte",
    "jendouba": "Jendouba",
    "sidi bouzid": "Sidi Bouzid",
    "gabes": "Gabès", "gabès": "Gabès",
    "tozeur": "Tozeur",
    "kebili": "Kébili", "kébili": "Kébili",
}


def normalize_governorate(name):
  if not isinstance(name, str):
    return name
  cleaned = fix_mojibake(name).strip()
  key = unicodedata.normalize("NFKD", cleaned).lower()
  key = "".join(c for c in key if not unicodedata.combining(c))
  return GOVERNORATE_FIXES.get(key, cleaned)


# ---------------------------------------------------------
# Data loading (lazy, thread-safe, cached)
# ---------------------------------------------------------
_DF = None
_DF_LOCK = threading.Lock()


def load_dam_data(csv_path=None):
  """Load and clean the dam monitoring CSV."""
  path = csv_path or DAM_CSV_PATH
  df = pd.read_csv(path, encoding="utf-8", parse_dates=["Date"])
  df["Dam_Name"] = df["Dam_Name"].apply(fix_mojibake)
  df["Governorate_Served"] = df["Governorate_Served"].apply(normalize_governorate)
  df["Region"] = df["Region"].apply(fix_mojibake)
  return df


def get_dam_dataframe():
  global _DF
  if _DF is None:
    with _DF_LOCK:
      if _DF is None:
        _DF = load_dam_data()
  return _DF


def available_governorates():
  return sorted(get_dam_dataframe()["Governorate_Served"].unique())


def dam_data_coverage():
  df = get_dam_dataframe()
  return {
      "first_date": str(df["Date"].min().date()),
      "last_date": str(df["Date"].max().date()),
      "governorates": available_governorates(),
  }


# ---------------------------------------------------------
# Core tool: get_dam_status
# ---------------------------------------------------------
REGION_TOTAL_COLUMN = {
    "North": "North_Dams_Total_Mm3",
    "Centre": "Centre_Dams_Total_Mm3",
    "Cap Bon": "Cap_Bon_Dams_Total_Mm3",
}


def get_dam_status(governorate, date=None):
  """Dam/water risk stats for the region serving this governorate.

  Uses the worst (lowest fill %) dam if a governorate has more than one,
  since that's the more honest signal for risk assessment.
  """
  DAM_DF = get_dam_dataframe()
  governorate = normalize_governorate(governorate)
  subset = DAM_DF[DAM_DF["Governorate_Served"] == governorate]

  if subset.empty:
    return {
        "error": f"No dam data for '{governorate}'.",
        "available_governorates": available_governorates(),
    }

  target_date = pd.to_datetime(date) if date else subset["Date"].max()
  subset = subset[subset["Date"] == target_date]

  if subset.empty:
    return {
        "error": f"No dam data for '{governorate}' on {pd.to_datetime(target_date).date()}.",
        "available_dates": [str(d.date()) for d in sorted(DAM_DF["Date"].unique())[-6:]],
    }

  row = subset.loc[subset["Per_Dam_Fill_Rate_Pct"].idxmin()]
  region = row["Region"]
  region_col = REGION_TOTAL_COLUMN.get(region)

  national_stock = row["National_Total_Stock_Mm3"]
  three_yr_avg = row["Three_Year_Average_Stock_Mm3"]
  last_year = row["Last_Year_Stock_Mm3"]
  curr_inflow = row["Current_Season_Inflow_Mm3"]
  prev_inflow = row["Previous_Season_Inflow_Mm3"]

  return {
      "date": str(row["Date"].date()),
      "governorate": governorate,
      "region": region,
      "worst_dam_name": row["Dam_Name"],
      "per_dam_fill_pct": float(row["Per_Dam_Fill_Rate_Pct"]),
      "region_total_stock_mm3": float(row[region_col]) if region_col else None,
      "national_stock_mm3": float(national_stock),
      "stock_vs_3yr_avg_ratio": round(national_stock / three_yr_avg, 3) if three_yr_avg else None,
      "stock_vs_last_year_ratio": round(national_stock / last_year, 3) if last_year else None,
      "inflow_trend_ratio": round(curr_inflow / prev_inflow, 3) if prev_inflow else None,
  }


# ---------------------------------------------------------
# Enriched indicators for the dashboard and the AI analyst
# ---------------------------------------------------------
def _fill_status(fill_pct):
  if fill_pct is None:
    return "unknown"
  if fill_pct < 20:
    return "critical"
  if fill_pct < 40:
    return "low"
  if fill_pct < 65:
    return "moderate"
  return "healthy"


def _pct(ratio):
  return None if ratio is None else round((float(ratio) - 1.0) * 100, 1)


def get_water_indicators(governorate, date=None):
  """Dam/reservoir indicators with derived comparisons for risk analysis."""
  base = get_dam_status(governorate, date)
  if "error" in base:
    return base

  fill = base["per_dam_fill_pct"]
  return {
      "source": "AgriRisk dam monitoring dataset — measured monthly reservoir data",
      "governorate": base["governorate"],
      "date": base["date"],
      "region": base["region"],
      "worst_dam_name": base["worst_dam_name"],
      "dam_fill_rate_pct": fill,
      "fill_status": _fill_status(fill),
      "region_total_stock_mm3": base["region_total_stock_mm3"],
      "national_stock_mm3": base["national_stock_mm3"],
      "stock_vs_3yr_avg_pct": _pct(base["stock_vs_3yr_avg_ratio"]),
      "stock_vs_last_year_pct": _pct(base["stock_vs_last_year_ratio"]),
      "seasonal_inflow_change_pct": _pct(base["inflow_trend_ratio"]),
      "selection_note": (
          "Fill rate is the worst-performing dam serving the governorate on that date; "
          "stock and inflow comparisons are national aggregates."
      ),
  }


# ---------------------------------------------------------
# Tool schema for the agent (function-calling)
# ---------------------------------------------------------
GET_DAM_STATUS_SCHEMA = {
    "name": "get_dam_status",
    "description": "Get current dam/water reservoir status for a Tunisian governorate",
    "parameters": {
        "type": "object",
        "properties": {
            "governorate": {"type": "string", "description": "e.g. 'Béja', 'Kairouan'"},
            "date": {"type": "string", "description": "Optional YYYY-MM-DD, defaults to latest available"},
        },
        "required": ["governorate"],
    },
}


if __name__ == "__main__":
  print("Unique governorates after cleaning:", available_governorates())
  print()
  print(get_dam_status("Béja"))
  print(get_dam_status("béja"))
  print(get_dam_status("BÃ©ja"))
  print(get_water_indicators("Kairouan"))
