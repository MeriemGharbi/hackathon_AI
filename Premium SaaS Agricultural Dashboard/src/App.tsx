import { useMemo, useState } from "react";

type IconName =
  | "overview" | "map" | "regions" | "water" | "climate" | "scenarios"
  | "reports" | "search" | "calendar" | "sun" | "moon" | "arrow"
  | "download" | "chevron";

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
};

function Icon({ name, size = 17 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

function Action({ children, className = "", onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return <div className={`action ${className}`} role="button" tabIndex={0} onClick={onClick}>{children}</div>;
}

const nav = [
  ["Overview", "overview"], ["Risk Map", "map"], ["Regions", "regions"], ["Water", "water"],
  ["Climate", "climate"], ["Scenarios", "scenarios"], ["Reports", "reports"],
] as const;

const regions = [
  { name: "Bizerte", x: 43, y: 15, risk: "medium" }, { name: "Tunis", x: 59, y: 21, risk: "high" },
  { name: "Ariana", x: 52, y: 17, risk: "medium" }, { name: "Manouba", x: 48, y: 25, risk: "high" },
  { name: "Ben Arous", x: 61, y: 28, risk: "high" }, { name: "Nabeul", x: 73, y: 29, risk: "medium" },
  { name: "Jendouba", x: 28, y: 29, risk: "low" }, { name: "Béja", x: 39, y: 31, risk: "medium" },
  { name: "Zaghouan", x: 56, y: 36, risk: "high" }, { name: "Siliana", x: 42, y: 43, risk: "high" },
  { name: "Kef", x: 28, y: 42, risk: "medium" }, { name: "Kairouan", x: 49, y: 55, risk: "high" },
  { name: "Sousse", x: 64, y: 49, risk: "high" }, { name: "Monastir", x: 71, y: 55, risk: "medium" },
  { name: "Mahdia", x: 68, y: 63, risk: "high" }, { name: "Kasserine", x: 32, y: 58, risk: "high" },
  { name: "Sidi Bouzid", x: 46, y: 68, risk: "high" }, { name: "Sfax", x: 64, y: 73, risk: "high" },
  { name: "Gafsa", x: 33, y: 76, risk: "medium" }, { name: "Tozeur", x: 24, y: 84, risk: "medium" },
  { name: "Gabès", x: 54, y: 86, risk: "high" }, { name: "Médenine", x: 66, y: 94, risk: "high" },
];

const watchlist = [
  ["Kairouan", "High", "Severe", "−34.2%", "Rising"],
  ["Sidi Bouzid", "High", "Severe", "−29.8%", "Rising"],
  ["Sfax", "High", "Elevated", "−26.1%", "Stable"],
  ["Jendouba", "Low", "Moderate", "−5.8%", "Improving"],
];

const dams = [
  ["Sidi Salem", "Béja", "555 Mm³", "218 Mm³", "39.3%", "−24%", "39,42,40,43,41,39,37,36,38,36,35,34"],
  ["Sidi Barrak", "Béja", "286 Mm³", "142 Mm³", "49.7%", "−11%", "42,44,43,46,47,45,48,50,49,51,50,49"],
  ["Sejnane", "Bizerte", "138 Mm³", "48 Mm³", "34.8%", "−32%", "55,53,51,48,49,46,43,41,39,38,36,34"],
  ["Nebhana", "Kairouan", "86 Mm³", "19 Mm³", "22.1%", "−41%", "45,43,40,38,35,33,31,29,27,25,24,22"],
  ["Siliana", "Siliana", "70 Mm³", "25 Mm³", "35.7%", "−18%", "41,40,42,39,38,37,39,38,36,35,36,35"],
];

function RiskPill({ children }: { children: React.ReactNode }) {
  const tone = String(children).toLowerCase().replace(" ", "-");
  return <span className={`risk-pill ${tone}`}><i></i>{children}</span>;
}

function TunisiaMap({ selected, setSelected }: { selected: string; setSelected: (region: string) => void }) {
  return <div className="map-stage">
    <svg className="tunisia" viewBox="0 0 100 112" aria-label="Governorate risk map of Tunisia">
      <path className="country" d="M37 4 54 5 67 11 77 19 72 31 63 39 67 53 76 65 71 76 78 86 69 93 63 104 55 111 47 101 43 88 34 80 37 65 28 54 25 40 29 27 25 15Z"/>
      <g className="boundaries"><path d="M27 20 70 21M28 33 67 35M29 47 65 48M34 60 71 63M36 74 73 76M43 88 70 92M37 20l-8 13M52 6 48 33M62 11l-5 28M42 33l-8 27M55 36l-9 38M63 49 56 92"/></g>
      {regions.map((region) => <g key={region.name} className={`map-point ${region.risk} ${selected === region.name ? "selected" : ""}`} onClick={() => setSelected(region.name)} role="button" tabIndex={0}>
        <circle cx={region.x} cy={region.y} r={selected === region.name ? 2.7 : 1.8}/>
        {selected === region.name && <circle className="selection-ring" cx={region.x} cy={region.y} r="4.5"/>}
      </g>)}
    </svg>
    <span className="map-label label-bizerte">Bizerte</span>
    <span className="map-label label-tunis">Tunis</span>
    <span className="map-label label-kef">Le Kef</span>
    <span className="map-label label-kairouan">Kairouan</span>
    <span className="map-label label-sfax">Sfax</span>
    <span className="map-label label-gabes">Gabès</span>
  </div>;
}

function LineChart({ type = "water" }: { type?: "water" | "rain" }) {
  const water = "M4 48 C38 45 62 42 91 48 S145 55 174 61 S227 68 254 77 S306 85 356 91";
  const rain = "M4 72 C31 63 59 77 88 57 S140 71 174 55 S222 73 253 82 S304 63 356 86";
  const average = "M4 55 C55 53 112 57 174 59 S292 61 356 60";
  return <svg className={`line-chart ${type}`} viewBox="0 0 360 110" preserveAspectRatio="none">
    <g className="gridlines"><path d="M0 20H360M0 55H360M0 90H360"/></g>
    <path className="benchmark" d={average} fill="none" strokeDasharray="4 4"/>
    <path className="primary-line" d={type === "water" ? water : rain} fill="none"/>
    <circle cx="356" cy={type === "water" ? 91 : 86} r="3"/>
  </svg>;
}

function MiniTrend({ values }: { values: string }) {
  const nums = values.split(",").map(Number);
  const points = nums.map((value, index) => `${index * 7},${38 - value * .55}`).join(" ");
  return <svg viewBox="0 0 77 28" className="mini-trend"><polyline points={points} fill="none"/></svg>;
}

function Indicators() {
  const values = [
    ["Water Availability", "1,250", "Mm³", "−14.8% YoY"],
    ["Average Dam Fill", "38.4", "%", "−6.2 pts"],
    ["Rainfall Anomaly", "−21.3", "%", "vs 30-yr norm"],
    ["Seasonal Inflow", "420", "Mm³", "−28.5% YoY"],
    ["Overall Risk", "73", "/100", "HIGH"],
  ];
  return <section className="indicator-strip">
    {values.map(([label, value, unit, context], index) => <div className={`indicator ${index === 4 ? "risk" : ""}`} key={label}>
      <span>{label}</span><div><strong>{value}</strong><small>{unit}</small></div><p>{context}</p>
    </div>)}
  </section>;
}

function Overview() {
  const [selected, setSelected] = useState("Tunis");
  const selectedRisk = regions.find((region) => region.name === selected)?.risk || "high";
  return <>
    <div className="page-intro">
      <div><div className="section-label">NATIONAL OVERVIEW · Q4 2024</div><div className="page-title">Tunisia Agricultural Risk</div></div>
      <Action><Icon name="download" size={15}/> Export brief</Action>
    </div>
    <div className="executive-summary"><span>Executive view</span><p>Water availability remains materially below seasonal norms. Exposure is concentrated across central governorates, while northern reservoir conditions provide limited near-term resilience.</p><small>Updated 06 Jan 2025 · 08:40</small></div>
    <Indicators/>
    <section className="overview-grid">
      <div className="map-panel">
        <div className="section-head"><div><div className="section-title">Governorate risk</div><p>Composite water and climate exposure across 22 governorates</p></div><div className="legend"><span><i className="low"></i>Low</span><span><i className="medium"></i>Moderate</span><span><i className="high"></i>High</span></div></div>
        <TunisiaMap selected={selected} setSelected={setSelected}/>
        <div className="selected-region">
          <div><span>Selected region</span><strong>{selected}</strong></div>
          <RiskPill>{selectedRisk === "high" ? "High" : selectedRisk === "medium" ? "Moderate" : "Low"}</RiskPill>
          <div><span>Risk probability</span><strong>{selectedRisk === "high" ? "73%" : selectedRisk === "medium" ? "52%" : "28%"}</strong></div>
          <div><span>Rainfall anomaly</span><strong>−21.3%</strong></div>
          <Action className="text-action">Regional analysis <Icon name="arrow" size={14}/></Action>
        </div>
      </div>
      <div className="watchlist">
        <div className="section-head"><div><div className="section-title">Regional watchlist</div><p>Priority movements requiring review</p></div><Action className="text-action">All regions <Icon name="arrow" size={14}/></Action></div>
        <div className="data-table">
          <div className="data-row table-head"><span>Governorate</span><span>Risk</span><span>Water stress</span><span>Rainfall</span><span>Trend</span></div>
          {watchlist.map((row) => <div className="data-row" key={row[0]}><strong>{row[0]}</strong><span><RiskPill>{row[1]}</RiskPill></span><span>{row[2]}</span><span className="mono">{row[3]}</span><span className={`trend ${row[4].toLowerCase()}`}>{row[4]}</span></div>)}
        </div>
        <div className="watch-note"><span>Portfolio signal</span><p>Central Tunisia accounts for 62% of high-risk regional exposure this quarter.</p></div>
      </div>
    </section>
    <section className="chart-grid">
      <div className="chart-panel"><div className="section-head"><div><div className="section-title">Water availability</div><p>National stock against three-year average</p></div><div className="chart-stat"><strong>1,250 Mm³</strong><span>−14.8%</span></div></div><LineChart/><div className="axis"><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span></div><div className="chart-legend"><span><i></i>Current stock</span><span><i></i>3-year average</span></div></div>
      <div className="chart-panel"><div className="section-head"><div><div className="section-title">Rainfall anomaly</div><p>Monthly variance from 30-year normal</p></div><div className="chart-stat"><strong>−21.3%</strong><span>Below norm</span></div></div><LineChart type="rain"/><div className="axis"><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span></div><div className="chart-legend"><span><i></i>Observed</span><span><i></i>Historical norm</span></div></div>
    </section>
  </>;
}

function RegionPage() {
  return <>
    <div className="region-hero"><div className="section-label">REGIONAL ANALYSIS · CENTRAL TUNISIA</div><div className="region-title-line"><div className="page-title">Kairouan</div><RiskPill>High</RiskPill></div><p>Water stress and persistent rainfall deficits are reinforcing a high-risk outlook. Confidence is strongest in reservoir and precipitation signals.</p></div>
    <div className="comparison-bar"><span>Composite risk</span><strong>78 / 100</strong><div><i></i></div><small>National average 73</small></div>
    <section className="analysis-sections">
      {[
        ["Climate", [["Rainfall", "−34.2%", "vs normal"], ["Soil moisture", "22nd", "percentile"], ["Reference ET₀", "+11.8%", "vs average"]]],
        ["Water Resources", [["Dam fill", "22.1%", "Nebhana"], ["Regional stock", "19 Mm³", "−41% YoY"], ["Seasonal inflow", "8.4 Mm³", "12-month"]]],
        ["Risk Drivers", [["Rainfall deficit", "High", "34% weight"], ["Reservoir stress", "High", "31% weight"], ["Inflow trend", "Elevated", "21% weight"]]],
      ].map(([title, items]) => <div className="analysis-block" key={title as string}><div className="section-title">{title as string}</div>{(items as string[][]).map(([label, value, note]) => <div className="comparison-row" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small><div><i style={{ width: value.includes("High") ? "82%" : value.includes("Elevated") ? "68%" : "58%" }}></i></div></div>)}</div>)}
    </section>
  </>;
}

function WaterPage() {
  return <>
    <div className="page-intro"><div><div className="section-label">NATIONAL INFRASTRUCTURE</div><div className="page-title">Water Resources</div><p>Reservoir position, inflows and operating trends across Tunisia.</p></div><Action><Icon name="download" size={15}/> Export data</Action></div>
    <section className="zone-strip"><div><span>North</span><strong>924 Mm³</strong><small>42.1% fill</small></div><div><span>Centre</span><strong>221 Mm³</strong><small>31.7% fill</small></div><div><span>Cap Bon</span><strong>105 Mm³</strong><small>28.9% fill</small></div></section>
    <section className="editorial-table">
      <div className="dam-row dam-head"><span>Dam / Governorate</span><span>Capacity</span><span>Current stock</span><span>Fill</span><span>Inflow</span><span>12-month trend</span></div>
      {dams.map((row) => <div className="dam-row" key={row[0]}><span><strong>{row[0]}</strong><small>{row[1]}</small></span><span>{row[2]}</span><span>{row[3]}</span><span><strong>{row[4]}</strong></span><span className="warning">{row[5]}</span><MiniTrend values={row[6]}/></div>)}
    </section>
  </>;
}

function ScenariosPage() {
  const [rain, setRain] = useState(-20), [inflow, setInflow] = useState(-25), [stock, setStock] = useState(-15);
  const simulated = useMemo(() => Math.round(73 - rain * .28 - inflow * .14 - stock * .18), [rain, inflow, stock]);
  return <>
    <div className="page-intro"><div><div className="section-label">FORWARD RISK ASSESSMENT</div><div className="page-title">Scenario Analysis</div><p>Test national exposure against changes in core water and climate assumptions.</p></div></div>
    <section className="scenario-layout">
      <div className="scenario-controls">
        {[["Rainfall", rain, setRain], ["Seasonal inflow", inflow, setInflow], ["Water stock", stock, setStock]].map(([label, value, setter]) => <div className="control-row" key={label as string}><div><span>{label as string}</span><strong>{Number(value) > 0 ? "+" : ""}{value as number}%</strong></div><input type="range" min="-50" max="20" value={value as number} onChange={(event) => (setter as React.Dispatch<React.SetStateAction<number>>)(Number(event.target.value))}/><small><span>−50%</span><span>Baseline</span><span>+20%</span></small></div>)}
      </div>
      <div className="risk-comparison"><div><span>Current risk</span><strong>73</strong><small>High</small></div><Icon name="arrow" size={22}/><div><span>Simulated risk</span><strong>{simulated}</strong><small>High</small></div><p>The scenario increases national risk by {simulated - 73} points, with 16 of 22 governorates classified high risk.</p></div>
    </section>
  </>;
}

function ReportsPage() {
  const reports = [
    ["Quarterly National Water Risk Review", "06 Jan 2025", "Tunisia", "High"],
    ["Central Governorates Exposure Brief", "18 Dec 2024", "Central Tunisia", "High"],
    ["Northern Reservoir Resilience Note", "02 Dec 2024", "North", "Moderate"],
    ["Rainfall Anomaly Monthly Monitor", "30 Nov 2024", "Tunisia", "Moderate"],
  ];
  return <>
    <div className="page-intro"><div><div className="section-label">RESEARCH & DISTRIBUTION</div><div className="page-title">Reports</div><p>Decision-ready analysis for investment, underwriting and portfolio teams.</p></div></div>
    <section className="report-list">
      <div className="report-row report-head"><span>Report</span><span>Date</span><span>Coverage</span><span>Risk level</span><span>Actions</span></div>
      {reports.map((report) => <div className="report-row" key={report[0]}><strong>{report[0]}</strong><span>{report[1]}</span><span>{report[2]}</span><RiskPill>{report[3]}</RiskPill><div><Action className="text-action">View</Action><Action className="text-action">PDF</Action><Action className="text-action">CSV</Action></div></div>)}
    </section>
  </>;
}

export default function App() {
  const [active, setActive] = useState("Overview");
  const [dark, setDark] = useState(false);
  const content = active === "Regions" ? <RegionPage/> : active === "Water" ? <WaterPage/> : active === "Scenarios" ? <ScenariosPage/> : active === "Reports" ? <ReportsPage/> : <Overview/>;
  return <div className={`app ${dark ? "dark" : ""}`}>
    <aside className="sidebar">
      <div className="wordmark"><span></span>AgriRisk</div>
      <nav>{nav.map(([label, icon]) => <div role="button" tabIndex={0} className={`nav-item ${active === label ? "active" : ""}`} key={label} onClick={() => setActive(label)}><Icon name={icon}/><span>{label}</span></div>)}</nav>
      <div className="sidebar-foot"><span>Data status</span><strong><i></i> All systems operational</strong><small>Updated 8 min ago</small></div>
    </aside>
    <main>
      <header className="topbar">
        <div className="market"><span>Market</span><strong>Tunisia</strong><Icon name="chevron" size={13}/></div>
        <div className="top-actions">
          <div className="search"><Icon name="search" size={16}/><span>Search data and regions</span><kbd>⌘ K</kbd></div>
          <Action><Icon name="calendar" size={15}/> Oct 1 — Dec 31, 2024</Action>
          <Action className="icon-action" onClick={() => setDark(!dark)}><Icon name={dark ? "sun" : "moon"}/></Action>
          <div className="profile">YK</div>
        </div>
      </header>
      <div className="content">{content}</div>
    </main>
  </div>;
}
