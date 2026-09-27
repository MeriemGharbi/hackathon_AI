import pandas as pd
import unicodedata

# ---------------------------------------------------------
# 1. Encoding fix — handles the "BÃ©ja" / "BÃ@ja" mojibake
# ---------------------------------------------------------
# This happens when UTF-8 bytes (é = 0xC3 0xA9) get misread as
# Latin-1/Windows-1252 on save or export. The fix: re-encode as
# Latin-1, then decode as UTF-8 to recover the original text.

def fix_mojibake(text):
    if not isinstance(text, str):
        return text
    try:
        return text.encode("latin1").decode("utf8")
    except (UnicodeDecodeError, UnicodeEncodeError):
        return text  # already clean, or a different corruption — leave as-is

# Explicit correction map as a safety net, in case the CSV has
# inconsistent/partial corruption (like the extra stray "@" you saw)
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
    key = "".join(c for c in key if not unicodedata.combining(c))  # strip accents for lookup
    return GOVERNORATE_FIXES.get(key, cleaned)


# ---------------------------------------------------------
# 2. Load the CSV and clean it
# ---------------------------------------------------------

def load_dam_data(csv_path):
    df = pd.read_csv(csv_path, encoding="utf-8", parse_dates=["Date"])

    # clean the two text columns that can carry mojibake
    df["Dam_Name"] = df["Dam_Name"].apply(fix_mojibake)
    df["Governorate_Served"] = df["Governorate_Served"].apply(normalize_governorate)
    df["Region"] = df["Region"].apply(fix_mojibake)

    return df

DAM_DF = load_dam_data("dam_data.csv")


# ---------------------------------------------------------
# 3. Core tool: get_dam_status
# ---------------------------------------------------------

REGION_TOTAL_COLUMN = {
    "North": "North_Dams_Total_Mm3",
    "Centre": "Centre_Dams_Total_Mm3",
    "Cap Bon": "Cap_Bon_Dams_Total_Mm3",
}

def get_dam_status(governorate, date=None):
    """
    Returns dam/water risk stats for the region serving this governorate.
    Uses the worst (lowest fill %) dam if a governorate has more than one,
    since that's the more honest signal for risk assessment.
    """
    governorate = normalize_governorate(governorate)
    subset = DAM_DF[DAM_DF["Governorate_Served"] == governorate]

    if subset.empty:
        available = sorted(DAM_DF["Governorate_Served"].unique())
        return {"error": f"No dam data for '{governorate}'. Available: {available}"}

    target_date = pd.to_datetime(date) if date else subset["Date"].max()
    subset = subset[subset["Date"] == target_date]

    if subset.empty:
        return {"error": f"No dam data for '{governorate}' on {target_date.date()}"}

    # pick the dam with the lowest fill rate that day (worst case)
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
# 4. Tool schema for the agent (function-calling)
# ---------------------------------------------------------

GET_DAM_STATUS_SCHEMA = {
    "name": "get_dam_status",
    "description": "Get current dam/water reservoir status for a Tunisian governorate",
    "parameters": {
        "type": "object",
        "properties": {
            "governorate": {"type": "string", "description": "e.g. 'Béja', 'Kairouan'"},
            "date": {"type": "string", "description": "Optional YYYY-MM-DD, defaults to latest available"}
        },
        "required": ["governorate"]
    }
}


# ---------------------------------------------------------
# 5. Test before wiring into the agent
# ---------------------------------------------------------

if __name__ == "__main__":
    print("Unique governorates after cleaning:", sorted(DAM_DF["Governorate_Served"].unique()))
    print()
    print(get_dam_status("Béja"))
    print(get_dam_status("béja"))      # should match the same row despite different casing/accent input
    print(get_dam_status("BÃ©ja"))     # should also resolve correctly if mojibake sneaks into a live query