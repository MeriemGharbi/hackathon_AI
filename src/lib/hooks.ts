/**
 * Shared hooks for loading AgriRisk API data.
 *
 * Every page reads from the API rather than from hardcoded fixtures, and every
 * hook exposes its own loading/error state so the UI can be honest about what
 * it does not have.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  type Assessment,
  type ClimateRow,
  type CropExposurePayload,
  type CropProfile,
  type DamRow,
  type HealthPayload,
  type NationalPayload,
  type ReferencePayload,
  type ReportEntry,
  type ScenarioPayload,
  type WaterHistoryPoint,
} from "./api";

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Fetch-on-mount with manual invalidation and in-flight cancellation. */
export function useApiResource<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  enabled = true,
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [nonce, setNonce] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (cancelled || id !== requestId.current) return;
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled || id !== requestId.current) return;
        setData(null);
        setError(cause instanceof ApiError ? cause.message : String(cause));
      })
      .finally(() => {
        if (cancelled || id !== requestId.current) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { data, error, loading, reload };
}

// --- Convenience hooks -----------------------------------------------------
export function useHealth() {
  return useApiResource<HealthPayload>(() => api.health(), []);
}

export function useReference() {
  return useApiResource<ReferencePayload>(() => api.reference(), []);
}

export function useNational(period = "current") {
  return useApiResource<NationalPayload>(() => api.national(period), [period]);
}

export function useClimate(period = "current") {
  return useApiResource<{
    period: string;
    rows: ClimateRow[];
    failures: { governorate: string; error: string }[];
    source: string;
  }>(() => api.climate(period), [period]);
}

export function useWaterSummary() {
  return useApiResource<{ date: string; count: number; rows: DamRow[]; source: string }>(
    () => api.waterSummary(),
    [],
  );
}

export function useWaterHistory(limit = 24) {
  return useApiResource<{ series: WaterHistoryPoint[]; source: string }>(
    () => api.waterHistory(limit),
    [limit],
  );
}

/** Measured history for a single dam; disabled until a dam is selected. */
export function useDamHistory(dam: string | null, limit = 12) {
  return useApiResource<{
    dam: string;
    governorate: string;
    series: { date: string; fill_pct: number | null; stock_mm3: number | null }[];
  }>(() => api.damHistory(dam as string, limit), [dam, limit], Boolean(dam));
}

export function useAssessment(governorate: string, crop: string | null, period = "current") {
  return useApiResource<Assessment>(() => api.assessment(governorate, crop, period), [
    governorate,
    crop,
    period,
  ]);
}

export function useCropExposure(governorate: string, period = "current") {
  return useApiResource<CropExposurePayload>(() => api.cropExposure(governorate, period), [
    governorate,
    period,
  ]);
}

export function useCropProfiles() {
  return useApiResource<{ crops: CropProfile[] }>(() => api.crops(), []);
}

export function useReports(governorate: string, crop: string | null) {
  return useApiResource<{ reports: ReportEntry[]; period_label: string }>(
    () => api.reports(governorate, crop),
    [governorate, crop],
  );
}

export function useScenario(governorate: string, crop: string | null, changePct: number | null) {
  const [data, setData] = useState<ScenarioPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (changePct === null) {
      setData(null);
      setError(null);
      return;
    }
    const id = ++requestId.current;
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .scenario({ governorate, rainfall_change_pct: changePct, crop })
      .then((result) => {
        if (cancelled || id !== requestId.current) return;
        setData(result);
      })
      .catch((cause: unknown) => {
        if (cancelled || id !== requestId.current) return;
        setData(null);
        setError(cause instanceof ApiError ? cause.message : String(cause));
      })
      .finally(() => {
        if (cancelled || id !== requestId.current) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [governorate, crop, changePct]);

  return { data, error, loading };
}

// --- Small shared helpers --------------------------------------------------
export function describeError(error: string | null): string {
  if (!error) return "";
  return error;
}

/** Debounce a rapidly changing value (scenario sliders). */
export function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}