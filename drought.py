import os
import pandas as pd
import streamlit as st
from openai import OpenAI

# ---------------------------------------------------------
# 1. LOAD DATA & DEFINE TOOL
# ---------------------------------------------------------


@st.cache_data
def load_data():
  try:
    # Read your CSV file. (Make sure it's in the same folder)
    df = pd.read_csv("tunisia_rainfall.csv")

    # Clean up column names just in case of spaces or extra text
    df.columns = df.columns.str.strip()
    return df
  except Exception as e:
    # Fallback dummy data matching NASA POWER structure if CSV isn't ready
    return pd.DataFrame({
        "LAT": [35.6811, 35.6811, 36.8065, 36.8065],
        "LON": [10.1018, 10.1018, 10.1815, 10.1815],
        "REGION": ["Kairouan", "Kairouan", "Tunis", "Tunis"],
        "YEAR": [2023, 2022, 2023, 2022],
        "MO": [3, 3, 3, 3],
        "PRECTOTCORR": [0.5, 2.1, 1.8, 2.5],  # mm/day
        "T2M": [16.5, 15.0, 17.2, 16.0],  # Temp °C
    })


df = load_data()


def get_rainfall_stats(region: str, season_months: list):
  """Queries historical NASA POWER data for a given region/station and season months,

  computing precipitation anomalies, temperature averages, and drought risk.
  """
  # Check if a REGION column exists, otherwise use LAT/LON or fallback
  if "REGION" in df.columns:
    sub = df[
        (df["REGION"].str.lower() == region.lower())
        & (df["MO"].isin(season_months))
    ]
  else:
    # Fallback if dataframe uses coordinates or general filter
    sub = df[df["MO"].isin(season_months)]

  if sub.empty:
    return {
        "error": f"No data found for region '{region}' in specified months."
    }

  # Use PRECTOTCORR for precipitation (mm/day)
  precip_col = [c for c in df.columns if "PRECTOTCORR" in c][0]
  temp_col = (
      [c for c in df.columns if "T2M" in c and "MAX" not in c and "MIN" not in c]
      + [None]
  )[0]

  hist_mean_precip = float(sub[precip_col].mean())
  hist_mean_temp = float(sub[temp_col].mean()) if temp_col else 0.0

  # Get latest available year data (e.g., latest year in dataset)
  latest_year = int(sub["YEAR"].max())
  latest_sub = sub[sub["YEAR"] == latest_year]
  latest_precip = float(latest_sub[precip_col].mean())

  # Simple anomaly percentage calculation
  diff_pct = (
      ((latest_precip - hist_mean_precip) / hist_mean_precip) * 100
      if hist_mean_precip > 0
      else 0
  )

  risk_level = "Normal"
  flag = "Standard Terms"
  if diff_pct < -30:
    risk_level = "High Drought Risk"
    flag = "Suggest +15% Premium Adjustment / Loan Caution"
  elif diff_pct > 30:
    risk_level = "Excess Rain / Flood Risk"
    flag = "Suggest Drainage Check / Weather Rider"

  return {
      "region": region,
      "latest_year_recorded": latest_year,
      "historical_mean_daily_precip_mm": round(hist_mean_precip, 2),
      "latest_year_daily_precip_mm": round(latest_precip, 2),
      "historical_mean_temp_c": round(hist_mean_temp, 2),
      "precipitation_anomaly_percentage": round(diff_pct, 1),
      "risk_level": risk_level,
      "recommended_action": flag,
  }


# ---------------------------------------------------------
# 2. LLM CLIENT SETUP (NVIDIA NIM / GROQ / GEMINI COMPATIBLE)
# ---------------------------------------------------------
st.sidebar.title("-Configuration-")
api_key = st.sidebar.text_input(
    "API Key (NVIDIA / Groq)",
    type="password",
    value=os.environ.get("OPENAI_API_KEY", ""),
)
base_url = st.sidebar.text_input(
    "Base URL", value="https://integrate.api.nvidia.com/v1"
)
model_name = st.sidebar.text_input(
    "Model Name", value="meta/llama-3.1-70b-instruct"
)

# ---------------------------------------------------------
# 3. STREAMLIT USER INTERFACE
# ---------------------------------------------------------
st.title(" Agri-Risk Advisory Agent (Tunisia)")
st.markdown(
    "AI-powered parametric weather-risk tool using NASA POWER climate data."
)

tab1, tab2 = st.tabs([" Risk Advisory Chat", " Station Map"])

with tab1:
  st.subheader("Ask about crop risk (in French, English, or Derja)")

  user_query = st.text_input(
      "Example: 'What is the drought risk for wheat in Kairouan in spring (months 3,4,5)?'"
  )

  if st.button("Analyze Risk"):
    if not api_key:
      st.error("Please provide an API key in the sidebar.")
    else:
      client = OpenAI(base_url=base_url, api_key=api_key)

      with st.spinner("Analyzing NASA POWER historical records..."):
        # Simple extraction for hackathon speed
        target_region = "Kairouan" if "kairouan" in user_query.lower() else "Tunis"
        season_months = [3, 4, 5]  # Spring default

        tool_result = get_rainfall_stats(target_region, season_months)

        prompt = f"""
                You are an expert agricultural insurance risk advisor in Tunisia.
                User Query: "{user_query}"
                NASA POWER Climate Data Analysis Tool Output: {tool_result}
                
                Provide a professional insurance risk report in French or English (matching user query tone), including:
                1. Historical context vs latest year precipitation and temperature.
                2. Risk Level assessment.
                3. Suggested loan risk flag or premium adjustment recommendation for the bank/insurer.
                """

        response = client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )

        ai_response = response.choices[0].message.content

        st.markdown("###  Risk Assessment Report")
        st.write(ai_response)

        with st.expander("🔍 View Raw Tool Output"):
          st.json(tool_result)

with tab2:
  st.subheader("Station Locations Overview")
  if "LAT" in df.columns and "LON" in df.columns:
    map_df = df[["LAT", "LON"]].drop_duplicates().rename(columns={"LAT": "lat", "LON": "lon"})
    st.map(map_df)
  else:
    st.info("Latitude and Longitude columns are needed to render the map.")