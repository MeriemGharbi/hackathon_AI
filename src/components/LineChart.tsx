/**
 * Dependency-free SVG time-series chart.
 *
 * Fed by real measured series (national dam stock vs three-year average,
 * monthly precipitation) rather than hardcoded path strings: axis bounds, tick
 * positions and the comparison line are all derived from the data passed in.
 * Styling reuses the dashboard design system classes (.line-chart, .gridlines,
 * .benchmark, .primary-line, .axis, .chart-legend).
 */

import type { ReactNode } from "react";
import { formatMonth } from "../lib/format";

export interface Series {
  key: string;
  label: string;
  values: (number | null)[];
  color?: string;
  /** Dashed, unlabelled comparison line (e.g. three-year average). */
  dashed?: boolean;
}

interface LineChartProps {
  series: Series[];
  /** ISO dates; formatted for the x axis. */
  dates: string[];
  height?: number;
  /** Start the y axis at zero (correct for volumes). */
  zeroBased?: boolean;
  /** Palette variant: olive for water, navy for rain. */
  variant?: "water" | "rain";
  unit?: string;
  valueSuffix?: string;
}

const WIDTH = 760;
const PAD = { top: 12, right: 8, bottom: 6, left: 46 };

export default function LineChart({
  series,
  dates,
  height = 185,
  zeroBased = true,
  variant = "water",
  unit,
  valueSuffix = "",
}: LineChartProps) {
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const usable = series.flatMap((item) => item.values.filter((v): v is number => typeof v === "number"));
  if (!dates.length || !usable.length) {
    return <div className="chart-empty">No measured series for this selection.</div>;
  }

  let min = Math.min(...usable);
  let max = Math.max(...usable);
  if (zeroBased) min = Math.min(0, min);
  if (max === min) {
    max += 1;
    min -= 1;
  }
  const pad = (max - min) * 0.14;
  max += pad;
  if (!zeroBased) min -= pad;

  const count = Math.max(dates.length, ...series.map((item) => item.values.length));
  const x = (index: number) => PAD.left + (count <= 1 ? innerW / 2 : (index / (count - 1)) * innerW);
  const y = (value: number) => PAD.top + innerH - ((value - min) / (max - min)) * innerH;

  const ticks = 3;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => {
    const value = min + ((max - min) * i) / ticks;
    return { value, yPos: PAD.top + innerH - ((value - min) / (max - min)) * innerH };
  });

  const stride = Math.max(1, Math.ceil(count / 6));
  const axisDates = dates.filter((_, index) => index % stride === 0 || index === count - 1);

  return (
    <div className="chart-wrap">
      <svg
        className={`line-chart${variant === "rain" ? " rain" : ""}`}
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Measured series: ${series.map((item) => item.label).join(", ")}`}
      >
        {unit ? (
          <text className="chart-y" x={0} y={8} textAnchor="start">
            {unit}
          </text>
        ) : null}

        {yTicks.map((tick) => (
          <g key={tick.value}>
            <line className="gridlines" x1={PAD.left} x2={WIDTH - PAD.right} y1={tick.yPos} y2={tick.yPos} />
            <text className="chart-y" x={PAD.left - 7} y={tick.yPos + 3} textAnchor="end">
              {formatTick(tick.value)}
            </text>
          </g>
        ))}

        {series.map((item) => {
          const points = item.values
            .map((value, index) => (typeof value === "number" ? `${x(index)},${y(value)}` : null))
            .filter((point): point is string => point !== null);
          if (!points.length) return null;

          return (
            <g key={item.key}>
              <polyline
                className={item.dashed ? "benchmark" : "primary-line"}
                points={points.join(" ")}
                fill="none"
                // Inline style, not a presentation attribute: the design-system
                // rules target .primary-line/.benchmark and would otherwise win.
                style={item.color ? { stroke: item.color } : undefined}
                strokeDasharray={item.dashed ? "5 4" : undefined}
              />
              {!item.dashed
                ? item.values.map((value, index) =>
                    typeof value === "number" && index % stride === 0 ? (
                      <circle
                        key={index}
                        cx={x(index)}
                        cy={y(value)}
                        r="2.4"
                        style={item.color ? { fill: item.color } : undefined}
                      >
                        <title>{`${dates[index] ?? ""}: ${formatTick(value)}${valueSuffix}`}</title>
                      </circle>
                    ) : null,
                  )
                : null}
            </g>
          );
        })}
      </svg>

      <div className="axis">
        {axisDates.map((date, index) => (
          <span key={`${date}-${index}`}>{formatMonth(date)}</span>
        ))}
      </div>

      {series.length > 1 ? (
        <div className="chart-legend">
          {series.map((item) => (
            <span key={item.key}>
              <i style={item.color ? { borderColor: item.color } : undefined} />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatTick(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `${(value / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  if (abs >= 10) return value.toFixed(0);
  if (abs >= 1) return value.toFixed(1);
  return value.toFixed(2);
}

/** Inline trend line for table rows (measured values only). */
export function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  const usable = values.filter((value): value is number => typeof value === "number");
  if (usable.length < 2) return <span className="muted">—</span>;

  const min = Math.min(...usable);
  const max = Math.max(...usable);
  const span = max - min || 1;
  const width = Math.max(usable.length - 1, 1);
  const rising = usable[usable.length - 1] >= usable[0];

  const points = values
    .map((value, index) =>
      typeof value === "number" ? `${(index / width) * 100},${26 - ((value - min) / span) * 22 - 2}` : null,
    )
    .filter((point): point is string => point !== null)
    .join(" ");

  return (
    <svg
      className="mini-trend"
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <polyline
        points={points}
        fill="none"
        stroke={rising ? "var(--olive)" : "var(--danger)"}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Horizontal proportion bar used for exposure factors and comparisons. */
export function Bar({ value, max = 100, tone }: { value: number; max?: number; tone?: string }) {
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="bar">
      <i
        style={{
          width: `${width}%`,
          background: tone === "danger" ? "var(--danger)" : tone === "sage" ? "var(--sage)" : "var(--olive)",
        }}
      />
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="comparison-row">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}
