import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TunisiaMap, { RISK_TONE_LABEL, RISK_TONE_ORDER, toneForLevel, type RiskTone } from "./components/TunisiaMap";
import LineChart, { Bar } from "./components/LineChart";
import { Button, DataState, Panel, RiskPill, Segmented, Select, SourceNote, Spinner, Stat } from "./components/ui";
import { api, type Assessment, type RiskLevel } from "./lib/api";
import {
  useAssessment,
  useClimate,
  useCropExposure,
  useCropProfiles,
  useDamHistory,
  useDebounced,
  useHealth,
  useNational,
  useReference,
  useReports,
  useScenario,
  useWaterHistory,
  useWaterSummary,
} from "./lib/hooks";
import {
  downloadText,
  exposureTone,
  formatDate,
  formatMonth,
  int,
  mean,
  num,
  pct,
  quarterOf,
  renderInlineMarkdown,
  riskTone,
  signed,
  signedPct,
  toCsv,
} from "./lib/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type UserRole = "Insurer / Analyst" | "Farmer / Specialist";

type PageKey =
  | "Overview"
  | "Assistant"
  | "Crops"
  | "Regions"
  | "Water"
  | "Climate"
  | "Scenarios"
  | "Reports";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
}

const NAV: { key: PageKey; icon: IconName }[] = [
  { key: "Overview", icon: "overview" },
  { key: "Assistant", icon: "sparkles" },
  { key: "Crops", icon: "sprout" },
  { key: "Regions", icon: "regions" },
  { key: "Water", icon: "water" },
  { key: "Climate", icon: "climate" },
  { key: "Scenarios", icon: "scenarios" },
  { key: "Reports", icon: "reports" },
];

const LEVEL_RANK: Record<string, number> = { VERY_HIGH: 0, HIGH: 1, MODERATE: 2, LOW: 3 };

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
type IconName =
  | "overview" | "regions" | "water" | "climate" | "scenarios" | "reports"
  | "search" | "sun" | "moon" | "download" | "sparkles" | "x"
  | "arrow" | "send" | "sprout" | "refresh" | "alert" | "chevron";

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  regions: <><path d="M4 20h16M6 20V8h4v12M14 20V4h4v16" /><path d="M7.5 11h1M15.5 7h1M15.5 11h1M15.5 15h1" /></>,
  water: <path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z" />,
  climate: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  scenarios: <><path d="M4 6h7M15 6h5M4 12h3M11 12h9M4 18h9M17 18h3" /><circle cx="13" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="15" cy="18" r="2" /></>,
  reports: <><path d="M6 2h9l4 4v16H6V2Z" /><path d="M14 2v5h5M9 12h6M9 16h6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M19.1 19.1l-1.4-1.4M4.9 19.1l1.4-1.4M19.1 4.9l-1.4 1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />,
  download: <><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></>,
  sparkles: <path d="m12 3 1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3Z" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  send: <path d="m22 2-7 20-4-9-9-4Zm0 0L11 13" />,
  sprout: <path d="M7 20h10M12 20v-8M12 12A6 6 0 0 1 6 6c0 4 3 6 6 6Zm0 0a6 6 0 0 0 6-6c0 4-3 6-6 6Z" />,
  refresh: <><path d="M3 12a9 9 0 0 1 15.5-6.2M21 12a9 9 0 0 1-15.5 6.2" /><path d="M18 3v4h-4M6 21v-4h4" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
};

function Icon({ name, size = 15 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Shared page furniture
// ---------------------------------------------------------------------------
function PageIntro({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-intro">
      <div>
        <p className="section-label">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="panel-actions">{actions}</div> : null}
    </div>
  );
}

function GovernorateField({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return <Select label="Governorate" id="gov" value={value} options={options} onChange={onChange} />;
}

function Markdown({ text }: { text: string }) {
  return (
    <>
      {text.split("\n\n").map((block, index) => (
        <p key={index} className="md-block">
          {renderInlineMarkdown(block)}
        </p>
      ))}
    </>
  );
}

const RISK_COUNT_KEY: Record<string, string> = {
  low: "LOW",
  moderate: "MODERATE",
  high: "HIGH",
  veryHigh: "VERY_HIGH",
};

function Legend({ showCount, counts }: { showCount?: boolean; counts?: Record<string, number> }) {
  return (
    <>
      {RISK_TONE_ORDER.map((tone) => (
        <span key={tone}>
          <i className={`swatch tone-${tone}`} />
          {RISK_TONE_LABEL[tone]}
          {showCount && counts ? <b>{counts[RISK_COUNT_KEY[tone]] ?? 0}</b> : null}
        </span>
      ))}
      <span>
        <i className="swatch tone-unknown" />
        No data
      </span>
    </>
  );
}

function toneFromText(level: string | null | undefined): RiskTone {
  return riskTone(level as RiskLevel);
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
function OverviewPage({
  period,
  periodLabel,
  userRole,
  region,
  setRegion,
  governorates,
  crops,
  setPage,
}: {
  period: string;
  periodLabel: string;
  userRole: UserRole;
  region: string;
  setRegion: (value: string) => void;
  governorates: string[];
  crops: string[];
  setPage: (page: PageKey) => void;
}) {
  const national = useNational(period);
  const history = useWaterHistory(24);
  const points = national.data?.points ?? [];
  const byName = useMemo(() => new Map(points.map((point) => [point.name, point])), [points]);
  const selected = byName.get(region);
  const summary = national.data?.summary;
  const coverage = national.data?.coverage;

  const ranked = useMemo(
    () =>
      [...points]
        .filter((point) => point.risk_level)
        .sort(
          (a, b) =>
            (LEVEL_RANK[a.risk_level ?? "LOW"] ?? 9) - (LEVEL_RANK[b.risk_level ?? "LOW"] ?? 9) ||
            (a.rainfall_anomaly_pct ?? 0) - (b.rainfall_anomaly_pct ?? 0),
        )
        .slice(0, 8),
    [points],
  );

  const series = history.data?.series ?? [];
  const latest = series[series.length - 1] ?? null;
  const stockDelta =
    latest?.national_stock_mm3 != null && latest.three_year_average_mm3
      ? (latest.national_stock_mm3 / latest.three_year_average_mm3 - 1) * 100
      : null;
  const inflowDelta =
    latest?.current_season_inflow_mm3 != null && latest.previous_season_inflow_mm3
      ? (latest.current_season_inflow_mm3 / latest.previous_season_inflow_mm3 - 1) * 100
      : null;

  const dates = series.map((point) => point.date);
  const counts = summary?.risk_counts ?? {};
  const severe = (counts.HIGH ?? 0) + (counts.VERY_HIGH ?? 0);
  const executive = national.data
    ? [
        `${severe} of ${coverage?.assessed ?? 0} governorates are at high or very high drought risk.`,
        summary?.highest_risk?.governorate
          ? `${summary.highest_risk.governorate} carries the highest modelled risk (${summary.highest_risk.risk_label}).`
          : null,
        `National rainfall is ${signedPct(summary?.mean_rainfall_anomaly_pct)} against the previous 12 months, mean dam fill is ${num(summary?.mean_dam_fill_pct, 1)}% and ${coverage?.with_dam_data ?? 0} governorates have reservoir monitoring.`,
      ]
        .filter(Boolean)
        .join(" ")
    : "Assessing all governorates against measured climate and reservoir data…";

  return (
    <>
      <PageIntro
        eyebrow={`National overview · ${periodLabel}`}
        title="Tunisia agricultural risk"
        description="Measured precipitation and soil moisture from Open-Meteo, reservoir levels from the AgriRisk dam dataset, classified by the AgriRisk risk model."
        actions={
          <>
            <Button onClick={national.reload} title="Reload national assessment">
              <Icon name="refresh" size={14} /> Refresh
            </Button>
            <Button
              variant="primary"
              disabled={!points.length}
              onClick={() =>
                downloadText(
                  `AgriRisk_national_${period}.csv`,
                  toCsv(
                    ["governorate", "risk_level", "risk_label", "precipitation_mm", "rainfall_anomaly_pct", "soil_moisture_0_7cm", "et0_total_mm", "dam_fill_pct"],
                    points.map((point) => [
                      point.name,
                      point.risk_level,
                      point.risk_label,
                      point.precipitation_mm,
                      point.rainfall_anomaly_pct,
                      point.mean_soil_moisture_0_7cm,
                      point.et0_total_mm,
                      point.dam_fill_rate_pct,
                    ]),
                  ),
                  "text/csv",
                )
              }
            >
              <Icon name="download" size={14} /> Export national
            </Button>
          </>
        }
      />

      <div className="executive-summary">
        <span>Brief</span>
        <p>{executive}</p>
        <small>
          {coverage ? `${coverage.assessed}/${coverage.requested} governorates assessed` : "loading coverage"}
          {national.data?.failures?.length ? ` · ${national.data.failures.length} failed` : ""}
        </small>
      </div>

      <DataState loading={national.loading} error={national.error}>
        <section className="indicator-strip">
          <Stat
            label="National water stock"
            value={num(latest?.national_stock_mm3, 1)}
            unit="Mm³"
            context={stockDelta == null ? "no comparison window" : `${signedPct(stockDelta)} vs 3-year average`}
          />
          <Stat
            label="Mean dam fill"
            value={num(summary?.mean_dam_fill_pct, 1)}
            unit="%"
            context={`${coverage?.with_dam_data ?? 0} governorates monitored`}
          />
          <Stat
            label="Rainfall anomaly"
            value={num(summary?.mean_rainfall_anomaly_pct, 1)}
            unit="%"
            context={
              (summary?.mean_rainfall_anomaly_pct ?? 0) < -15
                ? "drier than the previous 12 months"
                : "national mean vs previous 12 months"
            }
          />
          <Stat
            label="Seasonal inflow"
            value={num(latest?.current_season_inflow_mm3, 1)}
            unit="Mm³"
            context={inflowDelta == null ? "no prior season" : `${signedPct(inflowDelta)} vs previous`}
          />
          <Stat
            label="Highest risk"
            value={summary?.highest_risk?.governorate ?? "—"}
            context={
              summary?.highest_risk
                ? `${RISK_TONE_LABEL[toneFromText(summary.highest_risk.risk_level)]} risk`
                : "no assessments"
            }
            emphasis
          />
        </section>

        <div className="overview-grid">
          <Panel
            className="map-panel"
            title="Governorate drought risk"
            subtitle={`${coverage?.assessed ?? 0} governorates · GADM ADM1 boundaries · click a region to inspect`}
            legend={<Legend showCount counts={summary?.risk_counts} />}
          >
            <DataState loading={national.loading} error={national.error}>
              <TunisiaMap
                points={points}
                selected={region}
                onSelect={setRegion}
                loading={national.loading}
                height={430}
              />
            </DataState>

            <div className="selected-region">
              <div>
                <span>Governorate</span>
                <strong>{region}</strong>
              </div>
              <div>
                <span>Risk level</span>
                <RiskPill tone={toneForLevel(selected?.risk_level)}>{selected?.risk_label ?? "No data"}</RiskPill>
              </div>
              <div>
                <span>Precipitation (12m)</span>
                <strong>{num(selected?.precipitation_mm, 1)} mm</strong>
              </div>
              <div>
                <span>Anomaly</span>
                <strong>{signedPct(selected?.rainfall_anomaly_pct)}</strong>
              </div>
              <div className="action">
                <Button variant="ghost" onClick={() => setPage("Regions")}>
                  Analyse <Icon name="arrow" size={13} />
                </Button>
              </div>
            </div>

            {selected && selected.dam_fill_rate_pct == null ? (
              <div className="watch-note">
                <span>Coverage note</span>
                <p>
                  No reservoir monitoring for {region}; this region is assessed on climate indicators only.
                </p>
              </div>
            ) : null}
          </Panel>

          <Panel
            className="watchlist"
            title="Priority governorates"
            subtitle="Ranked by AgriRisk model risk, then rainfall anomaly"
            actions={
              <Button variant="ghost" onClick={() => setPage("Regions")}>
                All regions <Icon name="arrow" size={13} />
              </Button>
            }
          >
            <div className="data-row table-head">
              <span>Governorate</span>
              <span>Risk</span>
              <span>Rainfall</span>
              <span>Anomaly</span>
              <span>Dam fill</span>
            </div>
            {ranked.map((point) => (
              <button
                type="button"
                key={point.name}
                className={`data-row row-button${point.name === region ? " is-selected" : ""}`}
                onClick={() => setRegion(point.name)}
              >
                <strong>{point.name}</strong>
                <span>
                  <RiskPill tone={toneForLevel(point.risk_level)}>{point.risk_label}</RiskPill>
                </span>
                <span>{num(point.precipitation_mm, 0)} mm</span>
                <span className="mono">{signedPct(point.rainfall_anomaly_pct)}</span>
                <span>{pct(point.dam_fill_rate_pct)}</span>
              </button>
            ))}
            {!ranked.length && !national.loading ? (
              <div className="data-row is-empty">No governorate assessments were returned.</div>
            ) : null}
          </Panel>
        </div>

        <div className="chart-grid">
          <Panel
            className="chart-panel"
            title="National water stock"
            subtitle="Measured monthly total against the three-year average"
            actions={
              latest ? (
                <div className="chart-stat">
                  <strong>{num(latest.national_stock_mm3, 1)} Mm³</strong>
                  <span>{stockDelta == null ? "" : signedPct(stockDelta)}</span>
                </div>
              ) : null
            }
          >
            <DataState loading={history.loading} error={history.error} empty={!series.length}>
              <LineChart
                dates={dates}
                unit="Mm³"
                valueSuffix=" Mm³"
                series={[
                  { key: "stock", label: "National stock", values: series.map((p) => p.national_stock_mm3) },
                  {
                    key: "avg",
                    label: "Three-year average",
                    values: series.map((p) => p.three_year_average_mm3),
                    dashed: true,
                  },
                ]}
              />
            </DataState>
          </Panel>

          <Panel
            className="chart-panel"
            title="Reservoir stock by zone"
            subtitle="Latest measured stock per hydrological zone"
            actions={
              latest ? (
                <div className="chart-stat">
                  <strong>
                    {num((latest.north_mm3 ?? 0) + (latest.centre_mm3 ?? 0) + (latest.cap_bon_mm3 ?? 0), 0)} Mm³
                  </strong>
                  <span>all zones</span>
                </div>
              ) : null
            }
          >
            <DataState loading={history.loading} error={history.error} empty={!series.length}>
              <LineChart
                dates={dates}
                unit="Mm³"
                valueSuffix=" Mm³"
                series={[
                  { key: "north", label: "North", values: series.map((p) => p.north_mm3), color: "#3f6f52" },
                  { key: "centre", label: "Centre", values: series.map((p) => p.centre_mm3) },
                  { key: "capbon", label: "Cap Bon", values: series.map((p) => p.cap_bon_mm3), color: "#a9762f" },
                ]}
              />
            </DataState>
          </Panel>
        </div>
      </DataState>

      <AssessmentPanel
        region={region}
        crops={crops}
        period={period}
        userRole={userRole}
        governorates={governorates}
        setRegion={setRegion}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Assessment panel (Overview + Regions)
// ---------------------------------------------------------------------------
function AssessmentPanel({
  region,
  crops,
  period,
  userRole,
  governorates,
  setRegion,
}: {
  region: string;
  crops: string[];
  period: string;
  userRole: UserRole;
  governorates: string[];
  setRegion: (value: string) => void;
}) {
  const [crop, setCrop] = useState("");
  const { data, error, loading, reload } = useAssessment(region, crop || null, period);
  const [audit, setAudit] = useState(false);

  return (
    <Panel
      className="chart-panel"
      title={`Risk assessment — ${region}`}
      subtitle={
        <>
          Profile <strong>{userRole}</strong>
          {crop ? (
            <>
              {" · "}crop <strong>{crop}</strong>
            </>
          ) : null}
          {" · "}
          {data ? `${data.risk.level_label} (${data.risk.category})` : "awaiting run"}
        </>
      }
      actions={
        <>
          <GovernorateField value={region} options={governorates} onChange={setRegion} />
          <Select label="Crop" id="crop" value={crop} options={["", ...crops]} onChange={setCrop} />
          <Button variant="primary" onClick={reload} disabled={loading}>
            {loading ? <span className="spinner" /> : <Icon name="sparkles" size={14} />}
            {loading ? "Assessing…" : "Run assessment"}
          </Button>
        </>
      }
    >
      <DataState loading={loading && !data} error={error} idle={!data && !loading && !error}>
        {data ? (
          <>
            <div className="assessment-head">
              <RiskPill tone={riskTone(data.risk.level_code)}>{data.risk.level_label}</RiskPill>
              <p>{data.risk.recommended_action}</p>
            </div>

            <div className="analysis-sections">
              <div className="analysis-block">
                <h3 className="block-title">Model drivers</h3>
                {data.risk.drivers.map((driver) => (
                  <div className="comparison-row" key={driver.indicator}>
                    <span>{driver.indicator}</span>
                    <strong>{driver.value}</strong>
                    <small>{driver.signal}</small>
                  </div>
                ))}
                <SourceNote>{data.risk.source}</SourceNote>
              </div>

              <div className="analysis-block">
                <h3 className="block-title">Climate indicators</h3>
                <div className="comparison-bar">
                  <span>Precipitation 12m</span>
                  <strong>{num(data.rainfall.precipitation_mm, 1)} mm</strong>
                  <div>
                    <i
                      style={{
                        width: `${ratio(data.rainfall.precipitation_mm, data.rainfall.precipitation_previous_mm) * 100}%`,
                      }}
                    />
                  </div>
                  <small>previous {num(data.rainfall.precipitation_previous_mm, 1)} mm</small>
                </div>
                <div className="comparison-bar">
                  <span>Soil moisture</span>
                  <strong>{num(data.rainfall.mean_soil_moisture_0_7cm, 3)}</strong>
                  <div>
                    <i style={{ width: `${ratio(data.rainfall.mean_soil_moisture_0_7cm, data.rainfall.soil_moisture_previous) * 100}%` }} />
                  </div>
                  <small>m³/m³, 0–7 cm</small>
                </div>
                <div className="comparison-bar">
                  <span>Reference ET₀</span>
                  <strong>{num(data.rainfall.et0_total_mm, 1)} mm</strong>
                  <div>
                    <i style={{ width: `${ratio(data.rainfall.et0_total_mm, data.rainfall.et0_previous_mm) * 100}%` }} />
                  </div>
                  <small>previous {num(data.rainfall.et0_previous_mm, 1)} mm</small>
                </div>
                <SourceNote>
                  {data.rainfall.period_label} · {data.rainfall.coverage_days} days ·{" "}
                  {data.rainfall.source}
                </SourceNote>
              </div>

              <div className="analysis-block">
                <h3 className="block-title">Reservoir position</h3>
                {data.water ? (
                  <>
                    <div className="comparison-row">
                      <span>Reference dam</span>
                      <strong>{data.water.worst_dam_name}</strong>
                      <small>{data.water.selection_note}</small>
                    </div>
                    <div className="comparison-row">
                      <span>Dam fill</span>
                      <strong>{num(data.water.dam_fill_rate_pct, 1)}%</strong>
                      <small>status: {data.water.fill_status}</small>
                      <div>
                        <i style={{ width: `${data.water.dam_fill_rate_pct}%` }} />
                      </div>
                    </div>
                    <div className="comparison-row">
                      <span>National stock</span>
                      <strong>{num(data.water.national_stock_mm3, 1)} Mm³</strong>
                      <small>
                        {signedPct(data.water.stock_vs_3yr_avg_pct)} vs 3yr ·{" "}
                        {signedPct(data.water.stock_vs_last_year_pct)} vs last year
                      </small>
                    </div>
                    <div className="comparison-row">
                      <span>Seasonal inflow</span>
                      <strong>{signedPct(data.water.seasonal_inflow_change_pct)}</strong>
                      <small>vs previous season</small>
                    </div>
                  </>
                ) : (
                  <p className="hint">{data.water_note ?? "No dam data for this governorate."}</p>
                )}
                <SourceNote>{data.water?.source ?? data.sources.join(" · ")}</SourceNote>
              </div>
            </div>

            {data.crop_exposure ? (
              <>
                <h3 className="block-title wide">{data.crop_exposure.crop} exposure — {data.crop_exposure.exposure_score}/100</h3>
                <div className="factor-list">
                  {data.crop_exposure.factors.map((factor) => (
                    <div className="factor-row" key={factor.factor}>
                      <span className="factor-name">{factor.factor}</span>
                      <span className="factor-value">{factor.value}</span>
                      <Bar value={factor.stress_score} tone={factor.stress_score > 60 ? "danger" : "olive"} />
                      <span className="factor-meta">
                        stress {factor.stress_score} · weight {factor.weight}
                      </span>
                    </div>
                  ))}
                </div>
                <SourceNote>
                  {data.crop_exposure.method} {data.crop_exposure.note}
                  {data.crop_exposure.unavailable_factors.length
                    ? ` Unavailable factors: ${data.crop_exposure.unavailable_factors.join(", ")}.`
                    : ""}
                </SourceNote>
              </>
            ) : null}

            <div className="panel-footer">
              <Button variant="ghost" onClick={() => setAudit((value) => !value)}>
                {audit ? "Hide" : "Show"} technical audit log
              </Button>
              <SourceNote>
                Sources: {data.sources.join(" · ")} · data through {formatDate(data.data_through)}
              </SourceNote>
            </div>
            {audit ? <pre className="raw-json">{JSON.stringify(data, null, 2)}</pre> : null}
          </>
        ) : null}
      </DataState>
    </Panel>
  );
}

/** Bar width relative to the previous window, clamped to 0–100 %. */
function ratio(current: number | null, previous: number | null): number {
  if (current == null) return 0;
  if (!previous) return Math.min(100, Math.max(4, current));
  return Math.min(100, Math.max(3, (current / previous) * 100));
}

/** Plain-text brief shared by the Overview export and the Reports page. */
function buildBrief(
  data: Assessment,
  userRole: UserRole,
  crop: string,
  period: string,
  latest: { date: string; national_stock_mm3: number | null } | null,
): string {
  const lines = [
    "AGRIRISK — TUNISIA AGRICULTURAL RISK BRIEF",
    "=".repeat(52),
    `Governorate : ${data.governorate}`,
    `Profile     : ${userRole}`,
    `Crop focus  : ${crop || "General agriculture"}`,
    `Period      : ${data.period_label} (${period})`,
    `Generated   : ${new Date().toISOString()}`,
    "",
    "CLIMATE (Open-Meteo, measured)",
    `- Precipitation (12m)     : ${num(data.rainfall.precipitation_mm, 1)} mm`,
    `- Previous 12m            : ${num(data.rainfall.precipitation_previous_mm, 1)} mm`,
    `- Rainfall anomaly        : ${signedPct(data.rainfall.rainfall_anomaly_pct)}`,
    `- Mean topsoil moisture   : ${num(data.rainfall.mean_soil_moisture_0_7cm, 3)} m³/m³`,
    `- Reference ET₀           : ${num(data.rainfall.et0_total_mm, 1)} mm`,
    "",
    "WATER (AgriRisk dam dataset, measured)",
  ];

  if (data.water) {
    lines.push(
      `- Reference dam           : ${data.water.worst_dam_name} (${data.water.region ?? "n/a"})`,
      `- Dam fill                : ${num(data.water.dam_fill_rate_pct, 1)}% — ${data.water.fill_status}`,
      `- National stock          : ${num(data.water.national_stock_mm3, 1)} Mm³`,
      `- vs three-year average   : ${signedPct(data.water.stock_vs_3yr_avg_pct)}`,
      `- vs last year            : ${signedPct(data.water.stock_vs_last_year_pct)}`,
      `- Seasonal inflow change  : ${signedPct(data.water.seasonal_inflow_change_pct)}`,
    );
  } else {
    lines.push(`- ${data.water_note ?? "No dam data for this governorate."}`);
  }

  lines.push("", `RISK MODEL — ${data.risk.level_label} (${data.risk.category})`, `- Action: ${data.risk.recommended_action}`, "", "Drivers");
  for (const driver of data.risk.drivers) lines.push(`- ${driver.indicator}: ${driver.value} — ${driver.signal}`);

  if (data.crop_exposure) {
    lines.push(
      "",
      `CROP EXPOSURE — ${data.crop_exposure.crop}: ${data.crop_exposure.exposure_level} (${data.crop_exposure.exposure_score}/100)`,
      ...data.crop_exposure.factors.map(
        (factor) => `- ${factor.factor}: ${factor.value} (stress ${factor.stress_score}, weight ${factor.weight})`,
      ),
    );
  }

  lines.push("", "Sources", ...data.sources.map((source) => `- ${source}`), "", data.note);
  if (latest) lines.push(`National stock series through ${latest.date}: ${num(latest.national_stock_mm3, 1)} Mm³.`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------
function RegionsPage({
  period,
  region,
  setRegion,
  governorates,
  crops,
  userRole,
}: {
  period: string;
  region: string;
  setRegion: (value: string) => void;
  governorates: string[];
  crops: string[];
  userRole: UserRole;
}) {
  const national = useNational(period);
  const points = useMemo(() => national.data?.points ?? [], [national.data]);
  const sorted = useMemo(
    () =>
      [...points].sort(
        (a, b) =>
          (LEVEL_RANK[a.risk_level ?? "LOW"] ?? 9) - (LEVEL_RANK[b.risk_level ?? "LOW"] ?? 9) ||
          (a.rainfall_anomaly_pct ?? 0) - (b.rainfall_anomaly_pct ?? 0),
      ),
    [points],
  );
  const current = points.find((point) => point.name === region);

  const exportCsv = () => {
    if (!sorted.length) return;
    downloadText(
      `AgriRisk_regions_${period}.csv`,
      toCsv(
        ["governorate", "risk_level", "risk_label", "precipitation_mm", "rainfall_anomaly_pct", "soil_moisture_0_7cm", "et0_total_mm", "dam_fill_pct", "dam"],
        sorted.map((point) => [
          point.name,
          point.risk_level,
          point.risk_label,
          point.precipitation_mm,
          point.rainfall_anomaly_pct,
          point.mean_soil_moisture_0_7cm,
          point.et0_total_mm,
          point.dam_fill_rate_pct,
          point.worst_dam_name,
        ]),
      ),
      "text/csv",
    );
  };

  return (
    <>
      <PageIntro
        eyebrow="Regional analysis"
        title={region}
        description="Every governorate is assessed on the same measured indicators, so regions can be compared directly. Click any row to change the selected region."
        actions={
          <>
            <GovernorateField value={region} options={governorates} onChange={setRegion} />
            <Button onClick={exportCsv} disabled={!sorted.length}>
              <Icon name="download" size={14} /> Export CSV
            </Button>
          </>
        }
      />

      <div className="region-hero">
        <div className="region-title-line">
          <h2 className="section-title">{region}</h2>
          <RiskPill tone={toneForLevel(current?.risk_level)}>{current?.risk_label ?? "No data"}</RiskPill>
          {current?.risk_category ? <small className="muted">{current.risk_category}</small> : null}
        </div>
        <p>
          {current
            ? `${region} is classified ${current.risk_label?.toLowerCase()} risk${
                current.risk_category ? ` (${current.risk_category.toLowerCase()})` : ""
              } for the selected period. It received ${num(current.precipitation_mm, 1)} mm of precipitation, ${signedPct(
                current.rainfall_anomaly_pct,
              )} against the previous 12 months, with mean topsoil moisture of ${num(
                current.mean_soil_moisture_0_7cm,
                3,
              )} m³/m³ and reference ET₀ of ${num(current.et0_total_mm, 1)} mm.`
            : "No climate record was returned for this governorate."}
        </p>
        {current ? (
          <p className="muted">
            {current.dam_fill_rate_pct == null
              ? "No monitored reservoir: this region is assessed on climate indicators only."
              : `Reference reservoir ${current.worst_dam_name} (${current.region ?? "n/a"}) is at ${num(
                  current.dam_fill_rate_pct,
                  1,
                )}% fill — ${current.fill_status ?? "status unknown"}.`}{" "}
            Run the assessment below for the model drivers and recommended action.
          </p>
        ) : null}
      </div>

      <AssessmentPanel
        region={region}
        crops={crops}
        period={period}
        userRole={userRole}
        governorates={governorates}
        setRegion={setRegion}
      />

      <Panel
        className="editorial-table"
        title={`All governorates (${sorted.length})`}
        subtitle="Sorted by model risk, then rainfall anomaly"
      >
        <div className="data-row table-head cols-6">
          <span>Governorate</span>
          <span>Risk</span>
          <span>Precipitation</span>
          <span>Anomaly</span>
          <span>Dam fill</span>
          <span>Reference dam</span>
        </div>
        <DataState loading={national.loading} error={national.error} empty={!sorted.length}>
          {sorted.map((point) => (
            <button
              type="button"
              key={point.name}
              className={`data-row row-button${point.name === region ? " is-selected" : ""}`}
              onClick={() => setRegion(point.name)}
            >
              <strong>{point.name}</strong>
              <span>
                <RiskPill tone={toneForLevel(point.risk_level)}>{point.risk_label}</RiskPill>
              </span>
              <span>{num(point.precipitation_mm, 1)} mm</span>
              <span className="mono">{signedPct(point.rainfall_anomaly_pct)}</span>
              <span>{pct(point.dam_fill_rate_pct)}</span>
              <span className="muted">{point.worst_dam_name ?? "—"}</span>
            </button>
          ))}
        </DataState>
        {national.data?.failures?.length ? (
          <SourceNote>
            {national.data.failures.length} governorate(s) failed to load:{" "}
            {national.data.failures.map((failure) => failure.governorate).join(", ")}.
          </SourceNote>
        ) : null}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------
function WaterPage() {
  const summary = useWaterSummary();
  const history = useWaterHistory(36);
  const [dam, setDam] = useState<string | null>(null);
  const damHistory = useDamHistory(dam);
  const series = history.data?.series ?? [];
  const latest = series[series.length - 1] ?? null;
  const rows = useMemo(
    () =>
      [...(summary.data?.rows ?? [])].sort(
        (a, b) => (a.fill_pct ?? 999) - (b.fill_pct ?? 999) || a.dam.localeCompare(b.dam),
      ),
    [summary.data],
  );
  const critical = rows.filter((row) => (row.fill_pct ?? 100) < 30).length;
  const dates = series.map((point) => point.date);

  const exportCsv = () => {
    if (!rows.length) return;
    downloadText(
      `AgriRisk_dams_${summary.data?.date ?? "latest"}.csv`,
      toCsv(
        ["dam", "governorate", "zone", "capacity_mm3", "stock_mm3", "fill_pct", "inflow_mm3", "previous_inflow_mm3", "inflow_change_pct"],
        rows.map((row) => [
          row.dam,
          row.governorate,
          row.region,
          row.capacity_mm3,
          row.stock_mm3,
          row.fill_pct,
          row.current_season_inflow_mm3,
          row.previous_season_inflow_mm3,
          row.inflow_change_pct,
        ]),
      ),
      "text/csv",
    );
  };

  return (
    <>
      <PageIntro
        eyebrow="Water resources"
        title="Reservoir monitoring"
        description={`Measured stock and fill for ${summary.data?.count ?? 0} monitored dams, updated ${formatDate(summary.data?.date)}.`}
        actions={
          <>
            <Button onClick={() => { summary.reload(); history.reload(); }}>
              <Icon name="refresh" size={14} /> Refresh
            </Button>
            <Button onClick={exportCsv} disabled={!rows.length}>
              <Icon name="download" size={14} /> Export CSV
            </Button>
          </>
        }
      />

      <DataState loading={history.loading} error={history.error} empty={!series.length}>
        <section className="zone-strip">
          <div>
            <span>North zone</span>
            <strong>{num(latest?.north_mm3, 1)} Mm³</strong>
            <small>Northern dams — Siliana, Badr, Sidi Salem</small>
          </div>
          <div>
            <span>Centre zone</span>
            <strong>{num(latest?.centre_mm3, 1)} Mm³</strong>
            <small>Central dams — Sidi Salem, Kasserine, El Kef</small>
          </div>
          <div>
            <span>Cap Bon zone</span>
            <strong>{num(latest?.cap_bon_mm3, 1)} Mm³</strong>
            <small>Eastern dams — Sfax, El Gonnaatine, Sidi Abdelaziz</small>
          </div>
        </section>
      </DataState>

      <div className="chart-grid">
        <Panel
          className="chart-panel"
          title="National stock vs three-year average"
          subtitle="Measured monthly totals, 36 months"
          actions={
            latest ? (
              <div className="chart-stat">
                <strong>{num(latest.national_stock_mm3, 1)} Mm³</strong>
                <span>
                  {latest.three_year_average_mm3
                    ? signedPct((latest.national_stock_mm3! / latest.three_year_average_mm3 - 1) * 100)
                    : ""}
                </span>
              </div>
            ) : null
          }
        >
          <DataState loading={history.loading} error={history.error} empty={!series.length}>
            <LineChart
              dates={dates}
              unit="Mm³"
              valueSuffix=" Mm³"
              series={[
                { key: "stock", label: "National stock", values: series.map((p) => p.national_stock_mm3) },
                { key: "avg", label: "Three-year average", values: series.map((p) => p.three_year_average_mm3), dashed: true },
                { key: "last", label: "Same month last year", values: series.map((p) => p.last_year_stock_mm3), color: "var(--sage)" },
              ]}
            />
          </DataState>
        </Panel>

        <Panel className="chart-panel" title="Seasonal inflow" subtitle="Current vs previous season, measured">
          <DataState loading={history.loading} error={history.error} empty={!series.length}>
            <LineChart
              dates={dates}
              unit="Mm³"
              valueSuffix=" Mm³"
              zeroBased={false}
              series={[
                { key: "inflow", label: "Current season", values: series.map((p) => p.current_season_inflow_mm3) },
                { key: "prev", label: "Previous season", values: series.map((p) => p.previous_season_inflow_mm3), color: "var(--sage)" },
              ]}
            />
          </DataState>
        </Panel>
      </div>

      <Panel
        className="editorial-table"
        title={`Monitored dams (${rows.length})`}
        subtitle="Lowest fill first"
        legend={
          <>
            <span>
              <i className="swatch tone-high" />
              Below 30% fill
            </span>
            <span>
              <i className="swatch tone-moderate" />
              30–45%
            </span>
            <span>
              <i className="swatch tone-low" />
              Above 45%
            </span>
          </>
        }
      >
        <div className="data-row table-head cols-6">
          <span>Dam</span>
          <span>Governorate</span>
          <span>Capacity</span>
          <span>Stock</span>
          <span>Fill</span>
          <span>Inflow change</span>
        </div>
        <DataState loading={summary.loading} error={summary.error} empty={!rows.length}>
          {rows.map((row) => (
            <button
              type="button"
              key={row.dam}
              className={`data-row cols-6 row-button${row.dam === dam ? " is-selected" : ""}`}
              onClick={() => setDam(row.dam === dam ? null : row.dam)}
              title={`Show measured history for ${row.dam}`}
            >
              <strong>
                {row.dam}
                <small className="muted"> {row.region}</small>
              </strong>
              <span>{row.governorate}</span>
              <span>{num(row.capacity_mm3, 1)} Mm³</span>
              <span>{num(row.stock_mm3, 1)} Mm³</span>
              <span className={(row.fill_pct ?? 100) < 30 ? "warning" : undefined}>
                {pct(row.fill_pct)}
              </span>
              <span className="mono">{signedPct(row.inflow_change_pct)}</span>
            </button>
          ))}
        </DataState>
        {rows.length ? (
          <div className="watch-note">
            <span>Interpretation</span>
            <p>
              {critical} of {rows.length} monitored dams are below 30% of capacity. Reservoir data is measured
              monthly from the AgriRisk dam dataset ({summary.data?.source ?? "unknown source"}) and is not
              interpolated for the current month.
            </p>
          </div>
        ) : null}
      </Panel>

      {dam ? (
        <Panel
          className="chart-panel"
          title={`${dam} — measured history`}
          subtitle={`${damHistory.data?.governorate ?? ""} · last ${damHistory.data?.series.length ?? 0} readings`}
          actions={
            <Button variant="ghost" onClick={() => setDam(null)}>
              <Icon name="x" size={13} /> Clear
            </Button>
          }
        >
          <DataState loading={damHistory.loading} error={damHistory.error} empty={!damHistory.data?.series.length}>
            {damHistory.data ? (
              <LineChart
                dates={damHistory.data.series.map((point) => point.date)}
                unit="% fill"
                valueSuffix="% fill"
                zeroBased={false}
                series={[
                  { key: "fill", label: "Fill rate", values: damHistory.data.series.map((p) => p.fill_pct) },
                  {
                    key: "stock",
                    label: "Stock (Mm³)",
                    values: damHistory.data.series.map((p) => p.stock_mm3),
                    color: "var(--sage)",
                  },
                ]}
              />
            ) : null}
          </DataState>
          <SourceNote>Readings come from the AgriRisk dam dataset and are not interpolated.</SourceNote>
        </Panel>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Climate
// ---------------------------------------------------------------------------
function ClimatePage({ period }: { period: string }) {
  const climate = useClimate(period);
  const rows = useMemo(
    () =>
      [...(climate.data?.rows ?? [])].sort(
        (a, b) => (a.rainfall_anomaly_pct ?? 0) - (b.rainfall_anomaly_pct ?? 0),
      ),
    [climate.data],
  );
  const stats = useMemo(
    () => ({
      precipitation: mean(rows.map((row) => row.precipitation_mm)),
      anomaly: mean(rows.map((row) => row.rainfall_anomaly_pct)),
      soil: mean(rows.map((row) => row.mean_soil_moisture_0_7cm)),
      et0: mean(rows.map((row) => row.et0_total_mm)),
    }),
    [rows],
  );
  const driest = rows.slice(0, 10);
  const wettest = [...rows].reverse().slice(0, 5);
  const maxAnomaly = Math.max(...rows.map((row) => Math.abs(row.rainfall_anomaly_pct ?? 0)), 1);

  return (
    <>
      <PageIntro
        eyebrow="Climate"
        title="Measured climate indicators"
        description="Open-Meteo ERA5 archive data aggregated per governorate over the selected window and compared with the preceding window of equal length."
        actions={
          <Button onClick={climate.reload}>
            <Icon name="refresh" size={14} /> Refresh
          </Button>
        }
      />

      <DataState loading={climate.loading} error={climate.error}>
        <section className="indicator-strip">
          <Stat label="Mean precipitation" value={num(stats.precipitation, 1)} unit="mm" context="across assessed governorates" />
          <Stat
            label="Mean anomaly"
            value={num(stats.anomaly, 1)}
            unit="%"
            context="vs previous window of equal length"
          />
          <Stat label="Mean soil moisture" value={num(stats.soil, 3)} unit="m³/m³" context="0–7 cm depth" />
          <Stat label="Mean reference ET₀" value={num(stats.et0, 1)} unit="mm" context="Makkink-style reference" />
          <Stat
            label="Governorates"
            value={int(rows.length)}
            context={climate.data?.failures?.length ? `${climate.data.failures.length} failed` : "all loaded"}
            emphasis
          />
        </section>

        <div className="analysis-sections">
          <div className="analysis-block">
            <h3 className="block-title">Driest anomalies</h3>
            {driest.map((row) => (
              <div className="comparison-bar" key={row.governorate}>
                <span>{row.governorate}</span>
                <strong>{signedPct(row.rainfall_anomaly_pct)}</strong>
                <div>
                  <i
                    style={{
                      width: `${(Math.abs(row.rainfall_anomaly_pct ?? 0) / maxAnomaly) * 100}%`,
                      background: (row.rainfall_anomaly_pct ?? 0) < -15 ? "var(--danger)" : "var(--warning)",
                    }}
                  />
                </div>
                <small>{num(row.precipitation_mm, 1)} mm</small>
              </div>
            ))}
          </div>

          <div className="analysis-block">
            <h3 className="block-title">Wettest anomalies</h3>
            {wettest.map((row) => (
              <div className="comparison-bar" key={row.governorate}>
                <span>{row.governorate}</span>
                <strong>{signedPct(row.rainfall_anomaly_pct)}</strong>
                <div>
                  <i style={{ width: `${(Math.abs(row.rainfall_anomaly_pct ?? 0) / maxAnomaly) * 100}%`, background: "var(--sage)" }} />
                </div>
                <small>{num(row.precipitation_mm, 1)} mm</small>
              </div>
            ))}
          </div>

          <div className="analysis-block">
            <h3 className="block-title">Method</h3>
            <div className="comparison-row">
              <span>Source</span>
              <strong>{climate.data?.source ?? "—"}</strong>
              <small>Daily precipitation, topsoil moisture and reference evapotranspiration.</small>
            </div>
            <div className="comparison-row">
              <span>Window</span>
              <strong>{rows[0]?.period_label ?? "—"}</strong>
              <small>Each governorate is queried at its own centroid coordinates.</small>
            </div>
            <div className="comparison-row">
              <span>Comparison</span>
              <strong>Previous window</strong>
              <small>Anomaly is computed as the change against the immediately preceding window of equal length.</small>
            </div>
            <div className="comparison-row">
              <span>Coverage</span>
              <strong>{int(rows.filter((row) => row.precipitation_mm != null).length)}/{rows.length}</strong>
              <small>Governorates with usable precipitation totals for this window.</small>
            </div>
            {climate.data?.failures?.length ? (
              <SourceNote>
                Failed: {climate.data.failures.map((failure) => `${failure.governorate} (${failure.error})`).join("; ")}
              </SourceNote>
            ) : null}
          </div>
        </div>
      </DataState>
    </>
  );
}

// ---------------------------------------------------------------------------
// Crops
// ---------------------------------------------------------------------------
function CropsPage({
  region,
  setRegion,
  governorates,
}: {
  region: string;
  setRegion: (value: string) => void;
  governorates: string[];
}) {
  const profiles = useCropProfiles();
  const exposure = useCropExposure(region);
  const [crop, setCrop] = useState("");
  const assessment = useAssessment(region, crop || null);
  const cropList = profiles.data?.crops ?? [];
  const detail = assessment.data?.crop_exposure ?? null;
  const rows = exposure.data?.rows ?? [];
  const ranked = useMemo(() => [...rows].sort((a, b) => b.exposure_score - a.exposure_score), [rows]);

  return (
    <>
      <PageIntro
        eyebrow="Crop exposure"
        title={`Crop sensitivity — ${region}`}
        description="Exposure scores combine each crop's water requirement and drought sensitivity with the measured climate and reservoir position of the selected governorate."
        actions={<GovernorateField value={region} options={governorates} onChange={setRegion} />}
      />

      <div className="crop-section-container">
        <div className="crop-section-header">
          <h3>Crop profiles</h3>
          <small className="muted">{cropList.length} crops · select one for a full factor breakdown</small>
        </div>
        <DataState loading={profiles.loading} error={profiles.error} empty={!cropList.length}>
          <div className="crop-grid">
            {cropList.map((profile) => (
              <button
                type="button"
                key={profile.crop}
                className={`crop-card${profile.crop === crop ? " selected" : ""}`}
                onClick={() => setCrop(profile.crop === crop ? "" : profile.crop)}
                aria-pressed={profile.crop === crop}
              >
                <strong>{profile.crop}</strong>
                <span>{int(profile.water_need_mm)} mm water need</span>
                <span>sensitivity {profile.drought_sensitivity}/5</span>
                <span>{profile.season}</span>
              </button>
            ))}
          </div>
        </DataState>
      </div>

      {crop ? (
        <Panel
          className="chart-panel"
          title={`${crop} exposure in ${region}`}
          subtitle={detail ? `${detail.exposure_level} — ${detail.exposure_score}/100` : "loading factor breakdown"}
        >
          <DataState loading={assessment.loading && !detail} error={assessment.error} idle={!detail && !assessment.loading}>
            {detail ? (
              <>
                <div className="analysis-sections">
                  <div className="analysis-block">
                    <h3 className="block-title">Profile</h3>
                    <div className="comparison-row">
                      <span>Water requirement</span>
                      <strong>{int(detail.profile.water_need_mm)} mm</strong>
                      <small>{detail.profile.season} season</small>
                    </div>
                    <div className="comparison-row">
                      <span>Drought sensitivity</span>
                      <strong>{detail.profile.drought_sensitivity}/5</strong>
                      <small>{detail.profile.peak_water_demand}</small>
                    </div>
                    <div className="comparison-row">
                      <span>Exposure</span>
                      <strong>{detail.exposure_score}/100</strong>
                      <small>{detail.exposure_level}</small>
                      <div>
                        <i style={{ width: `${detail.exposure_score}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="analysis-block">
                    <h3 className="block-title">Measured conditions</h3>
                    <div className="comparison-row">
                      <span>Precipitation</span>
                      <strong>{num(exposure.data?.climate.precipitation_mm, 1)} mm</strong>
                      <small>{signedPct(exposure.data?.climate.rainfall_anomaly_pct)} vs previous window</small>
                    </div>
                    <div className="comparison-row">
                      <span>Soil moisture</span>
                      <strong>{num(exposure.data?.climate.mean_soil_moisture_0_7cm, 3)}</strong>
                      <small>m³/m³, 0–7 cm</small>
                    </div>
                    <div className="comparison-row">
                      <span>Dam fill</span>
                      <strong>{pct(exposure.data?.climate.dam_fill_rate_pct)}</strong>
                      <small>{exposure.data?.climate.dam_fill_rate_pct == null ? "no monitored dam" : "reference reservoir"}</small>
                    </div>
                  </div>

                  <div className="analysis-block">
                    <h3 className="block-title">Exposure factors</h3>
                    {detail.factors.map((factor) => (
                      <div className="comparison-bar" key={factor.factor}>
                        <span>{factor.factor}</span>
                        <strong>{factor.value}</strong>
                        <div>
                          <i
                            style={{
                              width: `${Math.min(100, factor.stress_score)}%`,
                              background: factor.stress_score > 60 ? "var(--danger)" : "var(--olive)",
                            }}
                          />
                        </div>
                        <small>stress {factor.stress_score} · w {factor.weight}</small>
                      </div>
                    ))}
                  </div>
                </div>
                <SourceNote>
                  {detail.method} {detail.note} {detail.profile.profile_note}
                </SourceNote>
              </>
            ) : null}
          </DataState>
        </Panel>
      ) : null}

      <Panel
        className="editorial-table"
        title={`All crop exposure in ${region}`}
        subtitle="Highest exposure first"
      >
        <div className="data-row table-head cols-4">
          <span>Crop</span>
          <span>Exposure</span>
          <span>Score</span>
          <span>Water need</span>
        </div>
        <DataState loading={exposure.loading} error={exposure.error} empty={!ranked.length}>
          {ranked.map((row) => (
            <button
              type="button"
              key={row.crop}
              className={`data-row row-button${row.crop === crop ? " is-selected" : ""}`}
              onClick={() => setCrop(row.crop)}
            >
              <strong>{row.crop}</strong>
              <span>
                <RiskPill tone={exposureTone(row.exposure_level)}>{row.exposure_level}</RiskPill>
              </span>
              <span>
                <Bar value={row.exposure_score} tone={row.exposure_level === "HIGH" ? "danger" : "olive"} />{" "}
                {row.exposure_score}
              </span>
              <span>{int(row.water_need_mm)} mm</span>
            </button>
          ))}
        </DataState>
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------
const SCENARIO_PRESETS = [-30, -20, -10, 0, 10, 20, 30];

function ScenariosPage({
  region,
  setRegion,
  governorates,
  crops,
}: {
  region: string;
  setRegion: (value: string) => void;
  governorates: string[];
  crops: string[];
}) {
  const [crop, setCrop] = useState("");
  const [change, setChange] = useState(-10);
  const debouncedChange = useDebounced(change, 450);
  const scenario = useScenario(region, crop || null, debouncedChange);

  const data = scenario.data;
  const exposureShift =
    data?.crop_exposure_before?.score != null && data.crop_exposure_after?.score != null
      ? data.crop_exposure_after.score - data.crop_exposure_before.score
      : null;

  const exportScenario = () => {
    if (!data) return;
    downloadText(
      `AgriRisk_scenario_${region.replace(/\s+/g, "_")}_${data.scenario.rainfall_change_pct}pct.json`,
      JSON.stringify(data, null, 2),
      "application/json",
    );
  };

  return (
    <>
      <PageIntro
        eyebrow="Scenario analysis"
        title="Rainfall stress test"
        description="Re-runs the AgriRisk model with a hypothetical change in 12-month precipitation. Soil moisture responds to the rainfall delta, so the model output moves without any fabricated data."
        actions={
          <>
            <GovernorateField value={region} options={governorates} onChange={setRegion} />
            <Select label="Crop" id="scenario-crop" value={crop} options={["", ...crops]} onChange={setCrop} />
            <Button onClick={exportScenario} disabled={!data}>
              <Icon name="download" size={14} /> Export JSON
            </Button>
          </>
        }
      />

      <div className="scenario-layout">
        <div className="scenario-controls">
          <div className="control-row">
            <div>
              <span>Precipitation change</span>
              <strong>{signed(change, 0)}%</strong>
            </div>
            <input
              type="range"
              min={-40}
              max={40}
              step={5}
              value={change}
              onChange={(event) => setChange(Number(event.target.value))}
              aria-label="Precipitation change percentage"
            />
            <small>
              <span>-40% severe drought</span>
              <span>measured baseline</span>
              <span>+40% wet year</span>
            </small>
          </div>

          <div className="control-row">
            <div>
              <span>Quick scenarios</span>
            </div>
            <div className="chip-group">
              {SCENARIO_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`chip${preset === change ? " is-active" : ""}`}
                  onClick={() => setChange(preset)}
                >
                  {preset > 0 ? `+${preset}%` : `${preset}%`}
                </button>
              ))}
            </div>
          </div>

          <div className="control-row">
            <div>
              <span>Model inputs</span>
            </div>
            <div className="comparison-row">
              <span>Precipitation before</span>
              <strong>{data ? `${num(data.scenario.precipitation_mm_before, 1)} mm` : "—"}</strong>
            </div>
            <div className="comparison-row">
              <span>Precipitation after</span>
              <strong>{data ? `${num(data.scenario.precipitation_mm_after, 1)} mm` : "—"}</strong>
            </div>
            <div className="comparison-row">
              <span>Soil moisture shift</span>
              <strong>
                {data ? signed(data.scenario.soil_moisture_after - data.scenario.soil_moisture_before, 3) : "—"}
              </strong>
              <small>m³/m³, 0–7 cm</small>
            </div>
          </div>
        </div>

        <div className="risk-comparison">
          <div className="comparison-cards-row">
            <div className="scenario-metric-box">
              <span className="box-label">Baseline</span>
              <strong className="box-score">{data?.risk_before.level_label ?? "—"}</strong>
              <small className="muted">measured conditions</small>
            </div>
            <Icon name="arrow" size={20} />
            <div className="scenario-metric-box">
              <span className="box-label">Scenario</span>
              <strong className="box-score">
                {scenario.loading && !data ? "…" : (data?.risk_after.level_label ?? "—")}
              </strong>
              <small className="muted">
                {data ? `${signed(data.scenario.rainfall_change_pct, 0)}% rainfall` : "computing"}
              </small>
            </div>
          </div>

          {data?.crop_exposure_before && data.crop_exposure_after ? (
            <div className="comparison-cards-row">
              <div className="scenario-metric-box">
                <span className="box-label">{crop} exposure before</span>
                <strong className="box-score">{data.crop_exposure_before.score ?? "—"}</strong>
                <small className="muted">{data.crop_exposure_before.level ?? "not scored"}</small>
              </div>
              <Icon name="arrow" size={20} />
              <div className="scenario-metric-box">
                <span className="box-label">{crop} exposure after</span>
                <strong className="box-score">{data.crop_exposure_after.score ?? "—"}</strong>
                <small className="muted">
                  {exposureShift == null ? "not scored" : `${signed(exposureShift, 0)} points`}
                </small>
              </div>
            </div>
          ) : null}

          <p>
            {scenario.error ??
              data?.note ??
              "Adjust the rainfall change to re-run the model. National fetches are cached for five minutes, so repeated slider moves stay responsive."}
          </p>

          {data?.changed === false ? (
            <div className="watch-note">
              <span>No model change</span>
              <p>This scenario does not push the region across a risk threshold.</p>
            </div>
          ) : null}

          {data?.drivers_after?.length ? (
            <>
              <span className="box-label">Drivers after scenario</span>
              {data.drivers_after.map((driver) => (
                <div className="comparison-row" key={driver.indicator}>
                  <span>{driver.indicator}</span>
                  <strong>{driver.value}</strong>
                  <small>{driver.signal}</small>
                </div>
              ))}
            </>
          ) : null}

          <SourceNote>{data?.source ?? "AgriRisk risk model · Open-Meteo rainfall anomaly"}</SourceNote>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
function ReportsPage({
  region,
  setRegion,
  governorates,
  crops,
  userRole,
}: {
  region: string;
  setRegion: (value: string) => void;
  governorates: string[];
  crops: string[];
  userRole: UserRole;
}) {
  const [crop, setCrop] = useState("");
  const [kind, setKind] = useState<string>("assessment");
  const reports = useReports(region, crop || null);
  const assessment = useAssessment(region, crop || null);
  const history = useWaterSummary();
  const entries = reports.data?.reports ?? [];
  const selectedEntry = entries.find((entry) => entry.kind === kind) ?? entries[0] ?? null;

  const exportCsv = () => {
    if (!entries.length) return;
    downloadText(
      `AgriRisk_reports_${region.replace(/\s+/g, "_")}.csv`,
      toCsv(
        ["id", "kind", "title", "coverage", "date", "risk_level", "risk_label", "summary"],
        entries.map((entry) => [
          entry.id,
          entry.kind,
          entry.title,
          entry.coverage,
          entry.date,
          entry.risk_level,
          entry.risk_label,
          entry.summary,
        ]),
      ),
      "text/csv",
    );
  };

  const brief =
    assessment.data && selectedEntry?.kind === "assessment"
      ? buildBrief(assessment.data, userRole, crop, "current", null)
      : null;

  return (
    <>
      <PageIntro
        eyebrow="Reports"
        title="Report centre"
        description="Every report is generated from the same measured indicators used across the dashboard. Nothing here is pre-written."
        actions={
          <>
            <GovernorateField value={region} options={governorates} onChange={setRegion} />
            <Select label="Crop" id="report-crop" value={crop} options={["", ...crops]} onChange={setCrop} />
            <Button onClick={exportCsv} disabled={!entries.length}>
              <Icon name="download" size={14} /> Export index
            </Button>
          </>
        }
      />

      <div className="report-list">
        <div className="report-head report-row">
          <span>Report</span>
          <span>Coverage</span>
          <span>Date</span>
          <span>Risk</span>
          <span />
        </div>
        <DataState loading={reports.loading} error={reports.error} empty={!entries.length}>
          {entries.map((entry) => (
            <button
              type="button"
              key={entry.id}
              className={`report-row row-button${selectedEntry?.id === entry.id ? " is-selected" : ""}`}
              onClick={() => setKind(entry.kind)}
            >
              <span>
                <strong>{entry.title}</strong>
                <small className="muted">{entry.summary}</small>
              </span>
              <span>{entry.coverage}</span>
              <span>{formatDate(entry.date)}</span>
              <span>
                <RiskPill tone={toneFromText(entry.risk_level)}>{entry.risk_label ?? "—"}</RiskPill>
              </span>
              <span>
                <Icon name="chevron" size={14} />
              </span>
            </button>
          ))}
        </DataState>
      </div>

      <div className="ai-report-container">
        <div className="ai-report-header">
          <h3>{selectedEntry?.title ?? "Risk brief"}</h3>
          <div className="panel-actions">
            {brief ? (
              <Button onClick={() => downloadText(`AgriRisk_${region.replace(/\s+/g, "_")}_brief.txt`, brief)}>
                <Icon name="download" size={14} /> Download .txt
              </Button>
            ) : null}
          </div>
        </div>
        <DataState
          loading={assessment.loading && !assessment.data}
          error={assessment.error}
          empty={!selectedEntry}
        >
          {selectedEntry && brief ? (
            <>
              <div className="ai-report-content">{brief}</div>
              {assessment.data ? (
                <div className="ai-metrics-row">
                  <div className="ai-metric-card">
                    <span>Risk level</span>
                    <strong>{assessment.data.risk.level_label}</strong>
                  </div>
                  <div className="ai-metric-card">
                    <span>Rainfall anomaly</span>
                    <strong>{signedPct(assessment.data.rainfall.rainfall_anomaly_pct)}</strong>
                  </div>
                  <div className="ai-metric-card">
                    <span>Dam fill</span>
                    <strong>
                      {assessment.data.water ? `${num(assessment.data.water.dam_fill_rate_pct, 1)}%` : "n/a"}
                    </strong>
                  </div>
                  <div className="ai-metric-card">
                    <span>National stock</span>
                    <strong>
                      {assessment.data.water ? `${num(assessment.data.water.national_stock_mm3, 0)} Mm³` : "n/a"}
                    </strong>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="ai-report-content">
              {selectedEntry
                ? `${selectedEntry.title} — ${selectedEntry.summary}. This report is generated from measured data and is available once the assessment for ${region} has run.`
                : "Select a report above."}
              {history.data ? (
                <p className="muted">
                  Dam dataset snapshot: {formatDate(history.data.date)} · {history.data.count} monitored dams.
                </p>
              ) : null}
            </div>
          )}
        </DataState>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Assistant
// ---------------------------------------------------------------------------
const SUGGESTIONS = [
  "Which governorates are at very high drought risk right now?",
  "How much water is stored nationally versus the three-year average?",
  "What is the rainfall anomaly for my selected governorate?",
  "Which monitored dams are below 30% fill?",
  "How exposed is olive oil to the current conditions?",
  "Summarise the recommended action for my region.",
];

function AssistantPage({
  region,
  setRegion,
  governorates,
  crops,
  crop,
  setCrop,
}: {
  region: string;
  setRegion: (value: string) => void;
  governorates: string[];
  crops: string[];
  crop: string;
  setCrop: (value: string) => void;
}) {
  const health = useHealth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      const history = messages.map((message) => ({ role: message.role, content: message.content }));
      setMessages((current) => [...current, { role: "user", content: trimmed }]);
      setInput("");
      setSending(true);
      setError(null);

      try {
        const reply = await api.chat({
          message: trimmed,
          history,
          governorate: region,
          crop: crop || null,
          period: "current",
        });
        setMessages((current) => [
          ...current,
          { role: "assistant", content: reply.reply, toolsUsed: reply.tools_used },
        ]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setSending(false);
      }
    },
    [crop, messages, region, sending],
  );

  return (
    <>
      <PageIntro
        eyebrow="AI assistant"
        title="Ask AgriRisk"
        description="The assistant answers from the same measured climate, reservoir and risk-model data as the rest of the dashboard, using server-side tools. No data leaves this deployment."
      />

      <div className="chat-container">
        <aside className="chat-sidebar-panel">
          <div>
            <p className="section-label">Context</p>
            <div className="field-stack">
              <GovernorateField value={region} options={governorates} onChange={setRegion} />
              <Select label="Crop" id="chat-crop" value={crop} options={["", ...crops]} onChange={setCrop} />
            </div>
            <p className="hint">
              The assistant is grounded on {region}
              {crop ? ` and ${crop}` : ""}. It calls the AgriRisk API tools rather than answering from memory.
            </p>
          </div>

          <div>
            <p className="section-label">Try asking</p>
            <div className="suggestion-list">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="chip"
                  onClick={() => send(suggestion)}
                  disabled={sending}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="section-label">Grounding</p>
            <ul className="tool-list">
              <li>
                <span className={`dot ${health.data?.status === "ok" ? "ok" : "off"}`} />
                API {health.data ? `v${health.data.version} · ${health.data.status}` : "checking…"}
              </li>
              <li>
                <span className={`dot ${health.data?.llm_configured ? "ok" : "off"}`} />
                Assistant model {health.data?.llm_configured ? "configured" : "not configured"}
              </li>
              <li>
                <span className="dot ok" />
                {health.data?.governorates ?? 24} governorates · {health.data?.crops ?? 0} crops
              </li>
              <li>
                <span className="dot ok" />
                Dams through {formatDate(health.data?.dam_coverage.last_date)}
              </li>
            </ul>
          </div>
        </aside>

        <section className="chat-main-panel">
          <div className="chat-messages-area" ref={scrollRef}>
            {!messages.length ? (
              <div className="chat-message-bubble assistant">
                <Markdown
                  text={`Ask me anything about Tunisian agricultural risk. I can assess a **governorate**, compare **reservoir levels**, explain the **AgriRisk risk model**, or stress-test a crop with a hypothetical rainfall change.\n\nI am currently grounded on **${region}**${crop ? ` with a **${crop}** focus` : ""}.`}
                />
              </div>
            ) : null}

            {messages.map((message, index) => (
              <div key={index} className={`chat-message-bubble ${message.role}`}>
                <Markdown text={message.content} />
                {message.toolsUsed?.length ? (
                  <div className="tool-chips">
                    {message.toolsUsed.map((tool) => (
                      <span key={tool}>{tool}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}

            {sending ? (
              <div className="chat-message-bubble assistant">
                <Spinner label="Consulting AgriRisk tools…" />
              </div>
            ) : null}
            {error ? (
              <div className="chat-message-bubble assistant is-error">
                <strong>Assistant unavailable</strong>
                <p>{error}</p>
              </div>
            ) : null}
          </div>

          <form
            className="chat-input-bar"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={`Ask about ${region}…`}
              aria-label="Message"
              disabled={sending}
            />
            <Button type="submit" variant="primary" disabled={sending || !input.trim()}>
              <Icon name="send" size={14} /> Send
            </Button>
          </form>
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
function SearchModal({
  governorates,
  crops,
  onClose,
  onPick,
}: {
  governorates: string[];
  crops: string[];
  onClose: () => void;
  onPick: (page: PageKey, value?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const pages = NAV.map((item) => item.key);
  const results: { label: string; hint: string; run: () => void }[] = [
    ...pages.map((page) => ({
      label: page,
      hint: "Page",
      run: () => onPick(page),
    })),
    ...governorates.map((name) => ({
      label: name,
      hint: "Governorate",
      run: () => onPick("Regions", name),
    })),
    ...crops.map((name) => ({
      label: name,
      hint: "Crop",
      run: () => onPick("Crops", name),
    })),
  ].filter((item) => !needle || item.label.toLowerCase().includes(needle));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="search-modal" onClick={(event) => event.stopPropagation()}>
        <div className="search-modal-header">
          <Icon name="search" size={16} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages, governorates, crops…"
            aria-label="Search"
          />
          <Button variant="ghost" onClick={onClose}>
            <Icon name="x" size={15} />
          </Button>
        </div>
        <div className="search-modal-results">
          {results.slice(0, 40).map((item) => (
            <div
              key={`${item.hint}-${item.label}`}
              className="search-modal-item"
              onClick={() => {
                item.run();
                onClose();
              }}
            >
              <span>{item.label}</span>
              <small className="muted">{item.hint}</small>
            </div>
          ))}
          {!results.length ? <div className="search-modal-item muted">No matches</div> : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------
export default function App() {
  const [page, setPageState] = useState<PageKey>(() => {
    if (typeof window === "undefined") return "Overview";
    const requested = new URLSearchParams(window.location.search).get("page");
    return NAV.find((item) => item.key === requested)?.key ?? "Overview";
  });
  const [dark, setDark] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>("Insurer / Analyst");
  const [period, setPeriod] = useState("current");
  const [region, setRegion] = useState("Kairouan");
  const [crop, setCrop] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const health = useHealth();
  const reference = useReference();
  const governorates = reference.data?.governorates ?? [];
  const crops = reference.data?.crops ?? [];

  // Navigation is state-based, but the current page is mirrored into the query
  // string so any view can be linked to and reloaded.
  const setPage = useCallback((next: PageKey) => {
    setPageState(next);
    const url = new URL(window.location.href);
    if (next === "Overview") url.searchParams.delete("page");
    else url.searchParams.set("page", next);
    window.history.replaceState(null, "", url);
  }, []);

  const periodKeys = useMemo(() => {
    const keys = Object.keys(reference.data?.periods ?? {});
    return ["current", ...keys.filter((key) => key !== "current")];
  }, [reference.data]);
  const periodLabel = reference.data?.periods?.[period] ?? period;
  // Raw period keys such as "last_year" are for the API; the switcher shows the
  // human window labels the backend supplies.
  const periodLabels = useMemo(() => {
    const labels: Record<string, string> = { current: "Current" };
    for (const [key, label] of Object.entries(reference.data?.periods ?? {})) {
      if (key !== "current") labels[key] = String(label).replace(/\s*\(.*\)\s*$/, "");
    }
    return labels;
  }, [reference.data]);

  useEffect(() => {
    if (!governorates.length) return;
    if (!governorates.includes(region)) setRegion(governorates.includes("Kairouan") ? "Kairouan" : governorates[0]);
  }, [governorates, region]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const goTo = (next: PageKey, value?: string) => {
    if (value) {
      if (next === "Crops" || next === "Assistant") setCrop(value);
      else setRegion(value);
    }
    setPage(next);
  };

  const shared = { period, region, setRegion, governorates, crops };

  return (
    <div className={dark ? "app dark" : "app"}>
      <aside className="sidebar">
        <div className="wordmark">
          <span />
          AgriRisk
        </div>
        <nav>
          {NAV.map((item) => (
            <div
              key={item.key}
              className={`nav-item${page === item.key ? " active" : ""}`}
              onClick={() => setPage(item.key)}
              role="button"
              tabIndex={0}
              aria-current={page === item.key}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") setPage(item.key);
              }}
            >
              <Icon name={item.icon} />
              <span>{item.key}</span>
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span>Data sources</span>
          <strong>
            <i style={{ background: health.data?.status === "ok" ? "var(--low)" : "var(--danger)" }} />
            {health.data?.status === "ok" ? "API online" : "API offline"}
          </strong>
          <small>{health.data?.climate_source ?? "Open-Meteo"}</small>
          <small>{health.data?.dam_source ?? "AgriRisk dams"}</small>
          {health.data ? <small>AgriRisk v{health.data.version}</small> : null}
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div className="market">
            <span>Period</span>
            <Segmented
              ariaLabel="Analysis period"
              options={periodKeys.length ? periodKeys : ["current"]}
              value={periodKeys.includes(period) ? period : "current"}
              onChange={setPeriod}
              labels={periodLabels}
            />
          </div>

          <div className="top-actions">
            <Segmented
              ariaLabel="User profile"
              options={["Insurer / Analyst", "Farmer / Specialist"] as const}
              value={userRole}
              onChange={setUserRole}
            />
            <button
              type="button"
              className="action icon-action"
              onClick={() => setSearchOpen(true)}
              title="Search (Ctrl+K)"
              aria-label="Search"
            >
              <Icon name="search" size={14} />
            </button>
            <button
              type="button"
              className="action icon-action"
              onClick={() => setDark((value) => !value)}
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              <Icon name={dark ? "sun" : "moon"} size={14} />
            </button>
            <div className="profile" title={userRole}>
              {userRole === "Insurer / Analyst" ? "IA" : "FS"}
            </div>
          </div>
        </header>

        <div className="content">
          {page === "Overview" ? (
            <OverviewPage {...shared} periodLabel={periodLabel} userRole={userRole} setPage={setPage} />
          ) : null}
          {page === "Regions" ? <RegionsPage {...shared} userRole={userRole} /> : null}
          {page === "Water" ? <WaterPage /> : null}
          {page === "Climate" ? <ClimatePage period={period} /> : null}
          {page === "Crops" ? <CropsPage region={region} setRegion={setRegion} governorates={governorates} /> : null}
          {page === "Scenarios" ? <ScenariosPage {...shared} /> : null}
          {page === "Reports" ? <ReportsPage {...shared} userRole={userRole} /> : null}
          {page === "Assistant" ? (
            <AssistantPage
              region={region}
              setRegion={setRegion}
              governorates={governorates}
              crops={crops}
              crop={crop}
              setCrop={setCrop}
            />
          ) : null}
        </div>
      </main>

      {searchOpen ? (
        <SearchModal governorates={governorates} crops={crops} onClose={() => setSearchOpen(false)} onPick={goTo} />
      ) : null}
    </div>
  );
}
