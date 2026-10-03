import { useEffect, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { api, downloadText, type Assessment, type MapPoint, type Report, type ScenarioResult, type WaterRow } from "./api";

type Page = "Overview" | "Risk Map" | "Regions" | "Water" | "Climate" | "Scenarios" | "Reports" | "AI Assistant";

type ChatMessage = { role: "user" | "assistant"; content: string; tools?: string[] };

const navigation: Array<{ label: Page; icon: string }> = [
  { label: "Overview", icon: "▦" }, { label: "Risk Map", icon: "⌖" }, { label: "Regions", icon: "⌂" },
  { label: "Water", icon: "◒" }, { label: "Climate", icon: "☼" }, { label: "Scenarios", icon: "≋" },
  { label: "Reports", icon: "▤" }, { label: "AI Assistant", icon: "✦" },
];

const fallbackPoints: MapPoint[] = [
  ["Bizerte", 37.2744, 9.8739], ["Tunis", 36.8065, 10.1815], ["Béja", 36.7256, 9.1817],
  ["Kairouan", 35.6781, 10.0963], ["Sousse", 35.8256, 10.6369], ["Sfax", 34.7406, 10.7603],
  ["Gabès", 33.8815, 10.0982], ["Tozeur", 33.9197, 8.1335],
].map(([name, latitude, longitude]) => ({ name: name as string, latitude: latitude as number, longitude: longitude as number, risk_level: "HIGH", risk_label: "High drought risk" }));

function riskTone(level?: string | null) {
  return (level || "UNKNOWN").toLowerCase().replace("_", "-");
}

function RiskPill({ level = "Unknown" }: { level?: string | null }) {
  return <span className={`risk-pill ${riskTone(level)}`}><i />{level || "Unknown"}</span>;
}

function Button({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return <button type="button" className={`action ${className}`} {...props}>{children}</button>;
}

function Loading({ label = "Loading AgriRisk data..." }: { label?: string }) { return <div className="state-message">{label}</div>; }
function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="state-message error-state"><strong>Data unavailable</strong><span>{message}</span>{retry && <Button onClick={retry}>Retry</Button>}</div>;
}

function RiskMap({ points, selected, onSelect }: { points: MapPoint[]; selected: string; onSelect: (name: string) => void }) {
  const minLat = 33.4, maxLat = 37.4, minLon = 7.8, maxLon = 11.2;
  return <div className="live-map" aria-label="Live Tunisia governorate risk map">
    <div className="map-grid" />
    <div className="map-outline" />
    {points.map((point) => {
      const left = ((point.longitude - minLon) / (maxLon - minLon)) * 76 + 10;
      const top = (1 - (point.latitude - minLat) / (maxLat - minLat)) * 82 + 7;
      return <button key={point.name} type="button" className={`map-marker ${riskTone(point.risk_level)} ${selected === point.name ? "selected" : ""}`} style={{ left: `${left}%`, top: `${top}%` }} onClick={() => onSelect(point.name)} aria-label={`${point.name}, ${point.risk_label || point.risk_level || "risk unavailable"}`}><span />{selected === point.name && <b>{point.name}</b>}</button>;
    })}
    <div className="map-caption"><span>Live risk layer</span><small>Source: AgriRisk model + Open-Meteo data</small></div>
  </div>;
}

function Metric({ label, value, unit, note, danger = false }: { label: string; value: string; unit?: string; note: string; danger?: boolean }) {
  return <div className={`indicator ${danger ? "risk" : ""}`}><span>{label}</span><div><strong>{value}</strong><small>{unit}</small></div><p>{note}</p></div>;
}

function AssessmentView({ assessment, selected }: { assessment: Assessment | null; selected: string }) {
  if (!assessment) return <Loading />;
  const rainfall = assessment.rainfall || {};
  const water = assessment.water || {};
  return <section className="data-stack">
    <div className="indicator-strip">
      <Metric label="Rainfall" value={rainfall.precipitation_mm == null ? "—" : String(rainfall.precipitation_mm)} unit="mm" note="Measured 12-month total" />
      <Metric label="Rainfall anomaly" value={rainfall.rainfall_anomaly_pct == null ? "—" : `${rainfall.rainfall_anomaly_pct}%`} unit="" note="Against previous window" danger={Number(rainfall.rainfall_anomaly_pct) < 0} />
      <Metric label="Dam fill" value={water.dam_fill_rate_pct == null ? "—" : String(water.dam_fill_rate_pct)} unit="%" note={water.worst_dam_name || "No dam data"} />
      <Metric label="Seasonal inflow" value={water.seasonal_inflow_change_pct == null ? "—" : `${water.seasonal_inflow_change_pct}%`} unit="" note="Measured comparison" danger={Number(water.seasonal_inflow_change_pct) < 0} />
      <Metric label="Model risk" value={assessment.risk?.level_code || "—"} unit="" note={assessment.risk?.level_label || "Awaiting assessment"} danger />
    </div>
    <div className="context-line"><span>Selected governorate</span><strong>{selected}</strong><RiskPill level={assessment.risk?.level_label || assessment.risk?.level_code} /><small>Data through {assessment.data_through || "latest available source"}</small></div>
  </section>;
}

function OverviewPage({ points, selected, assessment, onSelect, onNavigate }: { points: MapPoint[]; selected: string; assessment: Assessment | null; onSelect: (name: string) => void; onNavigate: (page: Page) => void }) {
  return <><PageIntro eyebrow="NATIONAL OVERVIEW" title="Tunisia Agricultural Risk"><Button onClick={() => downloadText("agririsk-overview.json", JSON.stringify({ selected, assessment }, null, 2), "application/json")}>⇩ Export brief</Button></PageIntro><div className="executive-summary"><span>Executive view</span><p>Live climate, water and risk signals from the AgriRisk service. Select a governorate to inspect its measured indicators and model classification.</p><small>Connected data surface</small></div><AssessmentView assessment={assessment} selected={selected} /><section className="overview-grid"><div className="map-panel"><div className="section-head"><div><div className="section-title">Governorate risk</div><p>Interactive risk layer from the Python model</p></div><div className="legend"><span><i className="low" />Low</span><span><i className="moderate" />Moderate</span><span><i className="high" />High</span></div></div><RiskMap points={points} selected={selected} onSelect={onSelect} /><div className="selected-region"><div><span>Selected region</span><strong>{selected}</strong></div><Button className="text-action" onClick={() => onNavigate("Regions")}>Regional analysis →</Button><Button className="text-action" onClick={() => onNavigate("AI Assistant")}>Ask the analyst →</Button></div></div><div className="watchlist"><div className="section-head"><div><div className="section-title">Priority regions</div><p>Choose a region to refresh the live assessment</p></div><Button className="text-action" onClick={() => onNavigate("Risk Map")}>All regions →</Button></div>{points.slice(0, 6).map((point) => <button type="button" className="watch-row" key={point.name} onClick={() => onSelect(point.name)}><strong>{point.name}</strong><RiskPill level={point.risk_label || point.risk_level} /><span>{point.rainfall_anomaly_pct == null ? "Awaiting rainfall" : `${point.rainfall_anomaly_pct}% rainfall`}</span></button>)}</div></section></>;
}

function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) { return <div className="page-intro"><div><div className="section-label">{eyebrow}</div><div className="page-title">{title}</div></div><div className="intro-actions">{children}</div></div>; }

function RegionPage({ assessment, selected, onAsk }: { assessment: Assessment | null; selected: string; onAsk: () => void }) {
  const drivers = assessment?.risk?.drivers || [];
  return <><PageIntro eyebrow="REGIONAL ANALYSIS" title={selected}><Button className="text-action" onClick={onAsk}>Ask the analyst →</Button></PageIntro>{assessment ? <><div className="region-hero"><RiskPill level={assessment.risk?.level_label || assessment.risk?.level_code} /><p>{assessment.risk?.level_label || "Current model assessment"}. The indicators below combine measured rainfall, soil moisture and water-resource signals for this governorate.</p></div><section className="analysis-sections"><div className="analysis-block"><div className="section-title">Climate indicators</div><div className="comparison-row"><span>Rainfall total</span><strong>{assessment.rainfall?.precipitation_mm ?? "—"} mm</strong><small>Measured 12-month window</small></div><div className="comparison-row"><span>Rainfall anomaly</span><strong>{assessment.rainfall?.rainfall_anomaly_pct ?? "—"}%</strong><small>Compared with previous window</small></div><div className="comparison-row"><span>Soil moisture</span><strong>{assessment.rainfall?.mean_soil_moisture_0_7cm ?? "—"}</strong><small>Open-Meteo measured indicator</small></div></div><div className="analysis-block"><div className="section-title">Water resources</div><div className="comparison-row"><span>Worst dam</span><strong>{assessment.water?.worst_dam_name || "No data"}</strong><small>Lowest serving-dam fill signal</small></div><div className="comparison-row"><span>Dam fill</span><strong>{assessment.water?.dam_fill_rate_pct ?? "—"}%</strong><small>Measured reservoir data</small></div><div className="comparison-row"><span>Seasonal inflow</span><strong>{assessment.water?.seasonal_inflow_change_pct ?? "—"}%</strong><small>Compared with prior season</small></div></div><div className="analysis-block"><div className="section-title">Risk drivers</div>{drivers.length ? drivers.map((driver) => <div className="comparison-row" key={driver.indicator}><span>{driver.indicator}</span><strong>{driver.value}</strong><small>{driver.signal || "Model driver"}</small></div>) : <div className="state-message">No driver detail returned.</div>}</div></section></> : <Loading />}</>;
}

function WaterPage() {
  const [rows, setRows] = useState<WaterRow[]>([]); const [date, setDate] = useState(""); const [error, setError] = useState("");
  useEffect(() => { api.waterSummary().then((result) => { setRows(result.rows); setDate(result.date); }).catch((caught) => setError(caught instanceof Error ? caught.message : "Water data unavailable.")); }, []);
  return <><PageIntro eyebrow="NATIONAL INFRASTRUCTURE" title="Water Resources"><Button onClick={() => downloadText("agririsk-water.csv", ["Dam,Governorate,Region,Capacity Mm3,Stock Mm3,Fill %,Inflow change %", ...rows.map((row) => [row.dam, row.governorate, row.region, row.capacity_mm3, row.stock_mm3, row.fill_pct, row.inflow_change_pct].join(","))].join("\n"), "text/csv")}>⇩ Export CSV</Button></PageIntro><div className="context-line"><span>Latest measured date</span><strong>{date || "Loading"}</strong><small>{rows.length} dams in the monitoring dataset</small></div>{error ? <ErrorState message={error} /> : !rows.length ? <Loading /> : <section className="editorial-table"><div className="dam-row dam-head"><span>Dam / Governorate</span><span>Capacity</span><span>Current stock</span><span>Fill</span><span>Inflow</span><span>Region</span></div>{rows.map((row) => <div className="dam-row" key={`${row.dam}-${row.governorate}`}><span><strong>{row.dam}</strong><small>{row.governorate}</small></span><span>{row.capacity_mm3 ?? "—"} Mm³</span><span>{row.stock_mm3 ?? "—"} Mm³</span><span><strong>{row.fill_pct ?? "—"}%</strong></span><span className="warning">{row.inflow_change_pct == null ? "—" : `${row.inflow_change_pct.toFixed(1)}%`}</span><span>{row.region}</span></div>)}</section>}</>;
}

function ReportsPage({ selected, crop, period }: { selected: string; crop: string; period: string }) {
  const [items, setItems] = useState<Report[]>([]); const [error, setError] = useState("");
  useEffect(() => { api.reports(selected, crop, period).then((result) => setItems(result.reports)).catch((caught) => setError(caught instanceof Error ? caught.message : "Reports unavailable.")); }, [selected, crop, period]);
  return <><PageIntro eyebrow="RESEARCH & DISTRIBUTION" title="Reports" />{error ? <ErrorState message={error} /> : !items.length ? <Loading /> : <section className="report-list"><div className="report-row report-head"><span>Report</span><span>Date</span><span>Coverage</span><span>Risk level</span><span>Actions</span></div>{items.map((report) => <div className="report-row" key={report.id}><strong>{report.title}</strong><span>{report.date || "Latest"}</span><span>{report.coverage}</span><RiskPill level={report.risk} /><div><Button className="text-action" onClick={() => downloadText(`${report.id}.json`, JSON.stringify(report, null, 2), "application/json")}>View</Button><Button className="text-action" onClick={() => downloadText(`${report.id}.csv`, `Report,Coverage,Date,Risk\n${report.title},${report.coverage},${report.date || ""},${report.risk || ""}`, "text/csv")}>CSV</Button></div></div>)}</section>}</>;
}

function AssistantPage({ selected, crop, period }: { selected: string; crop: string; period: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const prompts = ["Why is the current risk high?", "Show me the water indicators.", "Which crops are most exposed?"];
  async function send(message = draft) {
    const content = message.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next); setDraft(""); setBusy(true); setError("");
    try { const result = await api.chat({ message: content, history: next.map(({ role, content: text }) => ({ role, content: text })), governorate: selected, crop, period }); setMessages([...next, { role: "assistant", content: result.reply, tools: result.tools_used }]); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The analyst could not be reached."); }
    finally { setBusy(false); }
  }
  return <><PageIntro eyebrow="GROUNDED ANALYSIS" title="AI Risk Analyst"><Button onClick={() => setMessages([])}>Clear conversation</Button></PageIntro><div className="assistant-layout"><section className="assistant-panel"><div className="assistant-context"><span>Context</span><strong>{selected}</strong><strong>{crop}</strong><strong>{period === "current" ? "Current period" : "Last year"}</strong></div>{messages.length === 0 && <div className="assistant-intro"><strong>I analyse Tunisian agricultural climate and water risk.</strong><p>Ask about risk drivers, rainfall, reservoirs, crop exposure or deterministic scenarios. Answers are grounded in AgriRisk tools.</p></div>}{messages.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === "assistant" ? "AgriRisk Analyst" : "You"}</span><p>{message.content}</p>{message.tools && <small>Grounded on: {message.tools.join(", ")}</small>}</div>)}{busy && <Loading label="Analysing measured indicators..." />}{error && <ErrorState message={error} />}</section><aside className="prompt-panel"><span>Suggested questions</span>{prompts.map((prompt) => <Button key={prompt} className="prompt-button" onClick={() => void send(prompt)}>{prompt}</Button>)}</aside></div><form className="chat-form" onSubmit={(event) => { event.preventDefault(); void send(); }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about Tunisian agricultural risk..." aria-label="Ask the AgriRisk analyst" /><Button disabled={busy || !draft.trim()}>Send</Button></form></>;
}

function ScenariosPage({ selected, crop, period }: { selected: string; crop: string; period: string }) {
  const [change, setChange] = useState(-15); const [result, setResult] = useState<ScenarioResult | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function run() { setBusy(true); setError(""); try { setResult(await api.scenario({ governorate: selected, crop, period, rainfall_change_pct: change })); } catch (caught) { setError(caught instanceof Error ? caught.message : "Scenario service unavailable"); } finally { setBusy(false); } }
  return <><PageIntro eyebrow="FORWARD RISK ASSESSMENT" title="Scenario Analysis"><Button onClick={() => void run()} disabled={busy}>{busy ? "Running..." : "Run scenario"}</Button></PageIntro><section className="scenario-layout"><div className="scenario-controls"><div className="control-row"><div><span>Rainfall change</span><strong>{change > 0 ? "+" : ""}{change}%</strong></div><input type="range" min="-50" max="20" value={change} onChange={(event) => setChange(Number(event.target.value))} /><small><span>-50%</span><span>Baseline</span><span>+20%</span></small></div></div><div className="risk-comparison"><span>Selected region</span><strong>{selected}</strong>{result ? <><div><small>Current model risk</small><b>{result.risk_before?.level_label || result.risk_before?.level_code || "—"}</b></div><div><small>Scenario model risk</small><b>{result.risk_after?.level_label || result.risk_after?.level_code || "—"}</b></div><p>{result.note}</p></> : <p>Run the scenario to receive a deterministic model comparison.</p>}{error && <ErrorState message={error} />}</div></section></>;
}

export default function AppLive() {
  const [active, setActive] = useState<Page>("Overview"); const [dark, setDark] = useState(() => localStorage.getItem("agririsk-theme") === "dark");
  const [selected, setSelected] = useState("Kairouan"); const [crop, setCrop] = useState("Tomato"); const [period, setPeriod] = useState("current"); const [search, setSearch] = useState("");
  const [points, setPoints] = useState<MapPoint[]>(fallbackPoints); const [assessment, setAssessment] = useState<Assessment | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const filteredPoints = useMemo(() => points.filter((point) => point.name.toLowerCase().includes(search.toLowerCase())), [points, search]);
  useEffect(() => { localStorage.setItem("agririsk-theme", dark ? "dark" : "light"); }, [dark]);
  useEffect(() => { let cancelled = false; setLoading(true); setError(""); Promise.all([api.map(period), api.assessment(selected, crop, period)]).then(([map, region]) => { if (!cancelled) { setPoints(map.points); setAssessment(region); } }).catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "The AgriRisk API is not configured; showing local preview data."); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [selected, crop, period]);
  const content = active === "AI Assistant" ? <AssistantPage selected={selected} crop={crop} period={period} /> : active === "Scenarios" ? <ScenariosPage selected={selected} crop={crop} period={period} /> : active === "Water" ? <WaterPage /> : active === "Reports" ? <ReportsPage selected={selected} crop={crop} period={period} /> : active === "Regions" ? <RegionPage assessment={assessment} selected={selected} onAsk={() => setActive("AI Assistant")} /> : active === "Climate" ? <><PageIntro eyebrow="CLIMATE MONITORING" title="Climate indicators"><Button onClick={() => setPeriod(period === "current" ? "last_year" : "current")}>Compare {period === "current" ? "last year" : "current period"}</Button></PageIntro><AssessmentView assessment={assessment} selected={selected} /></> : active === "Overview" || active === "Risk Map" ? <OverviewPage points={filteredPoints} selected={selected} assessment={assessment} onSelect={setSelected} onNavigate={setActive} /> : <AssessmentView assessment={assessment} selected={selected} />;
  return <div className={`app ${dark ? "dark" : ""}`}><aside className="sidebar"><div className="wordmark"><span />AgriRisk</div><nav>{navigation.map((item) => <button type="button" key={item.label} className={`nav-item ${active === item.label ? "active" : ""}`} onClick={() => setActive(item.label)}><span className="nav-icon">{item.icon}</span><span>{item.label}</span></button>)}</nav><div className="sidebar-foot"><span>Data status</span><strong><i /> {error ? "Preview mode" : "Connected"}</strong><small>{error ? "API connection required" : "Live service"}</small></div></aside><main><header className="topbar"><div className="market"><span>Market</span><strong>Tunisia</strong></div><div className="top-actions"><label className="search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search regions" aria-label="Search regions" /></label><select className="period-select" value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Select period"><option value="current">Current period</option><option value="last_year">Last year</option></select><select className="crop-select" value={crop} onChange={(event) => setCrop(event.target.value)} aria-label="Select crop"><option>Tomato</option><option>Durum wheat</option><option>Olive</option><option>Barley</option></select><Button className="icon-action" onClick={() => setDark((value) => !value)} aria-label="Toggle theme">{dark ? "☼" : "◐"}</Button><Button className="profile" onClick={() => setActive("AI Assistant")}>YK</Button></div></header><div className="content">{loading && active !== "AI Assistant" && <Loading />} {content}</div></main></div>;
}
