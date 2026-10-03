/**
 * Choropleth governorate map of Tunisia.
 *
 * Geometry is real ADM1 data (GADM 4.1, projected to Web Mercator in
 * `src/data/tunisiaGeo.ts`) rather than a hand-drawn outline, so borders and
 * relative positions are geographically correct. Risk shading comes from the
 * live `/api/national` payload.
 */

import { TUNISIA_GOV_SHAPES, TUNISIA_VIEWBOX } from "../data/tunisiaGeo";
import type { MapPoint, RiskLevel } from "../lib/api";

export type RiskTone = "low" | "moderate" | "high" | "veryHigh" | "unknown";

export const RISK_TONE: Record<string, RiskTone> = {
  LOW: "low",
  MODERATE: "moderate",
  HIGH: "high",
  VERY_HIGH: "veryHigh",
};

export function toneForLevel(level: RiskLevel | null | undefined): RiskTone {
  return (level && RISK_TONE[level]) || "unknown";
}

export const RISK_TONE_LABEL: Record<RiskTone, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  veryHigh: "Very high",
  unknown: "No data",
};

export const RISK_TONE_ORDER: RiskTone[] = ["low", "moderate", "high", "veryHigh"];

interface TunisiaMapProps {
  points: MapPoint[];
  selected: string;
  onSelect: (governorate: string) => void;
  loading?: boolean;
  height?: number;
}

export default function TunisiaMap({
  points,
  selected,
  onSelect,
  loading = false,
  height = 440,
}: TunisiaMapProps) {
  const byName = new Map(points.map((point) => [point.name, point]));

  return (
    <div className="map-stage" style={{ height }}>
      <svg
        className={`tunisia${loading ? " is-loading" : ""}`}
        viewBox={TUNISIA_VIEWBOX}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Governorate drought risk map of Tunisia"
      >
        <g className="governorates">
          {TUNISIA_GOV_SHAPES.map((shape) => {
            const point = byName.get(shape.name);
            const tone = toneForLevel(point?.risk_level);
            const isSelected = shape.name === selected;
            const hasData = Boolean(point?.risk_level);

            return (
              <path
                key={shape.name}
                className={`gov-shape tone-${tone}${isSelected ? " is-selected" : ""}${
                  hasData ? "" : " is-nodata"
                }`}
                d={shape.path}
                tabIndex={hasData ? 0 : -1}
                role={hasData ? "button" : undefined}
                aria-label={`${shape.name}: ${point?.risk_label ?? "no climate data"}`}
                onClick={() => hasData && onSelect(shape.name)}
                onKeyDown={(event) => {
                  if (hasData && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onSelect(shape.name);
                  }
                }}
              >
                <title>
                  {shape.name}
                  {point?.risk_label ? ` — ${point.risk_label} risk` : " — no climate data"}
                  {point?.precipitation_mm != null ? ` · ${point.precipitation_mm} mm rain` : ""}
                </title>
              </path>
            );
          })}
        </g>
      </svg>

      {/* Labels sit outside the SVG so they keep a constant type size and are
          anchored by name, instead of being pinned with hand-tuned offsets. */}
      <div className="map-labels" aria-hidden="true">
        {TUNISIA_GOV_SHAPES.filter((shape) => LABELED.has(shape.name)).map((shape) => {
          const point = byName.get(shape.name);
          return (
            <span
              key={shape.name}
              className={`map-label tone-${toneForLevel(point?.risk_level)}${
                shape.name === selected ? " is-selected" : ""
              }`}
              style={{ left: `${(shape.centroid[0] / 1000) * 100}%`, top: `${(shape.centroid[1] / 1400) * 100}%` }}
            >
              {shape.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Governorates large enough on screen for a permanent label. */
const LABELED = new Set([
  "Bizerte",
  "Tunis",
  "Ariana",
  "Ben Arous",
  "Manouba",
  "Nabeul",
  "Béja",
  "Jendouba",
  "Zaghouan",
  "Le Kef",
  "Siliana",
  "Kairouan",
  "Sousse",
  "Monastir",
  "Mahdia",
  "Kasserine",
  "Sidi Bouzid",
  "Sfax",
  "Gafsa",
  "Tozeur",
  "Gabès",
  "Kébili",
  "Médenine",
  "Tataouine",
]);