/**
 * Typed client for the AgriRisk API.
 *
 * The API is served from the same origin as the dashboard (see `api/index.py`),
 * so no key and no second deployment are involved. Set `VITE_API_BASE_URL` only
 * when the API lives on a different host during local development.
 *
 * `GROQ_API_KEY` stays server-side: the browser only ever talks to /api/chat.
 */

const RAW_BASE = (import.meta.env?.VITE_API_BASE_URL ?? "").trim();
export const API_BASE = RAW_BASE.replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 120_000;

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

// --- Shared shapes ---------------------------------------------------------
export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
export type ExposureLevel = "LOW" | "MODERATE" | "HIGH";

export interface RiskClassification {
  level_code: RiskLevel | null;
  level_label: string | null;
  category: string | null;
  label_en: string | null;
  risk_level: string;
  recommended_action: string;
  drivers: { indicator: string; value: string; signal: string }[];
  source: string;
}

export interface ClimateIndicators {
  source: string;
  region: string;
  period: string;
  period_label: string;
  period_start: string;
  period_end: string;
  previous_window: string;
  data_through: string | null;
  precipitation_mm: number | null;
  precipitation_previous_mm: number | null;
  rainfall_anomaly_pct: number | null;
  mean_soil_moisture_0_7cm: number | null;
  soil_moisture_previous: number | null;
  et0_total_mm: number | null;
  et0_previous_mm: number | null;
  coverage_days: number;
}

export interface WaterIndicators {
  source: string;
  governorate: string;
  date: string;
  region: string | null;
  worst_dam_name: string;
  dam_fill_rate_pct: number;
  fill_status: "critical" | "low" | "moderate" | "healthy" | "unknown";
  region_total_stock_mm3: number | null;
  national_stock_mm3: number;
  stock_vs_3yr_avg_pct: number | null;
  stock_vs_last_year_pct: number | null;
  seasonal_inflow_change_pct: number | null;
  selection_note: string;
}

export interface CropExposure {
  region: string;
  crop: string;
  exposure_score: number;
  exposure_level: ExposureLevel;
  factors: { factor: string; value: string; stress_score: number; weight: number }[];
  unavailable_factors: string[];
  profile: {
    water_need_mm: number;
    drought_sensitivity: number;
    season: string;
    peak_water_demand: string;
    profile_note: string;
  };
  method: string;
  period: string;
  source: string;
  note: string;
}

export interface Assessment {
  governorate: string;
  period: string;
  period_label: string;
  data_through: string | null;
  risk: RiskClassification;
  rainfall: ClimateIndicators;
  water: WaterIndicators | null;
  water_note: string | null;
  crop_exposure: CropExposure | null;
  sources: string[];
  note: string;
}

export interface MapPoint {
  name: string;
  latitude: number;
  longitude: number;
  risk_level: RiskLevel | null;
  risk_label: string | null;
  risk_category: string | null;
  precipitation_mm: number | null;
  rainfall_anomaly_pct: number | null;
  mean_soil_moisture_0_7cm: number | null;
  et0_total_mm: number | null;
  dam_fill_rate_pct: number | null;
  fill_status: string | null;
  worst_dam_name: string | null;
  region: string | null;
  data_through: string | null;
}

export interface NationalSummary {
  risk_counts: Record<string, number>;
  mean_dam_fill_pct: number | null;
  mean_rainfall_anomaly_pct: number | null;
  mean_precipitation_mm: number | null;
  mean_soil_moisture_0_7cm: number | null;
  highest_risk: { governorate: string; risk_level: string; risk_label: string | null } | null;
}

export interface NationalPayload {
  period: string;
  periods: Record<string, string>;
  points: MapPoint[];
  failures: { governorate: string; error: string }[];
  coverage: {
    assessed: number;
    requested: number;
    with_climate_data: number;
    with_dam_data: number;
  };
  summary: NationalSummary;
}

export interface ClimateRow {
  governorate: string;
  latitude: number;
  longitude: number;
  precipitation_mm: number | null;
  precipitation_previous_mm: number | null;
  rainfall_anomaly_pct: number | null;
  mean_soil_moisture_0_7cm: number | null;
  et0_total_mm: number | null;
  period_label: string;
  data_through: string | null;
  risk_level: RiskLevel | null;
  risk_label: string | null;
}

export interface DamRow {
  dam: string;
  governorate: string;
  region: string;
  capacity_mm3: number | null;
  stock_mm3: number | null;
  fill_pct: number | null;
  current_season_inflow_mm3: number | null;
  previous_season_inflow_mm3: number | null;
  inflow_change_pct: number | null;
}

export interface WaterSummary {
  date: string;
  count: number;
  rows: DamRow[];
  source: string;
}

export interface WaterHistoryPoint {
  date: string;
  national_stock_mm3: number | null;
  three_year_average_mm3: number | null;
  last_year_stock_mm3: number | null;
  north_mm3: number | null;
  centre_mm3: number | null;
  cap_bon_mm3: number | null;
  current_season_inflow_mm3: number | null;
  previous_season_inflow_mm3: number | null;
}

export interface CropProfile {
  crop: string;
  water_need_mm: number;
  drought_sensitivity: number;
  season: string;
  peak_water_demand: string;
  production_system: string;
  profile_note: string;
  source: string;
  note: string;
}

export interface CropExposureRow {
  crop: string;
  exposure_level: ExposureLevel;
  exposure_score: number;
  water_need_mm: number | null;
  drought_sensitivity: number | null;
  season: string | null;
  peak_water_demand: string | null;
  production_system: string | null;
  profile_note: string | null;
}

export interface CropExposurePayload {
  governorate: string;
  period_label: string;
  climate: {
    precipitation_mm: number | null;
    rainfall_anomaly_pct: number | null;
    mean_soil_moisture_0_7cm: number | null;
    dam_fill_rate_pct: number | null;
  };
  rows: CropExposureRow[];
  source: string;
  note: string;
}

export interface ScenarioPayload {
  governorate: string;
  period_label: string;
  scenario: {
    rainfall_change_pct: number;
    precipitation_mm_before: number;
    precipitation_mm_after: number;
    soil_moisture_before: number;
    soil_moisture_after: number;
    rainfall_anomaly_pct_after: number | null;
  };
  risk_before: { level_code: RiskLevel | null; level_label: string | null; risk_level: string };
  risk_after: { level_code: RiskLevel | null; level_label: string | null; risk_level: string };
  changed: boolean;
  drivers_after: { indicator: string; value: string; signal: string }[];
  crop_exposure_before: { level: ExposureLevel | null; score: number | null } | null;
  crop_exposure_after: { level: ExposureLevel | null; score: number | null } | null;
  note: string;
  source: string;
}

export interface ReportEntry {
  id: string;
  title: string;
  kind: "assessment" | "water" | "crop";
  coverage: string;
  date: string | null;
  risk_level: string | null;
  risk_label: string | null;
  summary: string;
}

export interface HealthPayload {
  status: string;
  service: string;
  version: string;
  llm_configured: boolean;
  climate_source: string;
  dam_source: string;
  dam_coverage: { first_date: string; last_date: string; governorates: string[] };
  governorates: number;
  crops: number;
}

export interface ReferencePayload {
  governorates: string[];
  crops: string[];
  periods: Record<string, string>;
  risk_levels: string[];
  exposure_levels: string[];
}

export interface ChatReply {
  reply: string;
  tools_used: string[];
  model: string;
  context: Record<string, unknown>;
}

// --- Transport -------------------------------------------------------------
function unwrapError(status: number, payload: unknown): ApiError {
  const detail = (payload as { detail?: unknown })?.detail ?? payload;
  let message = `AgriRisk API request failed (HTTP ${status}).`;
  if (typeof detail === "string") {
    message = detail;
  } else if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    const text = record.error ?? record.message ?? record.detail;
    if (typeof text === "string") message = text;
  }
  return new ApiError(message, status, detail);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    const reason =
      (error as Error)?.name === "AbortError"
        ? `AgriRisk API timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`
        : "Could not reach the AgriRisk API. Check that the API server is running.";
    throw new ApiError(reason, 0, error);
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) throw unwrapError(response.status, payload);
  return payload as T;
}

function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

// --- Endpoints -------------------------------------------------------------
export const api = {
  health: () => request<HealthPayload>("/health"),
  reference: () => request<ReferencePayload>("/reference"),

  assessment: (governorate: string, crop?: string | null, period = "current") =>
    request<Assessment>(`/assessment${query({ governorate, crop, period })}`),

  national: (period = "current") => request<NationalPayload>(`/national${query({ period })}`),
  map: (period = "current") => request<NationalPayload>(`/map${query({ period })}`),

  climate: (period = "current") =>
    request<{ period: string; rows: ClimateRow[]; failures: { governorate: string; error: string }[]; source: string }>(
      `/climate${query({ period })}`,
    ),

  water: (governorate: string) => request<WaterIndicators>(`/water${query({ governorate })}`),
  waterSummary: () => request<WaterSummary>("/water/summary"),
  waterHistory: (limit = 24) =>
    request<{ count: number; series: WaterHistoryPoint[]; source: string }>(`/water/history${query({ limit })}`),
  damHistory: (dam: string, limit = 12) =>
    request<{ dam: string; governorate: string; series: { date: string; fill_pct: number | null; stock_mm3: number | null }[] }>(
      `/water/dams/${encodeURIComponent(dam)}/history${query({ limit })}`,
    ),

  crops: () => request<{ crops: CropProfile[]; source: string }>("/crops"),
  cropExposure: (governorate: string, period = "current") =>
    request<CropExposurePayload>(`/crops/exposure${query({ governorate, period })}`),

  scenario: (payload: { governorate: string; rainfall_change_pct: number; crop?: string | null; period?: string }) =>
    request<ScenarioPayload>("/scenario", { method: "POST", body: JSON.stringify(payload) }),

  reports: (governorate: string, crop?: string | null, period = "current") =>
    request<{ governorate: string; period_label: string; reports: ReportEntry[] }>(
      `/reports${query({ governorate, crop, period })}`,
    ),

  chat: (payload: { message: string; history: { role: string; content: string }[]; governorate: string; crop?: string | null; period?: string }) =>
    request<ChatReply>("/chat", { method: "POST", body: JSON.stringify(payload) }),
};