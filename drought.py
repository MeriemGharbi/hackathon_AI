import os

import pandas as pd
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
#    (shared services live in the `agrisk` package — no duplicated logic)
# ---------------------------------------------------------
from agrisk.chat.session import load_session, save_session, sync_selectors
from agrisk.config import API_BASE_URL, LLM_MAX_RETRIES, MODEL_NAME
from agrisk.regions import TUNISIA_REGIONS
from agrisk.services.crops import CROP_PROFILES, assess_crop_exposure_from_indicators
from agrisk.services.dam import get_water_indicators
from agrisk.services.rainfall import fetch_open_meteo_stats

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


def _store_analyst_context(region, crop, tool_result, water, exposure):
  """Seed the AI Analyst session with this run's assessments."""
  session = load_session(st.session_state)
  context = session["context"]
  context.governorate = region
  context.crop = crop
  context.apply_assessment(
      {
          "region": tool_result.get("region"),
          "risk": tool_result.get("risk"),
          "indicators": tool_result.get("indicators"),
          "water": water,
          "crop_exposure": exposure,
      }
  )
  save_session(st.session_state, session["messages"], context)
  sync_selectors(st.session_state, region, crop, context.period)


# ---------------------------------------------------------
# 3. STREAMLIT USER INTERFACE (NO SIDEBAR)
# ---------------------------------------------------------
st.title("🌾 Outil d'Évaluation des Risques Climatiques (Tunisie)")
st.markdown(
    "Assistant intelligent destiné aux banques et assureurs pour l'évaluation"
    " instantanée des risques agricoles par région."
)

st.page_link(
    "pages/1_AI_Risk_Analyst.py",
    label="Ouvrir l'AI Risk Analyst (chat)",
    icon=":material/smart_toy:",
)

tab1, tab2 = st.tabs(["💬 Assistant d'Évaluation", "🗺️ Carte des Régions"])

with tab1:
  st.subheader("Analyse rapide du risque pour une région")

  selected_region = st.selectbox(
      "Sélectionnez la région agricole :", list(TUNISIA_REGIONS.keys())
  )
  selected_crop = st.selectbox(
      "Sélectionnez la culture :", sorted(CROP_PROFILES.keys())
  )

  if st.button("Lancer l'Analyse de Risque"):
    api_key = os.environ.get("GROQ_API_KEY")

    if not api_key:
      st.error(
          "❌ Clé API Groq introuvable. Veuillez l'ajouter dans votre fichier"
          " local `.env`."
      )
    else:
      client = OpenAI(
          base_url=API_BASE_URL, api_key=api_key, max_retries=LLM_MAX_RETRIES
      )

      with st.spinner(
          f"Analyse des données météo open-source pour {selected_region}..."
      ):
        tool_result = fetch_open_meteo_stats(selected_region)

        if "error" in tool_result:
          st.error(tool_result["error"])
        else:
          # Water + crop exposure come from the same services used by the analyst
          water = get_water_indicators(selected_region)
          if "error" in water:
            water = None
          exposure = assess_crop_exposure_from_indicators(
              tool_result["indicators"], selected_crop, water
          )
          if "error" in exposure:
            exposure = None

          _store_analyst_context(
              selected_region, selected_crop, tool_result, water, exposure
          )

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

          # The narrative report is optional: a rate limit or API hiccup must
          # never take down the deterministic indicators rendered below.
          ai_report = None
          try:
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
            )
            ai_report = response.choices[0].message.content
          except Exception as exc:
            st.error(
                "Rapport LLM indisponible en ce moment"
                f" ({type(exc).__name__}). Les indicateurs ci-dessous restent"
                " valables — relancez l'analyse dans quelques instants."
            )

          if ai_report:
            # Run evaluation metrics on the generated text
            eval_metrics = evaluate_output(ai_report, tool_result["risk_level"])

            st.markdown("### 📊 Rapport d'Alerte & Recommandation")
            st.success(ai_report)

          st.markdown("### 💧 Eau & exposition culture")
          col_water, col_crop = st.columns(2)
          with col_water:
            if water:
              st.metric(
                  "Taux de remplissage (pire barrage)",
                  f"{water['dam_fill_rate_pct']}%",
                  help=f"{water['worst_dam_name']} — {water['date']}",
              )
              st.caption(
                  f"Stock national vs année dernière :"
                  f" {water['stock_vs_last_year_pct']:+}% ·"
                  f" Entrées de saison :"
                  f" {water['seasonal_inflow_change_pct']:+}%"
              )
            else:
              st.info(
                  f"Aucune donnée de barrage pour {selected_region} —"
                  " analyse fondée sur les indicateurs climatiques."
              )
          with col_crop:
            if exposure:
              st.metric(
                  f"Exposition {selected_crop}",
                  exposure["exposure_level"],
                  help="Exposition régionale (climat x sensibilité culture),"
                       " pas une prédiction de rendement.",
              )
              st.caption(f"Score d'exposition : {exposure['exposure_score']}/100")
            else:
              st.info("Exposition culture non disponible.")

          # Display Evaluation Metrics for the Hackathon Judges
          if ai_report:
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
                      "Vérifie que le rapport reflète fidèlement le niveau de"
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
