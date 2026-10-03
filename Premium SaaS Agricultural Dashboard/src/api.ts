export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH" | string;

export type MapPoint = {
  name: string;
  latitude: number;
  longitude: number;
  risk_level?: RiskLevel | null;
  risk_label?: string | null;
  rainfall_anomaly_pct?: number | null;
  data_through?: string | null;
};

export type ReferenceData = {
  governorates: string[];
  crops: string[];
  periods: Record<string, string>;
};

export type Assessment = {
  governorate: string;
  period_label?: string;
  data_through?: string;
  risk?: {
    level_code?: RiskLevel;
    level_label?: string;
    drivers?: Array<{ indicator: string; value: string; signal?: string }>;
  };
  rainfall?: {
    precipitation_mm?: number;
    rainfall_anomaly_pct?: number | null;
    mean_soil_moisture_0_7cm?: number | null;
    et0_total_mm?: number | null;
  };
  water?: {
    worst_dam_name?: string;
    dam_fill_rate_pct?: number;
    seasonal_inflow_change_pct?: number;
    national_stock_mm3?: number;
    stock_vs_last_year_pct?: number;
  } | null;
  crop_exposure?: {
    exposure_level?: string;
    exposure_score?: number;
  } | null;
};

export type ScenarioResult = {
  risk_before?: { level_code?: RiskLevel; level_label?: string };
  risk_after?: { level_code?: RiskLevel; level_label?: string };
  changed?: boolean;
  scenario?: { rainfall_change_pct?: number };
  note?: string;
};

export type WaterRow = {
  dam: string;
  governorate: string;
  region: string;
  capacity_mm3: number | null;
  stock_mm3: number | null;
  fill_pct: number | null;
  inflow_change_pct: number | null;
};

export type Report = { id: string; title: string; coverage: string; date?: string; risk?: string };

export type ChatResponse = {
  reply: string;
  tools_used: string[];
  context: Record<string, unknown>;
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `AgriRisk API request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  reference: () => request<ReferenceData>("/reference"),
  assessment: (governorate: string, crop = "Tomato", period = "current") =>
    request<Assessment>(`/assessment?governorate=${encodeURIComponent(governorate)}&crop=${encodeURIComponent(crop)}&period=${period}`),
  map: (period = "current") => request<{ points: MapPoint[]; failures: unknown[] }>(`/map?period=${period}`),
  waterSummary: () => request<{ date: string; rows: WaterRow[] }>("/water/summary"),
  reports: (governorate: string, crop: string, period: string) => request<{ reports: Report[] }>(`/reports?governorate=${encodeURIComponent(governorate)}&crop=${encodeURIComponent(crop)}&period=${period}`),
  scenario: (payload: { governorate: string; crop: string; period: string; rainfall_change_pct: number }) =>
    request<ScenarioResult>("/scenario", { method: "POST", body: JSON.stringify(payload) }),
  chat: (payload: { message: string; history: Array<{ role: string; content: string }>; governorate: string; crop: string; period: string }) =>
    request<ChatResponse>("/chat", { method: "POST", body: JSON.stringify(payload) }),
};

export function downloadText(filename: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
