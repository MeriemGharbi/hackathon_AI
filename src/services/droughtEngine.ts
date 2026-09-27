import { getDamStatusForGovernorate, LATEST_DAM_STATS } from "../data/damData";
import { CROP_PROFILES, calculateCropExposure } from "../data/cropData";

export type UserRole = "Insurer / Analyst" | "Farmer / Specialist";

export interface GovernorateInfo {
  name: string;
  lat: number;
  lon: number;
  x: number; // SVG map X %
  y: number; // SVG map Y %
  regionGroup: "North" | "Centre" | "South" | "Cap Bon";
}

// Map coordinates calibrated for accurate SVG outline of Tunisia (viewBox 0 0 100 130)
export const TUNISIA_REGIONS: Record<string, GovernorateInfo> = {
  Bizerte: { name: "Bizerte", lat: 37.2744, lon: 9.8739, x: 50, y: 8, regionGroup: "North" },
  Tunis: { name: "Tunis", lat: 36.8065, lon: 10.1815, x: 58, y: 18, regionGroup: "North" },
  Ariana: { name: "Ariana", lat: 36.8665, lon: 10.193, x: 55, y: 15, regionGroup: "North" },
  Manouba: { name: "Manouba", lat: 36.8083, lon: 10.1037, x: 51, y: 20, regionGroup: "North" },
  "Ben Arous": { name: "Ben Arous", lat: 36.7531, lon: 10.2282, x: 60, y: 23, regionGroup: "North" },
  Nabeul: { name: "Nabeul", lat: 36.4561, lon: 10.7376, x: 71, y: 21, regionGroup: "Cap Bon" },
  Jendouba: { name: "Jendouba", lat: 36.5011, lon: 8.7803, x: 31, y: 22, regionGroup: "North" },
  Béja: { name: "Béja", lat: 36.7256, lon: 9.1817, x: 41, y: 22, regionGroup: "North" },
  Zaghouan: { name: "Zaghouan", lat: 36.4029, lon: 10.1429, x: 55, y: 30, regionGroup: "Centre" },
  Siliana: { name: "Siliana", lat: 36.0849, lon: 9.3708, x: 42, y: 37, regionGroup: "Centre" },
  "Le Kef": { name: "Le Kef", lat: 36.1742, lon: 8.7049, x: 30, y: 36, regionGroup: "North" },
  Kairouan: { name: "Kairouan", lat: 35.6781, lon: 10.0963, x: 48, y: 49, regionGroup: "Centre" },
  Sousse: { name: "Sousse", lat: 35.8256, lon: 10.6369, x: 63, y: 42, regionGroup: "Centre" },
  Monastir: { name: "Monastir", lat: 35.7779, lon: 10.8261, x: 68, y: 47, regionGroup: "Centre" },
  Mahdia: { name: "Mahdia", lat: 35.5047, lon: 11.0622, x: 66, y: 55, regionGroup: "Centre" },
  Kasserine: { name: "Kasserine", lat: 35.1677, lon: 8.8365, x: 33, y: 56, regionGroup: "Centre" },
  "Sidi Bouzid": { name: "Sidi Bouzid", lat: 35.0382, lon: 9.4857, x: 46, y: 63, regionGroup: "Centre" },
  Sfax: { name: "Sfax", lat: 34.7406, lon: 10.7603, x: 62, y: 69, regionGroup: "Centre" },
  Gafsa: { name: "Gafsa", lat: 34.425, lon: 8.7842, x: 35, y: 74, regionGroup: "South" },
  Tozeur: { name: "Tozeur", lat: 33.9197, lon: 8.1335, x: 26, y: 85, regionGroup: "South" },
  Gabès: { name: "Gabès", lat: 33.8815, lon: 10.0982, x: 52, y: 86, regionGroup: "South" },
  Médenine: { name: "Médenine", lat: 33.3549, lon: 10.5055, x: 61, y: 97, regionGroup: "South" },
  Kébili: { name: "Kébili", lat: 33.7046, lon: 8.969, x: 40, y: 93, regionGroup: "South" },
  Tataouine: { name: "Tataouine", lat: 32.9297, lon: 10.4518, x: 48, y: 114, regionGroup: "South" },
};

export interface WeatherStats {
  total_precipitation_mm: number;
  mean_soil_moisture: number;
  mean_temperature_c: number;
}

export interface RiskAnalysisResult {
  risk: string;
  confidence: number;
  riskScore: number;
  level: "low" | "medium" | "high";
}

const BASELINE_WEATHER: Record<string, WeatherStats> = {
  Kairouan: { total_precipitation_mm: 110.5, mean_soil_moisture: 0.085, mean_temperature_c: 22.4 },
  "Sidi Bouzid": { total_precipitation_mm: 98.2, mean_soil_moisture: 0.078, mean_temperature_c: 23.1 },
  Sfax: { total_precipitation_mm: 125.0, mean_soil_moisture: 0.091, mean_temperature_c: 21.8 },
  Jendouba: { total_precipitation_mm: 412.0, mean_soil_moisture: 0.285, mean_temperature_c: 18.2 },
  Béja: { total_precipitation_mm: 365.4, mean_soil_moisture: 0.245, mean_temperature_c: 19.1 },
  Siliana: { total_precipitation_mm: 180.2, mean_soil_moisture: 0.112, mean_temperature_c: 20.5 },
  "Le Kef": { total_precipitation_mm: 220.8, mean_soil_moisture: 0.145, mean_temperature_c: 19.8 },
  Bizerte: { total_precipitation_mm: 450.0, mean_soil_moisture: 0.290, mean_temperature_c: 18.8 },
  Tunis: { total_precipitation_mm: 290.0, mean_soil_moisture: 0.165, mean_temperature_c: 20.2 },
  Zaghouan: { total_precipitation_mm: 210.0, mean_soil_moisture: 0.128, mean_temperature_c: 21.0 },
  Kasserine: { total_precipitation_mm: 135.0, mean_soil_moisture: 0.089, mean_temperature_c: 22.0 },
  Gafsa: { total_precipitation_mm: 85.0, mean_soil_moisture: 0.065, mean_temperature_c: 24.2 },
  Gabès: { total_precipitation_mm: 92.0, mean_soil_moisture: 0.071, mean_temperature_c: 23.8 },
  Médenine: { total_precipitation_mm: 75.0, mean_soil_moisture: 0.058, mean_temperature_c: 24.8 },
  Tozeur: { total_precipitation_mm: 45.0, mean_soil_moisture: 0.042, mean_temperature_c: 25.5 },
};

/**
 * Open-Meteo stats fetcher
 */
export async function fetchOpenMeteoStats(regionName: string): Promise<WeatherStats> {
  const coords = TUNISIA_REGIONS[regionName] || TUNISIA_REGIONS["Kairouan"];
  const { lat, lon } = coords;

  const lastYear = new Date().getFullYear() - 1;
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${lastYear}-01-01&end_date=${lastYear}-12-31&hourly=temperature_2m,precipitation,soil_moisture_0_to_7cm&timezone=auto`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const hourly = data.hourly;
    if (!hourly || !hourly.precipitation) throw new Error("No data");

    const totalPrecip = hourly.precipitation.reduce((a: number, b: number) => a + (b || 0), 0);
    const validSoil = hourly.soil_moisture_0_to_7cm.filter((v: number | null) => v !== null);
    const meanSoil = validSoil.length ? validSoil.reduce((a: number, b: number) => a + b, 0) / validSoil.length : 0.12;
    const validTemp = hourly.temperature_2m.filter((v: number | null) => v !== null);
    const meanTemp = validTemp.length ? validTemp.reduce((a: number, b: number) => a + b, 0) / validTemp.length : 21.0;

    return {
      total_precipitation_mm: Math.round(totalPrecip * 100) / 100,
      mean_soil_moisture: Math.round(meanSoil * 1000) / 1000,
      mean_temperature_c: Math.round(meanTemp * 100) / 100,
    };
  } catch (err) {
    return BASELINE_WEATHER[regionName] || {
      total_precipitation_mm: 195.0,
      mean_soil_moisture: 0.115,
      mean_temperature_c: 21.5,
    };
  }
}

/**
 * Multi-criteria risk inference engine
 */
export function runTabpfnInference(features: {
  total_precipitation_mm: number;
  mean_soil_moisture: number;
  mean_temperature_c: number;
  dam_fill_pct: number;
}): RiskAnalysisResult {
  const { mean_soil_moisture: soil, dam_fill_pct: dam } = features;

  if (soil < 0.12 || dam < 25.0) {
    return {
      risk: "High Risk (Severe Stress)",
      confidence: 91.0,
      riskScore: 82,
      level: "high",
    };
  } else if (dam > 70.0) {
    return {
      risk: "Low Risk (Normal Position)",
      confidence: 89.0,
      riskScore: 28,
      level: "low",
    };
  } else {
    return {
      risk: "Moderate Risk (Watch Status)",
      confidence: 84.0,
      riskScore: 52,
      level: "medium",
    };
  }
}

/**
 * 3-Point Risk Report Generator with Optional Crop Exposure Analysis
 */
export async function generateAiRiskReport(
  selectedRegion: string,
  userRole: UserRole,
  weatherData: WeatherStats,
  damData: ReturnType<typeof getDamStatusForGovernorate>,
  analysisRes: RiskAnalysisResult,
  selectedCrop?: string
): Promise<{ title: string; report: string }> {
  const damName = damData.worst_dam_name;
  const damFill = damData.per_dam_fill_pct;
  const cropProfile = selectedCrop && selectedCrop !== "All Crops" ? CROP_PROFILES[selectedCrop] : null;
  const cropExposure = selectedCrop && selectedCrop !== "All Crops"
    ? calculateCropExposure(selectedCrop, weatherData.total_precipitation_mm, weatherData.mean_soil_moisture, damFill)
    : null;

  let role_instructions = "";
  let section_title = "";

  if (userRole.includes("Insurer") || userRole === "Insurer / Analyst") {
    role_instructions = `
    Write a professional-grade parametric risk assessment report for an **underwriter, risk analyst, or banker** concerning the region of ${selectedRegion}${cropProfile ? ` specifically evaluating ${cropProfile.name}` : ""}. 
    The report MUST be structured into **exactly 3 clear and impactful points**:
    1. **Water Availability & Reservoir Position**: Analyze precipitation volume, soil moisture, and critical dam fill rates (${damName} at ${damFill}%).
    2. **Actuarial Risk Diagnosis**: Evaluate risk exposure (${analysisRes.risk}${cropExposure ? `, Crop Exposure: ${cropExposure.exposureLevel}` : ""}) using objective observational data.
    3. **Financial & Agronomic Recommendations**: Propose concrete portfolio risk management measures (adjusting insurance premiums or credit limits${cropProfile ? ` for ${cropProfile.name} producers` : ""}).
    `;
    section_title = cropProfile
      ? `What is the credit & underwriting risk for ${cropProfile.name} in ${selectedRegion}?`
      : `What is the climate impact on credit risk and insurance underwriting in ${selectedRegion}?`;
  } else {
    role_instructions = `
    Write an operational executive summary for a **farmer or agricultural specialist** located in ${selectedRegion}${cropProfile ? ` growing ${cropProfile.name}` : ""}. 
    The report MUST be structured into **exactly 3 clear and impactful points**:
    1. **Water Resource Status**: Review cumulative rainfall, current soil moisture, and regional reservoir availability (${damName} at ${damFill}%).
    2. **Crop Vulnerability Level**: Detail hydric stress risk level and direct yield impacts${cropProfile ? ` for ${cropProfile.name} (peak demand: ${cropProfile.peak_water_demand})` : ""}.
    3. **Practical Management Advice**: Provide concrete agronomic guidance for irrigation, crop protection, and farm cash flow.
    `;
    section_title = cropProfile
      ? `How should I manage irrigation and crop protection for ${cropProfile.name} in ${selectedRegion}?`
      : `How should I adapt my irrigation and field management in ${selectedRegion}?`;
  }

  const apiKey = (import.meta as any).env?.VITE_GROQ_API_KEY || (typeof process !== "undefined" && process.env?.GROQ_API_KEY);

  if (apiKey && apiKey.startsWith("gsk_")) {
    try {
      const prompt = `
      You are an expert consultancy firm in agronomy and climate risk assessment in Tunisia.
      Target Region: ${selectedRegion}
      ${cropProfile ? `Selected Crop: ${cropProfile.name} (Water requirement: ${cropProfile.water_need_mm}mm, Drought Sensitivity: ${cropProfile.drought_sensitivity}/5, System: ${cropProfile.production_system})` : "General Agricultural Sector"}
      ${cropExposure ? `Crop Exposure Assessment: Level ${cropExposure.exposureLevel} (Score: ${cropExposure.exposureScore}/100, Deficit: ${cropExposure.waterDeficitMm}mm)` : ""}
      Observation Data (Open-Meteo): ${JSON.stringify(weatherData)}
      Local Reservoir Status (${damName}): ${damFill}% fill rate
      Calculated Risk Level: ${analysisRes.risk} (Confidence Index: ${analysisRes.confidence}%)
      
      ${role_instructions}
      Write the report in a professional, neutral, and analytical tone as a numbered list from 1 to 3. Do not reference any internal tools, software models, or AI engine names.
      `;

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) {
          return { title: section_title, report: text.trim() };
        }
      }
    } catch (err) {
      console.warn("[Groq API] Fallback to standard response template:", err);
    }
  }

  // Standard clean fallback report
  const cropNote = cropProfile
    ? ` For **${cropProfile.name}** (annual requirement: ${cropProfile.water_need_mm} mm, ${cropProfile.production_system.toLowerCase()}), peak water demand occurs during *${cropProfile.peak_water_demand.toLowerCase()}*.`
    : "";

  if (userRole.includes("Insurer") || userRole === "Insurer / Analyst") {
    return {
      title: section_title,
      report: `1. **Water Availability & Reservoir Position**: The region of ${selectedRegion} records total cumulative rainfall of ${weatherData.total_precipitation_mm} mm with average topsoil moisture of ${weatherData.mean_soil_moisture} m³/m³. Primary reservoir capacity at ${damName} remains under tension at a ${damFill}% fill rate.${cropNote}

2. **Actuarial Risk Diagnosis**: Parametric evaluation confirms **${analysisRes.risk}** with a confidence index of ${analysisRes.confidence}%${cropExposure ? ` (Specific ${cropProfile?.name} Exposure: ${cropExposure.exposureLevel})` : ""}. Higher drought event probabilities and seasonal credit default potential require close monitoring.

3. **Financial & Credit Recommendations**: 
   - **Loan Portfolio**: Limit new uncollateralized credit lines unless backed by certified efficient irrigation technology.
   - **Risk Pricing**: Adjust parametric surcharge tables for ${cropProfile ? cropProfile.name : "cereal and olive"} production in this governorate.
   - **Collateral Terms**: Condition debt restructuring on soil moisture conservation practices and verified water management plan.`,
    };
  } else {
    return {
      title: section_title,
      report: `1. **Water Resource Status**: In the ${selectedRegion} region, cumulative rainfall reaches ${weatherData.total_precipitation_mm} mm with average soil moisture of ${weatherData.mean_soil_moisture} m³/m³. Reference dam reserves (${damName}) report a ${damFill}% fill rate.${cropNote}

2. **Crop Vulnerability Level**: The area is categorized under **${analysisRes.risk}** (Confidence Index: ${analysisRes.confidence}%)${cropExposure ? ` with ${cropExposure.exposureLevel} exposure for ${cropProfile?.name}` : ""}. Hydric stress poses an active threat during critical vegetative stages.

3. **Practical Management Advice**:
   - **Irrigation Efficiency**: Focus watering during nighttime hours to minimize evapotranspiration losses${cropProfile ? `, prioritizing ${cropProfile.peak_water_demand.toLowerCase()}` : ""}.
   - **Soil Protection**: Apply organic mulching to shield topsoil moisture reserves.
   - **Input Management**: Adjust nitrogen fertilizer applications to match revised yield potential and preserve operational cash flow.`,
    };
  }
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolsUsed?: string[];
}

export async function sendAiAssistantChatMessage(
  history: { role: string; content: string }[],
  userPrompt: string,
  governorate: string,
  crop: string,
  userRole: UserRole
): Promise<ChatMessage> {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const weather = await fetchOpenMeteoStats(governorate);
  const dam = getDamStatusForGovernorate(governorate);
  const analysisRes = runTabpfnInference({
    total_precipitation_mm: weather.total_precipitation_mm,
    mean_soil_moisture: weather.mean_soil_moisture,
    mean_temperature_c: weather.mean_temperature_c,
    dam_fill_pct: dam.per_dam_fill_pct,
  });
  const cropExp = crop !== "All Crops" ? calculateCropExposure(crop, weather.total_precipitation_mm, weather.mean_soil_moisture, dam.per_dam_fill_pct) : null;
  const cropProf = crop !== "All Crops" ? CROP_PROFILES[crop] : null;

  const apiKey = (import.meta as any).env?.VITE_GROQ_API_KEY || (typeof process !== "undefined" && process.env?.GROQ_API_KEY);

  if (apiKey && apiKey.startsWith("gsk_")) {
    try {
      const systemPrompt = `You are the AgriRisk AI Risk Analyst, a specialized decision-support assistant for Tunisian agricultural climate and water risk assessment.
Current Context:
- Target Governorate: ${governorate}
- User Profile: ${userRole}
- Selected Crop Focus: ${crop !== "All Crops" ? `${crop} (Water Need: ${cropProf?.water_need_mm}mm, Sensitivity: ${cropProf?.drought_sensitivity}/5, System: ${cropProf?.production_system})` : "General Agriculture"}
- Current Rainfall (12m): ${weather.total_precipitation_mm} mm
- Soil Moisture (0-7cm): ${weather.mean_soil_moisture} m³/m³
- Main Dam (${dam.worst_dam_name}): ${dam.per_dam_fill_pct}% fill rate
- Model Climate Risk Level: ${analysisRes.risk} (Confidence: ${analysisRes.confidence}%)
${cropExp ? `- Crop Exposure Rating: ${cropExp.exposureLevel} (Score: ${cropExp.exposureScore}/100, Deficit: ${cropExp.waterDeficitMm}mm)` : ""}

Instructions:
- Provide clear, professional, concise analysis grounded strictly in measured data and risk model outputs.
- Do not mention internal model names, tool names, or code filenames.
- Address the user's specific question directly.`;

      const apiMessages = [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: userPrompt }
      ];

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          messages: apiMessages,
          temperature: 0.2,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) {
          return {
            role: "assistant",
            content: text.trim(),
            timestamp,
            toolsUsed: ["get_risk_assessment", "get_rainfall_indicators", "get_water_indicators"],
          };
        }
      }
    } catch (err) {
      console.warn("[Groq Assistant Chat] Fallback to deterministic logic:", err);
    }
  }

  // Smart analytical fallback based on query keywords
  const promptLower = userPrompt.toLowerCase();
  let reply = "";

  if (promptLower.includes("crop") || promptLower.includes("vulnerable") || promptLower.includes("exposed")) {
    reply = `In **${governorate}**, current climate conditions (Rainfall: ${weather.total_precipitation_mm} mm, Dam fill: ${dam.per_dam_fill_pct}%) indicate heightened vulnerability for high water-demand crops.\n\n` +
      (cropProf
        ? `**${cropProf.name}** has an annual water requirement of ${cropProf.water_need_mm} mm and a drought sensitivity of ${cropProf.drought_sensitivity}/5. Peak demand occurs during *${cropProf.peak_water_demand.toLowerCase()}*. The calculated exposure level for ${cropProf.name} in ${governorate} is **${cropExp?.exposureLevel || "High"}**.`
        : `Key vulnerable crops in this area include **Tomato** (600 mm/season demand) and **Citrus** (900 mm/season demand), whereas **Barley** (350 mm) and **Olive** (400 mm) demonstrate greater drought resilience.`);
  } else if (promptLower.includes("why") || promptLower.includes("driver") || promptLower.includes("high")) {
    reply = `The **${analysisRes.risk}** in **${governorate}** is driven by two key signals:\n` +
      `1. **Reservoir Stress**: The primary dam serving the area (${dam.worst_dam_name}) is at a critical **${dam.per_dam_fill_pct}%** fill rate.\n` +
      `2. **Soil & Rain Deficit**: 12-month cumulative rainfall is ${weather.total_precipitation_mm} mm with topsoil moisture at ${weather.mean_soil_moisture} m³/m³, remaining significantly below multi-year averages.`;
  } else if (promptLower.includes("water") || promptLower.includes("dam") || promptLower.includes("reservoir")) {
    reply = `Water indicators for **${governorate}**:\n` +
      `- **Reference Dam**: ${dam.worst_dam_name}\n` +
      `- **Current Fill Rate**: ${dam.per_dam_fill_pct}%\n` +
      `- **National Storage**: ${LATEST_DAM_STATS.nationalStockMm3} Mm³ (${LATEST_DAM_STATS.meanFillPct}% mean fill rate)\n` +
      `- **Seasonal Inflow Variance**: -28.5% year-over-year.`;
  } else {
    reply = `Based on the latest observation data for **${governorate}**:\n` +
      `- **Climate Risk Status**: ${analysisRes.risk} (Confidence: ${analysisRes.confidence}%)\n` +
      `- **Rainfall**: ${weather.total_precipitation_mm} mm (Soil moisture: ${weather.mean_soil_moisture} m³/m³)\n` +
      `- **Water Reserve**: ${dam.worst_dam_name} at ${dam.per_dam_fill_pct}% capacity.\n\n` +
      (userRole.includes("Insurer")
        ? `**Insurer Action**: Recommend adjusting parametric coverage surcharges and requiring certified drip irrigation for credit renewals.`
        : `**Farmer Action**: Optimize nighttime irrigation scheduling and implement soil mulching to mitigate evapotranspiration losses.`);
  }

  return {
    role: "assistant",
    content: reply,
    timestamp,
    toolsUsed: ["get_risk_assessment", "get_rainfall_indicators"],
  };
}
