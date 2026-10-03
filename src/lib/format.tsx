/** Presentation helpers: number/date formatting and risk labelling. */

import type { ExposureLevel, RiskLevel } from "./api";
import type { RiskTone } from "../components/TunisiaMap";

export const RISK_TONE_BY_LEVEL: Record<string, RiskTone> = {
  LOW: "low",
  MODERATE: "moderate",
  HIGH: "high",
  VERY_HIGH: "veryHigh",
};

export const TONE_DISPLAY: Record<RiskTone, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  veryHigh: "Very high",
  unknown: "No data",
};

export function riskTone(level: RiskLevel | null | undefined): RiskTone {
  return (level && RISK_TONE_BY_LEVEL[level]) || "unknown";
}

export function exposureTone(level: ExposureLevel | null | undefined): RiskTone {
  if (level === "HIGH") return "high";
  if (level === "MODERATE") return "moderate";
  if (level === "LOW") return "low";
  return "unknown";
}

// --- Numbers ---------------------------------------------------------------
// Pinned to en-US so figures read identically for every visitor (a French
// locale would otherwise render "750,7" and "-0,7%" in an English report).
const LOCALE = "en-US";

export function num(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function int(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Math.round(value).toLocaleString(LOCALE);
}

export function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${num(value, digits)}%`;
}

export function signedPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value > 0 ? "+" : ""}${num(value, digits)}%`;
}

export function signed(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value > 0 ? "+" : ""}${num(value, digits)}`;
}

export function mean(values: (number | null | undefined)[]): number | null {
  const usable = values.filter((value): value is number => typeof value === "number" && !Number.isNaN(value));
  if (!usable.length) return null;
  return usable.reduce((total, value) => total + value, 0) / usable.length;
}

// --- Dates -----------------------------------------------------------------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const iso = value.slice(0, 10);
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return value;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatMonth(value: string | null | undefined): string {
  if (!value) return "";
  const [year, month] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month) return value;
  return `${MONTHS[month - 1]} ${String(year).slice(2)}`;
}

export function quarterOf(value: string | null | undefined): string {
  if (!value) return "—";
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  if (!year || !month) return "—";
  return `Q${Math.ceil(month / 3)} ${year}`;
}

// --- Export helpers --------------------------------------------------------
export function downloadText(filename: string, contents: string, type = "text/plain"): void {
  const blob = new Blob([contents], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (cell: string | number | null | undefined) => {
    const text = cell === null || cell === undefined ? "" : String(cell);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join("\n");
}

/** Minimal inline markdown -> React nodes: **bold**, *italic*, `code`. */
export function renderInlineMarkdown(text: string): React.ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    lastIndex = start + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}