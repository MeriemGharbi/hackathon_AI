from datetime import datetime
import os
import pandas as pd
import requests
import streamlit as st
from openai import OpenAI

# ---------------------------------------------------------
# 1. OPEN-METEO API TOOL FUNCTION (AUTOMATED DATES)
# ---------------------------------------------------------

TUNISIA_REGIONS = {
    "Kairouan": [35.6781, 10.0963],
    "Beja": [36.7256, 9.1817],
    "Jendouba": [36.5011, 8.7803],
    "Siliana": [36.0849, 9.3708],
    "Nabeul": [36.4561, 10.7376],
    "Bizerte": [37.2744, 9.8739],
    "Sfax": [34.7406, 10.7603],
    "Tunis": [36.8065, 10.1815],
    "Le Kef": [36.1742, 8.7049],
    "Medenine": [33.3549, 10.5055],
}


def fetch_open_meteo_stats(region: str):
  """Queries Open-Meteo Archive API automatically for the last full year

  to compute precipitation, temperature, ET0, VPD, and soil moisture.
  """
  coords = TUNISIA_REGIONS.get(region, TUNISIA_REGIONS["Kairouan"])
  lat, lon = coords

  # Automatically use the previous full calendar year
  last_year = datetime.now().year - 1
  start_date = f"{last_year}-01-01"
  end_date = f"{last_year}-12-31"

  url = (
      f"https://archive-api.open-meteo.com/v1/archive?"
      f"latitude={lat}&longitude={lon}&"
      f"start_date={start_date}&end_date={end_date}&"
      f"hourly=temperature_2m,precipitation,et0_fao_evapotranspiration,vapour_pressure_deficit,soil_moisture_0_to_7cm,soil_moisture_7_to_28cm&"
      f"timezone=auto"
  )

  try:
    response = requests.get(url, timeout=10)
    if response.status_code != 200:
      return {"error": f"Open-Meteo API error: {response.text}"}

    data = response.json()
    hourly = data.get("hourly", {})
    if not hourly:
      return {"error": "No hourly data returned from Open-Meteo."}

    df = pd.DataFrame(hourly)
    df["time"] = pd.to_datetime(df["time"])

    # Compute environmental stress metrics
    total_precip = float(df["precipitation"].sum())
    mean_temp = float(df["temperature_2m"].mean())
    mean_et0 = float(df["et0_fao_evapotranspiration"].mean())
    mean_vpd = float(df["vapour_pressure_deficit"].mean())
    mean_soil_0_7 = float(df["soil_moisture_0_to_7cm"].mean())
    mean_soil_7_28 = float(df["soil_moisture_7_to_28cm"].mean())

    # Risk evaluation logic
    risk_level = "Normal"
    recommended_action = "Standard Terms"

    if mean_soil_0_7 < 0.15 or total_precip < 100.0:
      risk_level = "High Drought Risk"
      recommended_action = (
          "Suggest +15% Premium Adjustment / Restrict Unsecured Agri-Loans"
      )
    elif total_precip > 600.0:
      risk_level = "Excess Rain / Flood Risk"
      recommended_action = "Suggest Drainage Check / Weather Rider Required"

    return {
        "region": region,
        "latitude": lat,
        "longitude": lon,
        "analyzed_year": last_year,
        "total_precipitation_mm": round(total_precip, 2),
        "mean_temperature_c": round(mean_temp, 2),
        "mean_et0_mm": round(mean_et0, 2),
        "mean_vpd_kpa": round(mean_vpd, 2),
        "mean_soil_moisture_0_7cm": round(mean_soil_0_7, 4),
        "mean_soil_moisture_7_28cm": round(mean_soil_7_28, 4),
        "risk_level": risk_level,
        "recommended_action": recommended_action,
    }

  except Exception as e:
    return {"error": str(e)}


# ---------------------------------------------------------
# 2. STREAMLIT USER INTERFACE & GROQ CONFIG
# ---------------------------------------------------------
st.sidebar.title("⚙️ Configuration")
api_key = st.sidebar.text_input(
    "Groq API Key",
    type="password",
    value=os.environ.get("GROQ_API_KEY", ""),
)
base_url = st.sidebar.text_input(
    "Base URL", value="https://api.groq.com/openai/v1"
)

# FIXED: Default model updated to Groq's active model ID
model_name = st.sidebar.text_input("Model Name", value="openai/gpt-oss-20b")

st.title("🌾 Agri-Risk Advisory Agent (Tunisia)")
st.markdown(
    "AI-powered parametric weather-risk tool using live **Open-Meteo API** and"
    " **Groq**."
)

tab1, tab2 = st.tabs(["💬 Risk Advisory Chat", "🗺️ Region Selection Map"])

with tab1:
  st.subheader("Ask about crop risk (in French, English, or Derja)")

  selected_region = st.selectbox(
      "Select Target Region in Tunisia", list(TUNISIA_REGIONS.keys()), index=0
  )

  user_query = st.text_input(
      "Custom Question / Prompt:",
      value=f"What is the drought risk for wheat in {selected_region} based on recent weather history?",
  )

  if st.button("Analyze Risk via Open-Meteo & Groq"):
    if not api_key:
      st.error("Please provide your Groq API key in the sidebar.")
    else:
      client = OpenAI(base_url=base_url, api_key=api_key)

      with st.spinner(
          f"Fetching live Open-Meteo metrics for {selected_region}..."
      ):
        tool_result = fetch_open_meteo_stats(selected_region)

        if "error" in tool_result:
          st.error(tool_result["error"])
        else:
          prompt = f"""
                    You are an expert agricultural insurance and banking risk advisor in Tunisia.
                    User Query: "{user_query}"
                    Open-Meteo Climate & Soil Data Tool Output: {tool_result}
                    
                    Provide a professional insurance risk report in French or English (matching user query tone), including:
                    1. Breakdown of climate stress factors (Precipitation, Soil Moisture 0-7cm & 7-28cm, ET₀, VPD).
                    2. Risk Level assessment (Drought / Normal / Flood).
                    3. Suggested loan risk flag or premium adjustment recommendation for the bank/insurer.
                    """

          response = client.chat.completions.create(
              model=model_name,
              messages=[{"role": "user", "content": prompt}],
              temperature=0.2,
          )

          ai_response = response.choices[0].message.content

          st.markdown("### 📊 Parametric Risk Assessment Report")
          st.write(ai_response)

          with st.expander("🔍 View Raw Open-Meteo Tool Payload"):
            st.json(tool_result)

with tab2:
  st.subheader("Tunisian Agricultural Hubs Overview")
  map_data = pd.DataFrame(
      [
          {"lat": coords[0], "lon": coords[1], "region": name}
          for name, coords in TUNISIA_REGIONS.items()
      ]
  )
  st.map(map_data, latitude="lat", longitude="lon", zoom=6)