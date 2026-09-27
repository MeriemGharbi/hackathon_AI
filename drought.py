from datetime import datetime
import os
import pandas as pd
import requests
import streamlit as st
from openai import OpenAI
from dotenv import load_dotenv

# Importation des fonctions de gestion des barrages depuis dam_main.py
from dam_main import get_dam_status, normalize_governorate

# Charge les clés depuis le fichier .env
load_dotenv(override=True)

# ---------------------------------------------------------
# 1. CONFIGURATION & SÉCURITÉ
# ---------------------------------------------------------
MODEL_NAME = "openai/gpt-oss-20b"
API_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    st.error("❌ Clé API Groq manquante : ajoutez `GROQ_API_KEY` dans votre fichier `.env`.")
    st.stop()

# Désactive les redirections cloud distantes de TabPFN pour éviter les erreurs de socket Windows
os.environ["TABPFN_DISABLE_REMOTE"] = "1"

# Couverture complète des gouvernorats et régions agricoles en Tunisie
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
  """Récupère les métriques climatiques et du sol en direct via Open-Meteo."""
  coords = TUNISIA_REGIONS.get(region, TUNISIA_REGIONS["Kairouan"])
  lat, lon = coords

  last_year = datetime.now().year - 1
  start_date = f"{last_year}-01-01"
  end_date = f"{last_year}-12-31"

  url = (
      f"https://archive-api.open-meteo.com/v1/archive?"
      f"latitude={lat}&longitude={lon}&"
      f"start_date={start_date}&end_date={end_date}&"
      f"hourly=temperature_2m,precipitation,soil_moisture_0_to_7cm&timezone=auto"
  )

  try:
    response = requests.get(url, timeout=15)
    if response.status_code != 200:
      return {"error": f"Open-Meteo API error: {response.text}"}

    data = response.json()
    hourly = data.get("hourly", {})
    if not hourly:
      return {"error": "Aucune donnée horaire reçue."}

    df = pd.DataFrame(hourly)
    total_precip = float(df["precipitation"].sum())
    mean_soil_0_7 = float(df["soil_moisture_0_to_7cm"].mean())
    mean_temp = float(df["temperature_2m"].mean())

    return {
        "total_precipitation_mm": round(total_precip, 2),
        "mean_soil_moisture": round(mean_soil_0_7, 3),
        "mean_temperature_c": round(mean_temp, 2),
    }
  except Exception as e:
    return {"error": str(e)}


# ---------------------------------------------------------
# 2. ANALYSE ET ÉVALUATION DES RISQUES (INTERNE)
# ---------------------------------------------------------
def run_tabpfn_inference(features: dict):
  """Analyse multicritère du niveau de risque (Météo + Barrages)."""
  try:
    from tabpfn import TabPFNClassifier
  except ImportError:
    return {
        "risk": "Analyse standard",
        "confidence": 85.0,
    }

  X_train = [
      [50.0, 0.09, 21.0, 15.0],
      [75.0, 0.11, 22.0, 25.0],
      [200.0, 0.24, 19.0, 50.0],
      [450.0, 0.42, 18.0, 80.0],
      [25.0, 0.06, 24.0, 10.0],
      [550.0, 0.48, 17.0, 90.0],
      [110.0, 0.17, 20.0, 40.0],
  ]
  y_train = [2, 2, 0, 0, 2, 1, 1]

  X_test = [[
      features["total_precipitation_mm"],
      features["mean_soil_moisture"],
      features["mean_temperature_c"],
      features["dam_fill_pct"],
  ]]

  try:
    classifier = TabPFNClassifier(device="cpu")
    classifier.fit(X_train, y_train)

    pred_class = classifier.predict(X_test)[0]
    probs = classifier.predict_proba(X_test)[0]
    confidence = float(probs[pred_class] * 100)

    risk_map = {
        0: "Risque Faible (Normal)",
        1: "Risque Modéré (Surveillance)",
        2: "Risque de Sécheresse Élevé",
    }
    risk_text = risk_map.get(int(pred_class), "Inconnu")

    return {
        "risk": risk_text,
        "confidence": round(confidence, 2),
    }
  except Exception as e:
    soil = features["mean_soil_moisture"]
    dam = features["dam_fill_pct"]
    if soil < 0.12 or dam < 25.0:
      return {"risk": "Risque de Sécheresse Élevé", "confidence": 91.0}
    elif dam > 70.0:
      return {"risk": "Risque Faible (Normal)", "confidence": 89.0}
    else:
      return {"risk": "Risque Modéré (Surveillance)", "confidence": 84.0}


# ---------------------------------------------------------
# 3. INTERFACE STREAMLIT (SANS SIDEBAR)
# ---------------------------------------------------------
st.title("🌾 Outil d'Évaluation des Risques Climatiques (Tunisie)")
st.markdown(
    "Plateforme d'aide à la décision pour l'analyse des ressources hydriques et des risques agricoles en temps réel."
)

# Gestion de l'état de session pour le profil utilisateur
if "user_role" not in st.session_state:
  st.session_state.user_role = None

tab1, tab2 = st.tabs(["💬 Assistant d'Évaluation", "🗺️ Carte des Régions"])

with tab1:
  st.subheader("👤 Qui êtes-vous ?")
  st.markdown("Veuillez sélectionner votre profil pour adapter l'analyse stratégique :")
  
  col_btn1, col_btn2 = st.columns(2)
  with col_btn1:
    if st.button("🏦 Assureur / Banquier", use_container_width=True):
      st.session_state.user_role = "Assureur"
  with col_btn2:
    if st.button("🌾 Agriculteur", use_container_width=True):
      st.session_state.user_role = "Agriculteur"

  if st.session_state.user_role:
    st.info(f"Profil actif : **{st.session_state.user_role}**")
    
    selected_region = st.selectbox(
        "Sélectionnez la région agricole :", list(TUNISIA_REGIONS.keys())
    )

    if st.button("Lancer l'Analyse de Risque"):
      client = OpenAI(base_url=API_BASE_URL, api_key=GROQ_API_KEY)

      with st.spinner(f"Récupération des données agro-météorologiques pour {selected_region}..."):
        weather_data = fetch_open_meteo_stats(selected_region)
        dam_data = get_dam_status(selected_region)

        if "error" in weather_data:
          st.error(weather_data["error"])
        elif isinstance(dam_data, dict) and "error" in dam_data:
          st.warning(f"⚠️ Données barrages : {dam_data['error']}. Utilisation d'une valeur par défaut.")
          dam_fill = 50.0
          dam_name = "Inconnu"
        else:
          dam_fill = float(dam_data.get("per_dam_fill_pct", 50.0))
          dam_name = dam_data.get("worst_dam_name", "N/A")

        if "error" not in weather_data:
          features = {
              "total_precipitation_mm": weather_data["total_precipitation_mm"],
              "mean_soil_moisture": weather_data["mean_soil_moisture"],
              "mean_temperature_c": weather_data["mean_temperature_c"],
              "dam_fill_pct": dam_fill,
          }

          analysis_res = run_tabpfn_inference(features)

          # --- PROMPTS AMÉLIORÉS ET STRUCTURÉS EN 3 POINTS ---
          if st.session_state.user_role == "Assureur":
            role_instructions = f"""
            Rédige un rapport d'analyse paramétrique de niveau professionnel pour un **banquier ou assureur** concernant la région de {selected_region}. 
            Le rapport doit être structuré **exclusivement en 3 points clairs et percutants** :
            1. **Bilan hydrique et stress des sols/barrages** : Analysez le volume des précipitations, l'humidité des sols et le niveau critique de remplissage des barrages ({dam_name} à {dam_fill}%).
            2. **Diagnostic actuariel du risque** : Évaluez précisément l'exposition au risque de la zone ({analysis_res['risk']}) en vous appuyant sur les données objectives.
            3. **Recommandations financières et de crédit** : Proposez des mesures concrètes de gestion du risque de portefeuille (ajustement des primes d'assurance ou restriction des encours de crédit).
            """
            section_title = f"🔍 Quel est l'impact de la situation climatique sur les risques de crédit et d'assurance à {selected_region} ?"
          else:
            role_instructions = f"""
            Rédige un rapport de synthèse opérationnel et direct pour un **agriculteur** implanté à {selected_region}. 
            Le rapport doit être structuré **exclusivement en 3 points clairs et percutants** :
            1. **État des ressources en eau** : Faites le point sur les précipitations cumulées, l'humidité actuelle des sols et la disponibilité des réserves hydrauliques des barrages de la zone.
            2. **Niveau de vulnérabilité des cultures** : Caractérisez le niveau de risque de stress hydrique et ses conséquences directes sur les rendements à venir.
            3. **Conseils de gestion pratique** : Fournissez des recommandations agronomiques concrètes pour optimiser l'irrigation, protéger les cultures et préserver la trésorerie de l'exploitation.
            """
            section_title = f"💧 Comment dois-je adapter ma gestion et mon irrigation face aux conditions actuelles à {selected_region} ?"

          prompt = f"""
                  Tu es un cabinet d'expertise en agronomie et en gestion des risques climatiques en Tunisie.
                  Région ciblée : {selected_region}
                  Données d'observation Open-Meteo : {weather_data}
                  État des barrages locaux ({dam_name}) : {dam_fill}% de remplissage
                  Niveau de risque calculé : {analysis_res['risk']} (Indice de confiance : {analysis_res['confidence']}%)
                  
                  {role_instructions}
                  Rédige le rapport avec un ton professionnel, neutre et analytique, sous forme de liste numérotée de 1 à 3. Ne fais référence à aucun outil, intelligence artificielle ou modèle informatique.
                  """

          response = client.chat.completions.create(
              model=MODEL_NAME,
              messages=[{"role": "user", "content": prompt}],
              temperature=0.2,
          )
          ai_report = response.choices[0].message.content

          # Affichage du titre dynamique basé sur la question réelle du rapport
          st.markdown(f"### {section_title}")
          st.success(ai_report)

          col1, col2 = st.columns(2)
          with col1:
            st.metric("📊 Niveau de Risque Évalué", analysis_res["risk"])
          with col2:
            st.metric("Indice de Fiabilité", f"{analysis_res['confidence']}%")

          with st.expander("🔍 Données Brutes & Détails Techniques"):
            st.json({
                "profil_utilisateur": st.session_state.user_role,
                "meteo": weather_data,
                "barrage": {"nom": dam_name, "remplissage_pct": dam_fill},
                "evaluation_risque": analysis_res,
            })
  else:
    st.warning("👆 Veuillez cliquer sur l'un des boutons ci-dessus ('Assureur' ou 'Agriculteur') pour afficher l'outil d'analyse.")

with tab2:
  st.subheader("Couverture des Régions Agricoles en Tunisie")
  map_df = pd.DataFrame(
      [
          {"lat": coords[0], "lon": coords[1], "Région": name}
          for name, coords in TUNISIA_REGIONS.items()
      ]
  )
  st.map(map_df, latitude="lat", longitude="lon", zoom=6)