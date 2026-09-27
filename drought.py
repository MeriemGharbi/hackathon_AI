from datetime import datetime
import os
import pandas as pd
import requests
import streamlit as st
from openai import OpenAI

# Try loading local environment variables if python-dotenv is installed
try:
  from dotenv import load_dotenv

  load_dotenv()
except ImportError:
  pass

# ---------------------------------------------------------
# 1. HARDCODED CONFIGURATION & COMPREHENSIVE TUNISIAN REGIONS
# ---------------------------------------------------------
MODEL_NAME = "openai/gpt-oss-20b"
API_BASE_URL = "https://api.groq.com/openai/v1"

# Complete coverage of major Tunisian agricultural and regional hubs
TUNISIA_REGIONS = {
    "Kairouan": [35.6781, 10.0963],
    "Béja": [36.7256, 9.1817],
    "Jendouba": [36.5011, 8.7803],
    "Siliana": [36.0849, 9.3708],
    "Nabeul": [36.4561, 10.7376],
    "Bizerte": [37.2744, 9.8739],
    "Sfax": [34.7406, 10.7603],
    "Tunis": [36.8065, 10.1815],
    "Le Kef": [36.1742, 8.7049],
    "Médenine": [33.3549, 10.5055],
    "Zaghouan": [36.4029, 10.1429],
    "Manouba": [36.8083, 10.1037],
    "Sousse": [35.8256, 10.6369],
    "Monastir": [35.7779, 10.8261],
    "Mahdia": [35.5047, 11.0622],
    "Kasserine": [35.1677, 8.8365],
    "Sidi Bouzid": [35.0382, 9.4857],
    "Gafsa": [34.425, 8.7842],
    "Gabès": [33.8815, 10.0982],
    "Tozeur": [33.9197, 8.1335],
    "Kébili": [33.7046, 8.969],
    "Tataouine": [32.9297, 10.4518],
}


def fetch_open_meteo_stats(region: str):
  """Fetches live climate & soil metrics from Open-Meteo Archive API."""
  coords = TUNISIA_REGIONS.get(region, TUNISIA_REGIONS["Kairouan"])
  lat, lon = coords

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
    total_precip = float(df["precipitation"].sum())
    mean_soil_0_7 = float(df["soil_moisture_0_to_7cm"].mean())

    risk_level = "Normal"
    action = "Terms Standard (Favorable)"

    if mean_soil_0_7 < 0.15 or total_precip < 100.0:
      risk_level = "Risque de Sécheresse Élevé"
      action = (
          "Ajustement suggéré : Hausse de prime de 15% / Prudence sur les prêts"
          " agricoles"
      )
    elif total_precip > 600.0:
      risk_level = "Risque d'Excès d'Eau / Inondation"
      action = "Ajustement suggéré : Vérification du drainage / Garantie requise"

    return {
        "region": region,
        "analyzed_year": last_year,
        "total_precipitation_mm": round(total_precip, 2),
        "mean_soil_moisture": round(mean_soil_0_7, 3),
        "risk_level": risk_level,
        "recommended_action": action,
    }
  except Exception as e:
    return {"error": str(e)}


# ---------------------------------------------------------
# 2. EVALUATION METRICS (ROUGE / KEYWORD OVERLAP)
# ---------------------------------------------------------
def evaluate_output(generated_text: str, risk_level: str) -> dict:
  """Computes lightweight evaluation metrics (Keyword Precision & ROUGE-like overlap)

  to score the quality and factual alignment of the LLM output.
  """
  # Reference key terms expected in a professional agricultural risk report
  ideal_keywords = [
      "sécheresse",
      "risque",
      "précipitations",
      "sol",
      "prime",
      "culture",
      "agriculture",
      "tunisie",
  ]
  text_lower = generated_text.lower()

  # 1. Keyword Precision Metric
  found_keywords = [kw for kw in ideal_keywords if kw in text_lower]
  keyword_precision = len(found_keywords) / len(ideal_keywords)

  # 2. Alignment Metric (Checks if the specific risk level predicted by tool is mentioned)
  risk_alignment = 1.0 if risk_level.lower() in text_lower else 0.4

  # 3. Combined Quality Score (Scale 0 to 100)
  overall_score = round(
      (keyword_precision * 0.5 + risk_alignment * 0.5) * 100, 1
  )

  return {
      "keyword_precision": round(keyword_precision * 100, 1),
      "risk_alignment_score": round(risk_alignment * 100, 1),
      "overall_evaluation_score": overall_score,
  }


# ---------------------------------------------------------
# 3. STREAMLIT USER INTERFACE (NO SIDEBAR)
# ---------------------------------------------------------
st.title("🌾 Outil d'Évaluation des Risques Climatiques (Tunisie)")
st.markdown(
    "Assistant intelligent destiné aux banques et assureurs pour l'évaluation"
    " instantanée des risques agricoles par région."
)

tab1, tab2 = st.tabs(["💬 Assistant d'Évaluation", "🗺️ Carte des Régions"])

with tab1:
  st.subheader("Analyse rapide du risque pour une région")

  selected_region = st.selectbox(
      "Sélectionnez la région agricole :", list(TUNISIA_REGIONS.keys())
  )

  if st.button("Lancer l'Analyse de Risque"):
    api_key = os.environ.get("GROQ_API_KEY")

    if not api_key:
      st.error(
          "❌ Clé API Groq introuvable. Veuillez l'ajouter dans votre fichier"
          " local `.env`."
      )
    else:
      client = OpenAI(base_url=API_BASE_URL, api_key=api_key)

      with st.spinner(
          f"Analyse des données météo open-source pour {selected_region}..."
      ):
        tool_result = fetch_open_meteo_stats(selected_region)

        if "error" in tool_result:
          st.error(tool_result["error"])
        else:
          # Simplified, concise prompt optimized for non-experts
          prompt = f"""
                    Tu es un conseiller expert en assurance agricole en Tunisie. 
                    Données climatiques brutes: {tool_result}
                    
                    Rédige un rapport de synthèse extrêmement court, clair et simple (maximum 3 phrases) compréhensible par un banquier ou un non-technicien.
                    Structure ta réponse ainsi :
                    1. État du climat (pluie et humidité des sols).
                    2. Niveau de risque identifié.
                    3. Recommandation claire pour le crédit ou la prime d'assurance.
                    Réponds en français simple.
                    """

          response = client.chat.completions.create(
              model=MODEL_NAME,
              messages=[{"role": "user", "content": prompt}],
              temperature=0.2,
          )

          ai_report = response.choices[0].message.content

          # Run evaluation metrics on the generated text
          eval_metrics = evaluate_output(ai_report, tool_result["risk_level"])

          st.markdown("### 📊 Rapport d'Alerte & Recommandation")
          st.success(ai_report)

          # Display Evaluation Metrics for the Hackathon Judges
          with st.expander("📈 Métriques d'Évaluation du Modèle (LLM Eval)"):
            col_m1, col_m2, col_m3 = st.columns(3)
            col_m1.metric(
                "Précision Lexicale",
                f"{eval_metrics['keyword_precision']}%",
                help="Proportion de mots-clés agricoles clés présents.",
            )
            col_m2.metric(
                "Alignement des Risques",
                f"{eval_metrics['risk_alignment_score']}%",
                help=(
                    "Vérifie si le rapport reflète fidèlement le niveau de"
                    " risque technique."
                ),
            )
            col_m3.metric(
                "Score Global d'Évaluation",
                f"{eval_metrics['overall_evaluation_score']}/100",
            )

          with st.expander("🔍 Données Brutes de l'API Open-Meteo"):
            st.json(tool_result)

with tab2:
  st.subheader("Couverture des Régions Agricoles en Tunisie")
  map_df = pd.DataFrame(
      [
          {"lat": coords[0], "lon": coords[1], "Région": name}
          for name, coords in TUNISIA_REGIONS.items()
      ]
  )
  st.map(map_df, latitude="lat", longitude="lon", zoom=6)