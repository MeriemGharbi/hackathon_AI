import { useEffect, useMemo, useState, useRef } from "react";
import {
  getDamStatusForGovernorate,
  LATEST_DAM_STATS,
  TUNISIA_DAMS,
} from "./data/damData";
import {
  CROP_PROFILES,
  calculateCropExposure,
  getCropList,
  type CropProfile,
} from "./data/cropData";
import {
  fetchOpenMeteoStats,
  generateAiRiskReport,
  runTabpfnInference,
  sendAiAssistantChatMessage,
  TUNISIA_REGIONS,
  type RiskAnalysisResult,
  type UserRole,
  type WeatherStats,
  type ChatMessage,
} from "./services/droughtEngine";

type IconName =
  | "overview" | "map" | "regions" | "water" | "climate" | "scenarios"
  | "reports" | "search" | "calendar" | "sun" | "moon" | "arrow"
  | "download" | "chevron" | "sparkles" | "x" | "user" | "sprout" | "bot" | "crops" | "send";

const iconPaths: Record<IconName, React.ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  map: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3V6Z"/><path d="M8 3v15M16 6v15"/></>,
  regions: <><path d="M4 20h16M6 20V8h4v12M14 20V4h4v16"/><path d="M7.5 11h1M15.5 7h1M15.5 11h1M15.5 15h1"/></>,
  water: <path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/>,
  climate: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  scenarios: <><path d="M4 6h7M15 6h5M4 12h3M11 12h9M4 18h9M17 18h3"/><circle cx="13" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="18" r="2"/></>,
  reports: <><path d="M6 2h9l4 4v16H6V2Z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M19.1 19.1l-1.4-1.4M4.9 19.1l1.4-1.4M19.1 4.9l-1.4 1.4"/></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  sparkles: <path d="m12 3 1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3Z"/>,
  x: <path d="M18 6 6 18M6 6l12 12"/>,
  user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  sprout: <path d="M7 20h10M12 20v-8M12 12A6 6 0 0 1 6 6c0 4 3 6 6 6Zm0 0a6 6 0 0 0 6-6c0 4-3 6-6 6Z"/>,
  bot: <><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4M8 15h.01M16 15h.01"/></>,
  crops: <path d="M7 20h10M12 20v-8M12 12A6 6 0 0 1 6 6c0 4 3 6 6 6Zm0 0a6 6 0 0 0 6-6c0 4-3 6-6 6Z"/>,
  send: <path d="m22 2-7 20-4-9-9-4Zm0 0L11 13"/>,
};

function Icon({ name, size = 17 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  );
}

function Action({
  children,
  className = "",
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`action ${className}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
      {children}
    </div>
  );
}

const nav = [
  ["Overview", "overview"],
  ["AI Assistant", "bot"],
  ["Crops", "crops"],
  ["Regions", "regions"],
  ["Water", "water"],
  ["Climate", "climate"],
  ["Scenarios", "scenarios"],
  ["Reports", "reports"],
] as const;

function FormattedText({ text, style }: { text: string; style?: React.CSSProperties }) {
  if (!text) return null;

  const lines = text.split("\n");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      {lines.map((line, lineIdx) => {
        if (!line.trim()) return <div key={lineIdx} style={{ height: 4 }} />;

        const isBullet = /^\s*[-*•]\s+/.test(line);
        const cleanLine = isBullet ? line.replace(/^\s*[-*•]\s+/, "") : line;

        const parts = cleanLine.split(/(\*\*.*?\*\*|\*.*?\*)/g);

        const renderedParts = parts.map((part, partIdx) => {
          if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
            return <strong key={partIdx} style={{ fontWeight: 650 }}>{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
            return <em key={partIdx}>{part.slice(1, -1)}</em>;
          }
          return part;
        });

        if (isBullet) {
          return (
            <div key={lineIdx} style={{ display: "flex", gap: 6, paddingLeft: 8 }}>
              <span style={{ color: "var(--accent)" }}>•</span>
              <div>{renderedParts}</div>
            </div>
          );
        }

        return <div key={lineIdx}>{renderedParts}</div>;
      })}
    </div>
  );
}

function RiskPill({ children }: { children: React.ReactNode }) {
  const text = String(children).toLowerCase();
  const tone = text.includes("high") || text.includes("severe") || text.includes("critical") ? "high" : text.includes("mod") || text.includes("watch") ? "medium" : "low";
  return <span className={`risk-pill ${tone}`}><i></i>{children}</span>;
}

/**
 * Realistic Tunisia Map Component (viewBox 0 0 100 130)
 */
/**
 * Full 22-Governorate Interactive Tunisia Map Component (viewBox 0 0 100 130)
 */
function TunisiaMap({
  selected,
  setSelected,
}: {
  selected: string;
  setSelected: (region: string) => void;
}) {
  const governorateList = useMemo(() => Object.values(TUNISIA_REGIONS), []);

  return (
    <div className="map-stage" style={{ height: 440, position: "relative" }}>
      <svg className="tunisia" viewBox="0 0 100 130" aria-label="Governorate risk map of Tunisia">
        <path
          className="country"
          d="M 32 8 C 40 4, 50 3, 54 4 C 58 4, 66 10, 74 18 C 76 22, 70 27, 65 30 C 66 36, 70 42, 68 50 C 65 56, 68 64, 64 72 C 58 76, 54 80, 56 86 C 62 88, 66 94, 62 100 C 58 110, 50 125, 46 126 C 40 120, 32 105, 30 92 C 25 80, 24 64, 25 48 C 26 32, 28 20, 32 8 Z"
        />
        <g className="boundaries">
          <path d="M 32 18 L 68 20 M 28 32 L 64 34 M 26 48 L 66 50 M 26 64 L 64 68 M 30 80 L 58 84 M 32 96 L 60 98" />
          <path d="M 46 6 L 44 48 M 56 12 L 52 72 M 36 48 L 34 92" />
        </g>
        {governorateList.map((gov) => {
          const isSelected = selected === gov.name;
          const damInfo = getDamStatusForGovernorate(gov.name);
          const riskLevel = damInfo.per_dam_fill_pct < 30 ? "high" : damInfo.per_dam_fill_pct < 45 ? "medium" : "low";

          return (
            <g
              key={gov.name}
              className={`map-point ${riskLevel} ${isSelected ? "selected" : ""}`}
              onClick={() => setSelected(gov.name)}
              role="button"
              tabIndex={0}
            >
              <title>{`${gov.name} Governorate\nMain Dam: ${damInfo.worst_dam_name} (${damInfo.per_dam_fill_pct}% fill)\nRegion: ${gov.regionGroup}`}</title>
              <circle cx={gov.x} cy={gov.y} r={isSelected ? 3.0 : 2.0} />
              {isSelected && <circle className="selection-ring" cx={gov.x} cy={gov.y} r="5.2" />}
              <text
                x={gov.x + 3.2}
                y={gov.y + 0.9}
                fontSize="2.4"
                fontWeight={isSelected ? "bold" : "normal"}
                fill={isSelected ? "var(--accent)" : "var(--foreground)"}
                style={{ pointerEvents: "none", opacity: isSelected ? 1 : 0.75 }}
              >
                {gov.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="map-legend">
        <div style={{ fontWeight: 600, marginBottom: 2, color: "var(--navy)" }}>Dam Fill &amp; Risk</div>
        <div className="map-legend-item">
          <span className="map-legend-dot high" /> <span>High Risk (&lt;30% fill)</span>
        </div>
        <div className="map-legend-item">
          <span className="map-legend-dot medium" /> <span>Moderate Risk (30–45%)</span>
        </div>
        <div className="map-legend-item">
          <span className="map-legend-dot low" /> <span>Low Risk (&gt;45% fill)</span>
        </div>
      </div>
    </div>
  );
}

function LineChart({ type = "water" }: { type?: "water" | "rain" }) {
  const water = "M4 48 C38 45 62 42 91 48 S145 55 174 61 S227 68 254 77 S306 85 356 91";
  const rain = "M4 72 C31 63 59 77 88 57 S140 71 174 55 S222 73 253 82 S304 63 356 86";
  const average = "M4 55 C55 53 112 57 174 59 S292 61 356 60";
  return (
    <svg className={`line-chart ${type}`} viewBox="0 0 360 110" preserveAspectRatio="none">
      <g className="gridlines"><path d="M0 20H360M0 55H360M0 90H360"/></g>
      <path className="benchmark" d={average} fill="none" strokeDasharray="4 4"/>
      <path className="primary-line" d={type === "water" ? water : rain} fill="none"/>
      <circle cx="356" cy={type === "water" ? 91 : 86} r="3"/>
    </svg>
  );
}

function MiniTrend({ values }: { values: number[] }) {
  const points = values.map((value, index) => `${index * 7},${38 - value * 0.55}`).join(" ");
  return (
    <svg viewBox="0 0 77 28" className="mini-trend">
      <polyline points={points} fill="none" />
    </svg>
  );
}

function Indicators() {
  const values = [
    ["Water Availability", `${LATEST_DAM_STATS.nationalStockMm3}`, "Mm³", "−14.8% YoY"],
    ["Average Dam Fill", `${LATEST_DAM_STATS.meanFillPct}`, "%", "−6.2 pts"],
    ["Rainfall Anomaly", "−21.3", "%", "vs 30-yr norm"],
    ["Seasonal Inflow", `${LATEST_DAM_STATS.currentSeasonInflowMm3}`, "Mm³", "−28.5% YoY"],
    ["Overall Risk", "73", "/100", "HIGH"],
  ];
  return (
    <section className="indicator-strip">
      {values.map(([label, value, unit, context], index) => (
        <div className={`indicator ${index === 4 ? "risk" : ""}`} key={label}>
          <span>{label}</span>
          <div>
            <strong>{value}</strong>
            <small>{unit}</small>
          </div>
          <p>{context}</p>
        </div>
      ))}
    </section>
  );
}

function RoleSwitcher({ userRole, setUserRole }: { userRole: UserRole; setUserRole: (r: UserRole) => void }) {
  return (
    <div className="role-switcher">
      <button
        className={`role-btn ${userRole === "Insurer / Analyst" ? "active" : ""}`}
        onClick={() => setUserRole("Insurer / Analyst")}
      >
        Insurer / Analyst
      </button>
      <button
        className={`role-btn ${userRole === "Farmer / Specialist" ? "active" : ""}`}
        onClick={() => setUserRole("Farmer / Specialist")}
      >
        Farmer / Specialist
      </button>
    </div>
  );
}

function Overview({
  userRole,
  setUserRole,
  selectedRegion,
  setSelectedRegion,
  onNavigateToRegions,
  onNavigateToAssistant,
}: {
  userRole: UserRole;
  setUserRole: (r: UserRole) => void;
  selectedRegion: string;
  setSelectedRegion: (r: string) => void;
  onNavigateToRegions: () => void;
  onNavigateToAssistant: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [selectedCrop, setSelectedCrop] = useState<string>("All Crops");
  const [reportData, setReportData] = useState<{ title: string; report: string } | null>(null);
  const [analysisResult, setAnalysisResult] = useState<RiskAnalysisResult | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);
  const [techJson, setTechJson] = useState<any>(null);

  const damInfo = useMemo(() => getDamStatusForGovernorate(selectedRegion), [selectedRegion]);
  const cropList = useMemo(() => ["All Crops", ...getCropList()], []);

  const activeCropProfile = useMemo(() => {
    return selectedCrop !== "All Crops" ? CROP_PROFILES[selectedCrop] : null;
  }, [selectedCrop]);

  const watchlist = [
    ["Kairouan", "High", "Severe", "−34.2%", "Rising"],
    ["Sidi Bouzid", "High", "Severe", "−29.8%", "Rising"],
    ["Sfax", "High", "Elevated", "−26.1%", "Stable"],
    ["Jendouba", "Low", "Moderate", "−5.8%", "Improving"],
  ];

  const handleRunAnalysis = async () => {
    setLoading(true);
    setReportData(null);

    const weather = await fetchOpenMeteoStats(selectedRegion);
    const dam = getDamStatusForGovernorate(selectedRegion);
    const analysisRes = runTabpfnInference({
      total_precipitation_mm: weather.total_precipitation_mm,
      mean_soil_moisture: weather.mean_soil_moisture,
      mean_temperature_c: weather.mean_temperature_c,
      dam_fill_pct: dam.per_dam_fill_pct,
    });

    setAnalysisResult(analysisRes);

    const res = await generateAiRiskReport(selectedRegion, userRole, weather, dam, analysisRes, selectedCrop);

    const cropExp = selectedCrop !== "All Crops"
      ? calculateCropExposure(selectedCrop, weather.total_precipitation_mm, weather.mean_soil_moisture, dam.per_dam_fill_pct)
      : null;

    setTechJson({
      user_profile: userRole,
      target_crop: selectedCrop !== "All Crops" ? selectedCrop : "General Agriculture",
      weather_data: weather,
      reservoir_status: { name: dam.worst_dam_name, fill_pct: dam.per_dam_fill_pct },
      risk_assessment: analysisRes,
      crop_exposure: cropExp,
    });

    setReportData(res);
    setLoading(false);
  };

  const downloadBrief = () => {
    const text = `TUNISIA AGRICULTURAL RISK BRIEF (${selectedRegion})
Date: ${new Date().toLocaleDateString()}
Profile: ${userRole}
Crop Focus: ${selectedCrop}
Reference Reservoir: ${damInfo.worst_dam_name} (${damInfo.per_dam_fill_pct}% fill)
National Stock: ${LATEST_DAM_STATS.nationalStockMm3} Mm³
Mean Fill Rate: ${LATEST_DAM_STATS.meanFillPct}%

${reportData ? reportData.title + "\n\n" + reportData.report : "Run risk assessment to generate complete report."}`;

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Risk_Analysis_${selectedRegion}_${selectedCrop.replace(/\s+/g, "_")}_${userRole.includes("Insurer") ? "Insurer" : "Farmer"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="page-intro">
        <div>
          <div className="section-label">NATIONAL OVERVIEW · Q4 2024</div>
          <div className="page-title">Tunisia Agricultural Risk</div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <RoleSwitcher userRole={userRole} setUserRole={setUserRole} />
          <Action onClick={onNavigateToAssistant} style={{ background: "var(--accent)", color: "#ffffff", border: "none" }}>
            <Icon name="bot" size={15} /> AI Analyst
          </Action>
          <Action onClick={downloadBrief}>
            <Icon name="download" size={15} /> Export brief
          </Action>
        </div>
      </div>

      <div className="executive-summary">
        <span>Executive view</span>
        <p>
          Water availability remains materially below seasonal norms. Exposure is concentrated across central governorates, 
          while northern reservoir conditions provide limited near-term resilience.
        </p>
        <small>Updated 06 Jan 2025 · 08:40</small>
      </div>

      <Indicators />

      {/* AI Risk Assessment Generator & Crop Choice Section */}
      <section style={{ marginBottom: 36 }}>
        <div style={{ border: "1px solid var(--border-strong)", borderRadius: "var(--radius)", padding: 22, background: "var(--surface-raised)", boxShadow: "0 10px 28px var(--shadow)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div className="section-label">Climate Risk Assessment Tools ({selectedRegion})</div>
              <div style={{ fontSize: 18, fontWeight: 650, color: "var(--navy)" }}>
                Risk Assessment Assistant · {userRole}
              </div>
              <p style={{ color: "var(--secondary)", margin: "4px 0 0", fontSize: 12 }}>
                Agro-meteorological risk evaluation and crop exposure analysis for <strong>{selectedRegion}</strong>.
              </p>
            </div>
            <button
              className="role-btn active"
              onClick={handleRunAnalysis}
              disabled={loading}
              style={{ padding: "10px 20px", fontSize: 12 }}
            >
              {loading ? <span className="spinner" /> : <Icon name="sparkles" size={16} />}
              {loading ? "Retrieving data..." : `Run Risk Assessment (${selectedRegion})`}
            </button>
          </div>

          {/* Crop Selection Bar */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Target Crop Profile:
            </span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {cropList.map((crop) => (
                <button
                  key={crop}
                  onClick={() => setSelectedCrop(crop)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 4,
                    border: `1px solid ${selectedCrop === crop ? "var(--accent)" : "var(--border)"}`,
                    background: selectedCrop === crop ? "var(--accent-light)" : "var(--background)",
                    color: selectedCrop === crop ? "var(--accent)" : "var(--foreground)",
                    fontSize: 11,
                    fontWeight: selectedCrop === crop ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {crop}
                </button>
              ))}
            </div>
          </div>

          {/* Active Crop Profile Metadata Card */}
          {activeCropProfile && (
            <div style={{ marginTop: 14, padding: "12px 16px", background: "var(--background)", borderRadius: 6, border: "1px dashed var(--border)", fontSize: 11, display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center" }}>
              <div>
                <span style={{ color: "var(--muted)" }}>Annual Water Demand:</span>{" "}
                <strong>{activeCropProfile.water_need_mm} mm/season</strong>
              </div>
              <div>
                <span style={{ color: "var(--muted)" }}>Drought Sensitivity:</span>{" "}
                <strong>{activeCropProfile.drought_sensitivity} / 5</strong>
              </div>
              <div>
                <span style={{ color: "var(--muted)" }}>Peak Demand Window:</span>{" "}
                <strong>{activeCropProfile.peak_water_demand}</strong>
              </div>
              <div>
                <span style={{ color: "var(--muted)" }}>Production System:</span>{" "}
                <strong>{activeCropProfile.production_system}</strong>
              </div>
            </div>
          )}

          {reportData && analysisResult && (
            <div className="ai-report-container" style={{ marginTop: 20 }}>
              <div className="ai-report-header">
                <h3>{reportData.title}</h3>
                <RiskPill>{analysisResult.risk}</RiskPill>
              </div>
              <div className="ai-report-content"><FormattedText text={reportData.report} /></div>
              <div className="ai-metrics-row">
                <div className="ai-metric-card">
                  <span>Evaluated Risk Level</span>
                  <strong>{analysisResult.risk}</strong>
                </div>
                <div className="ai-metric-card">
                  <span>Confidence Index</span>
                  <strong>{analysisResult.confidence}%</strong>
                </div>
                {selectedCrop !== "All Crops" && (
                  <div className="ai-metric-card">
                    <span>Selected Crop</span>
                    <strong>{selectedCrop}</strong>
                  </div>
                )}
              </div>
              <div style={{ padding: "0 22px 18px" }}>
                <button
                  className="role-btn"
                  onClick={() => setShowTechnical(!showTechnical)}
                  style={{ fontSize: 11 }}
                >
                  {showTechnical ? "Hide" : "Show"} Technical Audit Log & Raw Data
                </button>
                {showTechnical && techJson && (
                  <pre
                    style={{
                      background: "var(--background)",
                      padding: 14,
                      borderRadius: 6,
                      marginTop: 10,
                      fontSize: 11,
                      overflowX: "auto",
                    }}
                  >
                    {JSON.stringify(techJson, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="overview-grid">
        <div className="map-panel">
          <div className="section-head">
            <div>
              <div className="section-title">Governorate risk</div>
              <p>Composite water and climate exposure across 22 governorates</p>
            </div>
            <div className="legend">
              <span><i className="low"></i>Low</span>
              <span><i className="medium"></i>Moderate</span>
              <span><i className="high"></i>High</span>
            </div>
          </div>
          <TunisiaMap selected={selectedRegion} setSelected={setSelectedRegion} />
          <div className="selected-region">
            <div>
              <span>Selected region</span>
              <strong>{selectedRegion}</strong>
            </div>
            <RiskPill>
              {damInfo.per_dam_fill_pct < 30 ? "High" : damInfo.per_dam_fill_pct < 45 ? "Moderate" : "Low"}
            </RiskPill>
            <div>
              <span>Risk probability</span>
              <strong>{damInfo.per_dam_fill_pct < 30 ? "73%" : "52%"}</strong>
            </div>
            <div>
              <span>Rainfall anomaly</span>
              <strong>−21.3%</strong>
            </div>
            <Action className="text-action" onClick={onNavigateToRegions}>
              Regional analysis <Icon name="arrow" size={14} />
            </Action>
          </div>
        </div>

        <div className="watchlist">
          <div className="section-head">
            <div>
              <div className="section-title">Regional watchlist</div>
              <p>Priority movements requiring review</p>
            </div>
            <Action className="text-action" onClick={onNavigateToRegions}>
              All regions <Icon name="arrow" size={14} />
            </Action>
          </div>
          <div className="data-table">
            <div className="data-row table-head">
              <span>Governorate</span>
              <span>Risk</span>
              <span>Water stress</span>
              <span>Rainfall</span>
              <span>Trend</span>
            </div>
            {watchlist.map((row) => (
              <div
                className="data-row"
                key={row[0]}
                onClick={() => setSelectedRegion(row[0])}
                style={{ cursor: "pointer" }}
              >
                <strong>{row[0]}</strong>
                <span><RiskPill>{row[1]}</RiskPill></span>
                <span>{row[2]}</span>
                <span className="mono">{row[3]}</span>
                <span className={`trend ${row[4].toLowerCase()}`}>{row[4]}</span>
              </div>
            ))}
          </div>
          <div className="watch-note">
            <span>Portfolio signal</span>
            <p>Central Tunisia accounts for 62% of high-risk regional exposure this quarter.</p>
          </div>
        </div>
      </section>

      <section className="chart-grid">
        <div className="chart-panel">
          <div className="section-head">
            <div>
              <div className="section-title">Water availability</div>
              <p>National stock against three-year average</p>
            </div>
            <div className="chart-stat">
              <strong>1,250 Mm³</strong>
              <span>−14.8%</span>
            </div>
          </div>
          <LineChart />
          <div className="axis">
            <span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span>
          </div>
          <div className="chart-legend">
            <span><i></i>Current stock</span>
            <span><i></i>3-year average</span>
          </div>
        </div>

        <div className="chart-panel">
          <div className="section-head">
            <div>
              <div className="section-title">Rainfall anomaly</div>
              <p>Monthly variance from 30-year normal</p>
            </div>
            <div className="chart-stat">
              <strong>−21.3%</strong>
              <span>Below norm</span>
            </div>
          </div>
          <LineChart type="rain" />
          <div className="axis">
            <span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span>
          </div>
          <div className="chart-legend">
            <span><i></i>Observed</span>
            <span><i></i>Historical norm</span>
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * Dedicated AI Risk Assistant Page
 */
function AssistantPage({
  userRole,
  setUserRole,
  selectedRegion,
  setSelectedRegion,
}: {
  userRole: UserRole;
  setUserRole: (r: UserRole) => void;
  selectedRegion: string;
  setSelectedRegion: (r: string) => void;
}) {
  const [selectedCrop, setSelectedCrop] = useState<string>("All Crops");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `Hello! I am your **AI Risk Analyst**. I provide decision-ready climate, reservoir, and crop exposure analysis across Tunisian governorates.\n\nHow can I assist your underwriting or agricultural planning today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const governorates = useMemo(() => Object.keys(TUNISIA_REGIONS), []);
  const cropList = useMemo(() => ["All Crops", ...getCropList()], []);

  const suggestedPrompts = [
    `Why is the climate risk high in ${selectedRegion}?`,
    `Which crops are most exposed to drought in ${selectedRegion}?`,
    `What are the dam water storage indicators for ${selectedRegion}?`,
    `What risk management actions apply to ${selectedRegion}?`,
  ];

  const handleSend = async (promptToSend?: string) => {
    const text = promptToSend || input;
    if (!text.trim() || sending) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!promptToSend) setInput("");
    setSending(true);

    const historyForLlm = messages.map((m) => ({ role: m.role, content: m.content }));
    const botReply = await sendAiAssistantChatMessage(historyForLlm, text, selectedRegion, selectedCrop, userRole);

    setMessages((prev) => [...prev, botReply]);
    setSending(false);
  };

  return (
    <>
      <div className="page-intro">
        <div>
          <div className="section-label">AI DECISION SUPPORT SYSTEM</div>
          <div className="page-title">AI Risk Analyst</div>
          <p>Interactive tool-grounded analyst for climate risk, dam reserves, and crop exposure.</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <RoleSwitcher userRole={userRole} setUserRole={setUserRole} />
        </div>
      </div>

      {/* Context Control Bar */}
      <div style={{ marginBottom: 20, padding: "12px 18px", background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius)", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--muted)", fontWeight: 600 }}>GOVERNORATE:</span>
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            style={{ border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", padding: "4px 10px", borderRadius: 4, outline: "none" }}
          >
            {governorates.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "var(--muted)", fontWeight: 600 }}>CROP FOCUS:</span>
          <select
            value={selectedCrop}
            onChange={(e) => setSelectedCrop(e.target.value)}
            style={{ border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", padding: "4px 10px", borderRadius: 4, outline: "none" }}
          >
            {cropList.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--muted)", fontSize: 11 }}>Active Context:</span>
          <RiskPill>High</RiskPill>
        </div>
      </div>

      {/* Suggested Prompts Strip */}
      <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {suggestedPrompts.map((p) => (
          <button
            key={p}
            onClick={() => handleSend(p)}
            style={{
              padding: "6px 12px",
              borderRadius: 20,
              border: "1px solid var(--border)",
              background: "var(--surface-raised)",
              color: "var(--secondary)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chat Messages Window */}
      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--surface-raised)", padding: 20, minHeight: 380, maxHeight: 520, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, marginBottom: 16 }}>
        {messages.map((m, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "80%",
              background: m.role === "user" ? "var(--navy)" : "var(--background)",
              color: m.role === "user" ? "#ffffff" : "var(--foreground)",
              padding: "12px 16px",
              borderRadius: 10,
              border: m.role === "assistant" ? "1px solid var(--border)" : "none",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 4, display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>{m.role === "user" ? "You" : "AgriRisk AI Analyst"}</span>
              <span>{m.timestamp}</span>
            </div>
            <FormattedText text={m.content} />
            {m.toolsUsed && m.toolsUsed.length > 0 && (
              <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid var(--border)", fontSize: 10, color: "var(--muted)", display: "flex", gap: 6, alignItems: "center" }}>
                <Icon name="sparkles" size={12} />
                <span>Tools queried: {m.toolsUsed.join(", ")}</span>
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div style={{ alignSelf: "flex-start", background: "var(--background)", padding: "10px 16px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 12, color: "var(--secondary)", display: "flex", alignItems: "center", gap: 8 }}>
            <span className="spinner" /> Analyzing measured climate & reservoir data...
          </div>
        )}
      </div>

      {/* Chat Input Bar */}
      <div style={{ display: "flex", gap: 10 }}>
        <input
          type="text"
          placeholder={`Ask the AI Risk Analyst about ${selectedRegion} climate, dams, or crops...`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          style={{ flex: 1, padding: "12px 16px", borderRadius: "var(--radius)", border: "1px solid var(--border-strong)", background: "var(--surface-raised)", color: "var(--foreground)", outline: "none", fontSize: 13 }}
        />
        <button
          className="role-btn active"
          onClick={() => handleSend()}
          disabled={sending || !input.trim()}
          style={{ padding: "0 22px", display: "flex", alignItems: "center", gap: 8 }}
        >
          <Icon name="send" size={15} /> Send
        </button>
      </div>
    </>
  );
}

/**
 * Dedicated Crop Vulnerability & Exposure Explorer Page
 */
function CropsPage({ selectedRegion, setSelectedRegion }: { selectedRegion: string; setSelectedRegion: (r: string) => void }) {
  const [filterLevel, setFilterLevel] = useState<string>("All");

  const weather = useMemo(() => {
    return { total_precipitation_mm: 195.0, mean_soil_moisture: 0.115 };
  }, [selectedRegion]);

  const damInfo = useMemo(() => getDamStatusForGovernorate(selectedRegion), [selectedRegion]);
  const crops = useMemo(() => getCropList(), []);
  const governorates = useMemo(() => Object.keys(TUNISIA_REGIONS), []);

  const cropExposures = useMemo(() => {
    return crops.map((cropName) => {
      const profile = CROP_PROFILES[cropName];
      const exp = calculateCropExposure(cropName, weather.total_precipitation_mm, weather.mean_soil_moisture, damInfo.per_dam_fill_pct);
      return {
        profile,
        exp,
      };
    });
  }, [crops, selectedRegion, weather, damInfo]);

  const filtered = useMemo(() => {
    if (filterLevel === "All") return cropExposures;
    return cropExposures.filter((item) => item.exp?.exposureLevel === filterLevel);
  }, [cropExposures, filterLevel]);

  return (
    <>
      <div className="page-intro">
        <div>
          <div className="section-label">CROP SENSITIVITY & REGIONAL EXPOSURE</div>
          <div className="page-title">Crop Vulnerability Explorer</div>
          <p>Regional climate and reservoir conditions evaluated against crop-specific water requirements.</p>
        </div>
      </div>

      {/* Control Strip */}
      <div style={{ marginBottom: 24, padding: "14px 18px", background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Select Governorate:</span>
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            style={{ border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", padding: "6px 12px", borderRadius: 4, outline: "none", fontSize: 12, fontWeight: 600 }}
          >
            {governorates.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>Filter Exposure:</span>
          {["All", "Critical", "High", "Moderate", "Low"].map((level) => (
            <button
              key={level}
              onClick={() => setFilterLevel(level)}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: `1px solid ${filterLevel === level ? "var(--accent)" : "var(--border)"}`,
                background: filterLevel === level ? "var(--accent-light)" : "var(--background)",
                color: filterLevel === level ? "var(--accent)" : "var(--foreground)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {/* Crop Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 18 }}>
        {filtered.map(({ profile, exp }) => (
          <div
            key={profile.name}
            style={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: 18,
              boxShadow: "0 4px 12px var(--shadow)",
              display: "flex",
              flexDirection: "column",
              justify: "space-between",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name="sprout" size={20} />
                  <strong style={{ fontSize: 16, color: "var(--navy)" }}>{profile.name}</strong>
                </div>
                {exp && <RiskPill>{exp.exposureLevel}</RiskPill>}
              </div>
              <p style={{ fontSize: 12, color: "var(--secondary)", margin: "0 0 14px", lineHeight: 1.5 }}>
                {profile.profile_note}
              </p>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, fontSize: 11, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Water Requirement:</span>
                <strong>{profile.water_need_mm} mm / season</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Drought Sensitivity:</span>
                <strong>{profile.drought_sensitivity} / 5</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Peak Demand Stage:</span>
                <strong style={{ textAlign: "right" }}>{profile.peak_water_demand}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Production System:</span>
                <strong>{profile.production_system}</strong>
              </div>
              {exp && (
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px dashed var(--border)", display: "flex", justifyContent: "space-between", color: "var(--navy)", fontWeight: 600 }}>
                  <span>Regional Exposure Score:</span>
                  <span>{exp.exposureScore} / 100</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function RegionPage({ selectedRegion, userRole }: { selectedRegion: string; userRole: UserRole }) {
  const damInfo = getDamStatusForGovernorate(selectedRegion);

  return (
    <>
      <div className="region-hero">
        <div className="section-label">REGIONAL ANALYSIS · CENTRAL TUNISIA</div>
        <div className="region-title-line">
          <div className="page-title">{selectedRegion}</div>
          <RiskPill>{damInfo.per_dam_fill_pct < 30 ? "High" : damInfo.per_dam_fill_pct < 45 ? "Moderate" : "Low"}</RiskPill>
        </div>
        <p>
          Water stress and persistent rainfall deficits are reinforcing a high-risk outlook. Confidence is strongest in reservoir and precipitation signals.
        </p>
      </div>

      <div className="comparison-bar">
        <span>Composite risk</span>
        <strong>78 / 100</strong>
        <div><i style={{ width: "78%" }}></i></div>
        <small>National average 73</small>
      </div>

      <section className="analysis-sections">
        {[
          [
            "Climate",
            [
              ["Rainfall", "−34.2%", "vs normal"],
              ["Soil moisture", "22nd", "percentile"],
              ["Reference ET₀", "+11.8%", "vs average"],
            ],
          ],
          [
            "Water Resources",
            [
              ["Dam fill", `${damInfo.per_dam_fill_pct}%`, damInfo.worst_dam_name],
              ["Regional stock", "19 Mm³", "−41% YoY"],
              ["Seasonal inflow", "8.4 Mm³", "12-month"],
            ],
          ],
          [
            "Risk Drivers",
            [
              ["Rainfall deficit", "High", "34% weight"],
              ["Reservoir stress", "High", "31% weight"],
              ["Inflow trend", "Elevated", "21% weight"],
            ],
          ],
        ].map(([title, items]) => (
          <div className="analysis-block" key={title as string}>
            <div className="section-title">{title as string}</div>
            {(items as string[][]).map(([label, value, note]) => (
              <div className="comparison-row" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{note}</small>
                <div>
                  <i style={{ width: value.includes("High") || value.includes("34%") ? "82%" : "58%" }}></i>
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>
    </>
  );
}

function WaterPage() {
  const [search, setSearch] = useState("");

  const filteredDams = useMemo(() => {
    return TUNISIA_DAMS.filter(
      (d) =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        d.governorate.toLowerCase().includes(search.toLowerCase()) ||
        d.region.toLowerCase().includes(search.toLowerCase())
    );
  }, [search]);

  const exportCsv = () => {
    const header = "Dam_Name,Governorate,Region,Capacity_Mm3,Current_Volume_Mm3,Fill_Rate_Pct\n";
    const rows = TUNISIA_DAMS.map(
      (d) => `${d.name},${d.governorate},${d.region},${d.capacity_mm3},${d.current_volume_mm3},${d.fill_rate_pct}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Tunisia_Dams_Data.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="page-intro">
        <div>
          <div className="section-label">NATIONAL INFRASTRUCTURE</div>
          <div className="page-title">Water Resources</div>
          <p>Reservoir position, inflows and operating trends across Tunisia.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Action onClick={exportCsv}>
            <Icon name="download" size={15} /> Export data
          </Action>
        </div>
      </div>

      <section className="zone-strip">
        <div>
          <span>North</span>
          <strong>924 Mm³</strong>
          <small>42.1% fill</small>
        </div>
        <div>
          <span>Centre</span>
          <strong>221 Mm³</strong>
          <small>31.7% fill</small>
        </div>
        <div>
          <span>Cap Bon</span>
          <strong>105 Mm³</strong>
          <small>28.9% fill</small>
        </div>
      </section>

      <div style={{ margin: "24px 0 12px", display: "flex", gap: 12, alignItems: "center" }}>
        <div className="search" style={{ width: 280 }}>
          <Icon name="search" size={16} />
          <input
            type="text"
            placeholder="Search dam or governorate..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ border: 0, background: "transparent", width: "100%", outline: "none", fontSize: 11 }}
          />
        </div>
        <small style={{ color: "var(--secondary)" }}>Showing {filteredDams.length} of {TUNISIA_DAMS.length} dams</small>
      </div>

      <section className="editorial-table">
        <div className="dam-row dam-head">
          <span>Dam / Governorate</span>
          <span>Capacity</span>
          <span>Current stock</span>
          <span>Fill</span>
          <span>Inflow</span>
          <span>12-month trend</span>
        </div>
        {filteredDams.map((dam) => (
          <div className="dam-row" key={dam.name}>
            <span>
              <strong>{dam.name}</strong>
              <small>{dam.governorate}</small>
            </span>
            <span>{dam.capacity_mm3} Mm³</span>
            <span>{dam.current_volume_mm3} Mm³</span>
            <span>
              <strong>{dam.fill_rate_pct}%</strong>
            </span>
            <span className="warning">−18%</span>
            <MiniTrend values={dam.history} />
          </div>
        ))}
      </section>
    </>
  );
}

function ScenariosPage() {
  const [rain, setRain] = useState(-20);
  const [inflow, setInflow] = useState(-25);
  const [stock, setStock] = useState(-15);

  const simulated = useMemo(() => {
    return Math.round(73 - rain * 0.28 - inflow * 0.14 - stock * 0.18);
  }, [rain, inflow, stock]);

  return (
    <>
      <div className="page-intro">
        <div>
          <div className="section-label">FORWARD RISK ASSESSMENT & STRESS TESTING</div>
          <div className="page-title">Scenario Analysis</div>
          <p>
            Simulate how hypothetical shifts in annual rainfall, dam inflows, and water reserves alter regional climate risk scores across Tunisia.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 24, padding: 16, background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 12, color: "var(--secondary)" }}>
        <strong style={{ color: "var(--navy)", display: "block", marginBottom: 4 }}>What is Scenario Analysis?</strong>
        This simulator runs a deterministic what-if assessment. Adjusting the parameters below recalculates composite national risk scores and allows underwriters and agronomists to stress-test financial portfolios and field plans against drought intensification or climate recovery.
      </div>

      <section className="scenario-layout">
        <div className="scenario-controls">
          {[
            ["Rainfall Anomaly", rain, setRain],
            ["Seasonal Inflow Change", inflow, setInflow],
            ["Water Reservoir Stock", stock, setStock],
          ].map(([label, value, setter]) => (
            <div className="control-row" key={label as string}>
              <div>
                <span>{label as string}</span>
                <strong>
                  {Number(value) > 0 ? "+" : ""}
                  {value as number}%
                </strong>
              </div>
              <input
                type="range"
                min="-50"
                max="20"
                value={value as number}
                onChange={(event) =>
                  (setter as React.Dispatch<React.SetStateAction<number>>)(Number(event.target.value))
                }
              />
              <small>
                <span>−50% (Severe Deficit)</span>
                <span>Baseline</span>
                <span>+20% (Recovery)</span>
              </small>
            </div>
          ))}
        </div>
        <div className="risk-comparison">
          <div className="comparison-cards-row">
            <div className="scenario-metric-box">
              <span className="box-label">Current Baseline Risk</span>
              <strong className="box-score">73</strong>
              <RiskPill>High</RiskPill>
            </div>
            <Icon name="arrow" size={22} />
            <div className="scenario-metric-box">
              <span className="box-label">Simulated Scenario Risk</span>
              <strong className="box-score">{simulated}</strong>
              <RiskPill>{simulated >= 70 ? "High" : simulated >= 45 ? "Moderate" : "Low"}</RiskPill>
            </div>
          </div>
          <p style={{ margin: 0, color: "var(--secondary)", fontSize: 12 }}>
            The selected scenario modifies composite risk by {simulated - 73 > 0 ? `+${simulated - 73}` : simulated - 73} points, shifting {simulated >= 70 ? "16 of 22" : simulated >= 50 ? "11 of 22" : "5 of 22"} governorates into high risk classification.
          </p>
        </div>
      </section>
    </>
  );
}

function ClimatePage() {
  const regions = useMemo(() => Object.keys(TUNISIA_REGIONS), []);

  return (
    <>
      <div className="page-intro">
        <div>
          <div className="section-label">AGRO-CLIMATIC MONITORING</div>
          <div className="page-title">Climate & Soil Moisture</div>
          <p>Observed temperature, cumulative precipitation, and topsoil moisture across Tunisian governorates.</p>
        </div>
      </div>
      <section className="report-list">
        <div className="report-row report-head">
          <span>Governorate</span>
          <span>Precipitation (mm)</span>
          <span>Soil Moisture (0-7cm)</span>
          <span>Temperature (°C)</span>
          <span>Risk Status</span>
        </div>
        {regions.map((name) => {
          const dam = getDamStatusForGovernorate(name);
          const riskText = dam.per_dam_fill_pct < 30 ? "High" : dam.per_dam_fill_pct < 45 ? "Moderate" : "Low";
          return (
            <div className="report-row" key={name}>
              <strong>{name}</strong>
              <span>110.5 mm</span>
              <span>0.085 m³/m³</span>
              <span>21.4 °C</span>
              <RiskPill>{riskText}</RiskPill>
            </div>
          );
        })}
      </section>
    </>
  );
}

function ReportsPage({ userRole }: { userRole: UserRole }) {
  const reports = [
    ["Quarterly National Water Risk Review", "06 Jan 2025", "Tunisia", "High"],
    ["Central Governorates Exposure Brief", "18 Dec 2024", "Central Tunisia", "High"],
    ["Northern Reservoir Resilience Note", "02 Dec 2024", "North", "Moderate"],
    ["Rainfall Anomaly Monthly Monitor", "30 Nov 2024", "Tunisia", "Moderate"],
  ];

  return (
    <>
      <div className="page-intro">
        <div>
          <div className="section-label">RESEARCH & DISTRIBUTION</div>
          <div className="page-title">Reports</div>
          <p>Decision-ready analysis for investment, underwriting and portfolio teams.</p>
        </div>
      </div>
      <section className="report-list">
        <div className="report-row report-head">
          <span>Report</span>
          <span>Date</span>
          <span>Coverage</span>
          <span>Risk level</span>
          <span>Actions</span>
        </div>
        {reports.map((report) => (
          <div className="report-row" key={report[0]}>
            <strong>{report[0]}</strong>
            <span>{report[1]}</span>
            <span>{report[2]}</span>
            <RiskPill>{report[3]}</RiskPill>
            <div>
              <Action className="text-action">View</Action>
              <Action className="text-action">PDF</Action>
              <Action className="text-action">CSV</Action>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function SearchModal({
  isOpen,
  onClose,
  onSelectRegion,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectRegion: (region: string) => void;
}) {
  const [query, setQuery] = useState("");

  if (!isOpen) return null;

  const results = Object.keys(TUNISIA_REGIONS).filter((r) =>
    r.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-modal-header">
          <Icon name="search" size={18} />
          <input
            type="text"
            placeholder="Search governorates or reservoirs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <Action className="icon-action" onClick={onClose}>
            <Icon name="x" size={16} />
          </Action>
        </div>
        <div className="search-modal-results">
          {results.map((gov) => (
            <div
              className="search-modal-item"
              key={gov}
              onClick={() => {
                onSelectRegion(gov);
                onClose();
              }}
            >
              <strong>{gov}</strong>
              <small style={{ color: "var(--muted)" }}>Governorate</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState("Overview");
  const [dark, setDark] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>("Insurer / Analyst");
  const [selectedRegion, setSelectedRegion] = useState("Kairouan");
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  let content: React.ReactNode;
  switch (active) {
    case "AI Assistant":
      content = (
        <AssistantPage
          userRole={userRole}
          setUserRole={setUserRole}
          selectedRegion={selectedRegion}
          setSelectedRegion={setSelectedRegion}
        />
      );
      break;
    case "Crops":
      content = (
        <CropsPage
          selectedRegion={selectedRegion}
          setSelectedRegion={setSelectedRegion}
        />
      );
      break;
    case "Regions":
      content = <RegionPage selectedRegion={selectedRegion} userRole={userRole} />;
      break;
    case "Water":
      content = <WaterPage />;
      break;
    case "Climate":
      content = <ClimatePage />;
      break;
    case "Scenarios":
      content = <ScenariosPage />;
      break;
    case "Reports":
      content = <ReportsPage userRole={userRole} />;
      break;
    default:
      content = (
        <Overview
          userRole={userRole}
          setUserRole={setUserRole}
          selectedRegion={selectedRegion}
          setSelectedRegion={setSelectedRegion}
          onNavigateToRegions={() => setActive("Regions")}
          onNavigateToAssistant={() => setActive("AI Assistant")}
        />
      );
  }

  return (
    <div className={`app ${dark ? "dark" : ""}`}>
      <aside className="sidebar">
        <div className="wordmark">
          <span></span>AgriRisk
        </div>
        <nav>
          {nav.map(([label, icon]) => (
            <div
              role="button"
              tabIndex={0}
              className={`nav-item ${active === label ? "active" : ""}`}
              key={label}
              onClick={() => setActive(label)}
            >
              <Icon name={icon} />
              <span>{label}</span>
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span>Data status</span>
          <strong>
            <i></i> All systems operational
          </strong>
          <small>Updated 8 min ago</small>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div className="market">
            <span>Market</span>
            <strong>Tunisia</strong>
            <Icon name="chevron" size={13} />
          </div>
          <div className="top-actions">
            <div
              className="search"
              onClick={() => setSearchOpen(true)}
              style={{ cursor: "pointer" }}
            >
              <Icon name="search" size={16} />
              <span>Search data and regions</span>
              <kbd>⌘ K</kbd>
            </div>
            <Action className="icon-action" onClick={() => setDark(!dark)}>
              <Icon name={dark ? "sun" : "moon"} />
            </Action>
            <div className="profile" title={`Role: ${userRole}`}>
              {userRole.includes("Insurer") ? "INS" : "FAR"}
            </div>
          </div>
        </header>

        <div className="content">{content}</div>
      </main>

      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectRegion={(region) => {
          setSelectedRegion(region);
          setActive("Overview");
        }}
      />
    </div>
  );
}
