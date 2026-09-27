export interface CropProfile {
  name: string;
  water_need_mm: number;
  drought_sensitivity: number; // 1 = resilient, 5 = very sensitive
  season: string;
  peak_water_demand: string;
  production_system: string;
  profile_note: string;
}

export const CROP_PROFILES: Record<string, CropProfile> = {
  "Tomato": {
    name: "Tomato",
    water_need_mm: 600,
    drought_sensitivity: 4,
    season: "Spring-summer (Mar-Jul)",
    peak_water_demand: "Flowering to fruit set",
    production_system: "Mostly irrigated",
    profile_note: "Short cycle with high evapotranspiration demand; strongly sensitive to water stress at flowering and fruit set.",
  },
  "Durum wheat": {
    name: "Durum wheat",
    water_need_mm: 450,
    drought_sensitivity: 3,
    season: "Winter (Nov-May)",
    peak_water_demand: "Tillering to grain filling",
    production_system: "Rainfed with irrigated pockets",
    profile_note: "Main cereal of the Tunisian drylands; yield formation is highly dependent on spring rainfall distribution.",
  },
  "Barley": {
    name: "Barley",
    water_need_mm: 350,
    drought_sensitivity: 2,
    season: "Winter (Nov-May)",
    peak_water_demand: "Tillering to heading",
    production_system: "Mainly rainfed",
    profile_note: "The most drought-tolerant cereal in Tunisia, widely grown on the Central and Southern plains.",
  },
  "Olive": {
    name: "Olive",
    water_need_mm: 400,
    drought_sensitivity: 2,
    season: "Perennial, alternate bearing",
    peak_water_demand: "Fruit development (Jun-Aug)",
    production_system: "Largely rainfed",
    profile_note: "Deep-rooted and drought-tolerant, but sustained multi-season water stress reduces olive yield and oil content.",
  },
  "Date palm": {
    name: "Date palm",
    water_need_mm: 900,
    drought_sensitivity: 3,
    season: "Perennial (oasis systems)",
    peak_water_demand: "Fruit bunch development (May-Jul)",
    production_system: "Irrigated oasis agriculture",
    profile_note: "High water requirement; depends on reliable groundwater and oasis irrigation rather than on reservoir releases alone.",
  },
  "Citrus": {
    name: "Citrus",
    water_need_mm: 900,
    drought_sensitivity: 4,
    season: "Perennial, harvest (Nov-Feb)",
    peak_water_demand: "Fruit swelling (Jun-Sep)",
    production_system: "Intensively irrigated",
    profile_note: "Very sensitive to irrigation deficits; even short deficits during fruit swelling cause quality and size losses.",
  },
  "Grapevine": {
    name: "Grapevine",
    water_need_mm: 550,
    drought_sensitivity: 3,
    season: "Perennial (Mar-Sep)",
    peak_water_demand: "Veraison to ripening (Jul-Aug)",
    production_system: "Irrigated and rainfed vineyards",
    profile_note: "Moderate deficit can be tolerated deliberately; severe or prolonged stress shifts balance between vegetative growth and berry quality.",
  },
  "Pepper": {
    name: "Pepper",
    water_need_mm: 550,
    drought_sensitivity: 4,
    season: "Spring-summer (Apr-Aug)",
    peak_water_demand: "Flowering to fruit set",
    production_system: "Mostly irrigated",
    profile_note: "Sensitive to heat and water stress around flowering; grown in the Central and Coastal governorates.",
  },
  "Potato": {
    name: "Potato",
    water_need_mm: 500,
    drought_sensitivity: 4,
    season: "Winter-spring (Oct-Apr)",
    peak_water_demand: "Tuber initiation to bulking",
    production_system: "Irrigated",
    profile_note: "Short cycle with a narrow optimal water window; stress during tuber initiation reduces marketable yield.",
  },
  "Onion": {
    name: "Onion",
    water_need_mm: 450,
    drought_sensitivity: 3,
    season: "Winter-spring (Oct-Apr)",
    peak_water_demand: "Bulbing",
    production_system: "Irrigated",
    profile_note: "Moderate water demand with a critical bulbing stage; sensitive to salinity combined with water deficit.",
  },
};

export function getCropList(): string[] {
  return Object.keys(CROP_PROFILES);
}

export interface CropExposureResult {
  cropName: string;
  exposureLevel: "Low" | "Moderate" | "High" | "Critical";
  exposureScore: number;
  sensitivityScore: number;
  waterDeficitMm: number;
  summary: string;
}

export function calculateCropExposure(
  cropName: string,
  precipMm: number,
  soilMoisture: number,
  damFillPct: number
): CropExposureResult | null {
  const crop = CROP_PROFILES[cropName];
  if (!crop) return null;

  const waterDeficitMm = Math.max(0, crop.water_need_mm - precipMm);
  const sensitivity = crop.drought_sensitivity; // 1-5

  // Calculate composite exposure score (0 - 100)
  let score = (sensitivity * 12) + (1.0 - Math.min(soilMoisture / 0.35, 1.0)) * 25 + (1.0 - Math.min(damFillPct / 80.0, 1.0)) * 25;
  if (waterDeficitMm > 200) score += 10;
  score = Math.min(99, Math.max(10, Math.round(score)));

  let exposureLevel: "Low" | "Moderate" | "High" | "Critical" = "Low";
  if (score >= 75) exposureLevel = "Critical";
  else if (score >= 55) exposureLevel = "High";
  else if (score >= 38) exposureLevel = "Moderate";

  const summary = `${cropName} has an annual water requirement of ${crop.water_need_mm} mm (current regional rainfall: ${precipMm} mm). Peak vulnerability occurs during ${crop.peak_water_demand.toLowerCase()} (${crop.production_system.toLowerCase()}).`;

  return {
    cropName,
    exposureLevel,
    exposureScore: score,
    sensitivityScore: sensitivity,
    waterDeficitMm: Math.round(waterDeficitMm),
    summary,
  };
}
