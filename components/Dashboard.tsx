"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Prompt } from "next/font/google";
import { MODEL_NAMES, modelCode } from "@/lib/models";
import NeuralCore from "./NeuralCore";
import { AiChip, Bars, Calendar as CalIcon, ChartSmall, ChartUp, Code, ExtLink, Clock, Coins, Expand, Eye, Layers, Logo, Logout, Neural, Person, Power, Pulse, Shield, Shrink, Signal, Trophy } from "./icons";

type Account = { id: string; login: string; server: string; company: string; currency: string; is_demo: boolean; name: string | null };
type Position = { ticket: number; symbol: string; type: number; magic: number; volume: number; open_price: number; profit: number };
type News = { t: number; name: string; cur: string; imp: number; act: string; fc: string };
type Market = { symbol: string; candles: [number, number, number, number, number][]; vol_ratio: number; range_1m?: number; range_3m?: number; range_days?: number; news: News[] };
// average H1 range in dollars: backtests of V.1.39.1 made most of their profit when it was above about $6,
// and were flat or losing when it stayed near $2-5 (2016-2023)
const RANGE_WIDE = 6, RANGE_NARROW = 5;
const rangeTone = (v: number) => (v >= RANGE_WIDE ? "pos" : v >= RANGE_NARROW ? "yel" : "neg");
type Sys = { cpu: number; cores: number; frame: number; peak: number; fps: number; term_mb: number; ram_mb: number; ea_mb: number; anim: boolean };
type EaState = { version?: string; symbol?: string; magic?: number; virtual_sl?: boolean; session?: string; news_filter?: boolean;
  dd?: { peak: number; max: number; max_pct: number }; sys?: Sys; models?: { no: number; state: number }[] };
type Data = {
  online: number | null;
  account: Account;
  state: { balance: number; equity: number; server_time: string; ea_alive: boolean; age: number; positions: Position[]; market: Market | null; ea_state: EaState | null } | null;
  last30: { trades: number; wins: number; losses: number };
  daily: { d: string; pl: number; n: number }[];
  monthly: { m: string; pl: number; n: number; all_change: number; cash: number }[];
  ranking: { model: number; trades: number; wins: number; pl: number; pf?: number | null }[];
  dd: { dd: number; amount: number; peak: number };
  marks: { t: string; deal_type: number; price: number }[];
  analysis?: Analysis | null;
  ai_status?: { state: string; at?: number };
  ai_accuracy?: { pct: number; right: number; n: number } | null;   // buy / sell signals that called the next H1 bar right
  // light-model notes (lib/notes.ts): the 5-minute M5 read and the read ~20 minutes before an important USD release
  // weekly CFTC positioning of hedge funds in COMEX gold (lib/cot.ts)
  cot?: { date: string; net: number; change: number; oi: number; pct: number; index: number } | null;
  // prop-firm loss limits on the whole account (app/api/dashboard): today's closed P/L since the reset, the worst day and
  // the lowest point ever seen in deals and 5-minute equity samples
  risk?: { daily_pct: number; max_pct: number; reset: number; initial: number; today: number; worst_day: number; worst_day_d: string | null; worst_max: number; worst_max_d: string | null } | null;
  ai_notes?: { m5: { bias: number; summary: string; level: string; at: number } | null; news: { t: number; names: string[]; better: string; worse: string; watch: string; at: number } | null };
};
type Money = (v: number, plus?: boolean, digits?: number) => string;
// hourly view from two AI models (lib/analysis.ts): joint direction and signal, then each model's reason; names are not shown
type ModelView = { bias: number; confidence: number; signal: string; reason: string; lines: string[]; news?: string };
type Analysis = { bar: number; bias: number; confidence: number; signal: string; agree: boolean; views: ModelView[]; at: number; trade?: { entry: number; tp: number; sl: number } | null };

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
// developer profile links shown on the DEVELOPED BY card; empty = the button shows but does not open anything yet
const MYFXBOOK_URL = "https://www.myfxbook.com", MQL5_URL = "https://www.mql5.com";
const DevLink = ({ url, label, icon }: { url: string; label: string; icon: React.ReactNode }) => (
  <a className="devlink" href={url || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!url} title={url ? `${label} (new tab)` : `${label} link coming soon`}>{icon}{label}<ExtLink /></a>
);

const sign = (v: number) => (v > 0 ? "pos" : v < 0 ? "neg" : "");
// Safari on iPad and older browsers still use the webkit names
type FullDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
type FullEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
const isFull = () => !!(document.fullscreenElement ?? (document as FullDoc).webkitFullscreenElement);
// already running from the home screen: there is no browser bar left to hide
const installed = () => matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches || !!(navigator as Navigator & { standalone?: boolean }).standalone;

// one id per browser, so several tabs count as one online user
const visitorId = () => {
  const fresh = () => crypto.randomUUID();
  try {
    const id = localStorage.getItem("trendx_visitor") ?? fresh();
    localStorage.setItem("trendx_visitor", id);
    return id;
  } catch { return fresh(); }
};

function Ring({ value }: { value: number }) {
  const c = 2 * Math.PI * 30;
  return (
    <svg className="ring" viewBox="0 0 76 76" role="img" aria-label={`Win rate ${value}%`}>
      <circle cx="38" cy="38" r="30" className="track" />
      <circle cx="38" cy="38" r="30" className="fill" strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 38 38)" />
      <circle cx="38" cy="38" r="30" className="run" pathLength={100} />
      <text x="38" y="44" textAnchor="middle">{value}%</text>
    </svg>
  );
}

function Spark({ daily }: { daily: Data["daily"] }) {
  const pts = useMemo(() => { let s = 0; return daily.slice(-30).map((x) => (s += x.pl)); }, [daily]);
  if (pts.length < 2) return <svg className="spark" />;
  const lo = Math.min(...pts, 0), hi = Math.max(...pts, 1);
  const xy = pts.map((v, i) => `${(i / (pts.length - 1)) * 200},${46 - ((v - lo) / (hi - lo)) * 42}`);
  return <svg className="spark" viewBox="0 0 200 48" preserveAspectRatio="none" aria-hidden="true"><polygon points={`0,48 ${xy.join(" ")} 200,48`} /><polyline pathLength={1} points={xy.join(" ")} />
    {/* the chart stretches to fit, so the ball is a round stroke cap that keeps its shape */}
    <g className="ball"><animateMotion dur="4s" repeatCount="indefinite" path={`M${xy.join(" L")}`} /><path className="halo" d="M0 0h.01" /><path d="M0 0h.01" /></g></svg>;
}

// day amounts are shortened to fit the cell, as on the EA panel
const dayDigits = (v: number) => (Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 100 ? 1 : 2);

function Calendar({ daily, money, today }: { daily: Data["daily"]; money: Money; today?: string }) {
  const [month, setMonth] = useState((today ?? new Date().toISOString()).slice(0, 7));
  const days = useMemo(() => new Map(daily.map((x) => [x.d, x])), [daily]);
  const [y, m] = month.split("-").map(Number);
  const first = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;   // Monday first
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const shift = (n: number) => setMonth(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7));
  const inMonth = daily.filter((x) => x.d.startsWith(month));
  const total = inMonth.reduce((s, x) => s + x.pl, 0);
  return (
    <section className="card calendar">
      <header><h2><CalIcon /> PROFIT CALENDAR</h2>
        <span className="nav"><button onClick={() => shift(-1)} aria-label="เดือนก่อน">‹</button>{new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" })} {y}<button onClick={() => shift(1)} aria-label="เดือนถัดไป">›</button></span>
        <b className={sign(total)}>Month {money(total, true)}</b></header>
      <div className="cal">
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d, i) => <i key={d} className={i > 4 ? "wk" : ""}>{d}</i>)}
        {Array.from({ length: first }, (_, i) => <span key={`e${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const key = `${month}-${String(i + 1).padStart(2, "0")}`, v = days.get(key);
          return <div key={key} className={`day ${v ? (v.pl >= 0 ? "up" : "down") : ""} ${key === today ? "now" : ""}`}><small>{i + 1}</small>{v && <b>{money(v.pl, true, dayDigits(v.pl))}</b>}</div>;
        })}
      </div>
      <p className="note">{inMonth.reduce((s, x) => s + x.n, 0)} trades &nbsp; {inMonth.filter((x) => x.pl >= 0).length} green days &nbsp; {inMonth.filter((x) => x.pl < 0).length} red days</p>
    </section>
  );
}

function Monthly({ monthly, money, balance, today }: { monthly: Data["monthly"]; money: Money; balance: number; today?: string }) {
  const year = Number((today ?? new Date().toISOString()).slice(0, 4)), thisMonth = Number((today ?? new Date().toISOString()).slice(5, 7)) - 1;
  const rows = MONTHS.map((_, i) => monthly.find((x) => x.m === `${year}-${String(i + 1).padStart(2, "0")}`));
  const vals = rows.map((r) => r?.pl ?? 0), total = vals.reduce((a, b) => a + b, 0), peak = Math.max(...vals.map(Math.abs), 1);
  // same as the EA: balance at the start of a month = balance now minus every later change, deposits of that month added back
  const fmt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  let after = 0, deposits = 0;
  const monthPct = rows.map(() => 0);
  for (let i = 11; i >= 0; i--) {
    after += rows[i]?.all_change ?? 0;
    const dep = Math.max(0, rows[i]?.cash ?? 0), start = balance - after + dep;
    monthPct[i] = start > 0 ? (vals[i] / start) * 100 : 0;
    deposits += dep;
  }
  const yearStart = balance - after + deposits, yearPct = yearStart > 0 ? (total / yearStart) * 100 : 0;
  return (
    <section className="card monthly">
      <header><h2><Bars /> MONTHLY P/L <small>{year}</small></h2><b className={sign(total)}>Year {money(total, true)} {fmt(yearPct)}</b></header>
      <p className="note top">{rows.reduce((s, r) => s + (r?.n ?? 0), 0)} trades &nbsp; {vals.filter((v) => v > 0).length} green months &nbsp; {vals.filter((v) => v < 0).length} red months</p>
      <div className="bars">{vals.map((v, i) => (
        <div key={i} className={i === thisMonth ? "cur" : i > thisMonth ? "future" : ""} style={{ "--i": i } as React.CSSProperties} title={money(v, true)}>
          <div className="half up">{v > 0 && <span style={{ height: `${(v / peak) * 88}%` }}><em>{fmt(monthPct[i])}</em></span>}</div>
          <div className="half down">{v < 0 && <span style={{ height: `${(-v / peak) * 100}%` }} />}</div><small>{MONTHS[i]}</small></div>
      ))}</div>
    </section>
  );
}

function Live({ market, marks }: { market: Market | null | undefined; marks: Data["marks"] }) {
  if (!market?.candles?.length) return <section className="card"><header><h2><span className="dot" />LIVE</h2></header><p className="none">รอข้อมูลกราฟจาก MT5</p></section>;
  const c = market.candles, last = c[c.length - 1], X = 268, T = 8, Hh = 104;
  const hi = Math.max(...c.map((x) => x[2])), lo = Math.min(...c.map((x) => x[3])), Y = (p: number) => T + ((hi - p) / (hi - lo || 1)) * Hh;
  const change = ((last[4] - last[1]) / last[1]) * 100, w = X / c.length, up = last[4] >= last[1];
  const stamp = (t: number) => { const d = new Date(t * 1000), z = (n: number) => String(n).padStart(2, "0"); return `${d.getUTCFullYear()}.${z(d.getUTCMonth() + 1)}.${z(d.getUTCDate())} ${z(d.getUTCHours())}:00`; };
  const hour = (t: number) => `${String(new Date(t * 1000).getUTCHours()).padStart(2, "0")}:00`;
  const levels = [0, 1, 2, 3].map((i) => hi - ((hi - lo) * i) / 3);
  const seen = marks.filter((m) => Number(m.t) >= c[0][0] && Number(m.t) <= last[0] + 3600);
  const lastX = (c.length - 1) * w + w / 2, trail = c.map((k, i) => `${i * w + w / 2},${Y(k[4])}`).join(" ");
  return (
    <section className="card">
      <header><h2><span className="dot" />LIVE <small>{market.symbol} H1</small></h2><b key={last[4]} className={`px tick ${up ? "pos" : "neg"}`}>{last[4].toFixed(2)}<small className={up ? "pos" : "neg"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}% bar</small></b></header>
      <svg className="candles" viewBox="0 0 330 128" role="img" aria-label="H1 price chart">
        <line className="pxl" x1="0" x2={X} y1={Y(last[4])} y2={Y(last[4])} />
        {c.map((k, i) => { const u = k[4] >= k[1], x = i * w + w / 2; return (
          <g key={k[0]} className={`${u ? "cu" : "cd"} ${i === c.length - 1 ? "lastc" : ""}`} style={{ "--i": i } as React.CSSProperties}><line x1={x} x2={x} y1={Y(k[2])} y2={Y(k[3])} /><rect x={x - w * 0.32} y={Math.min(Y(k[1]), Y(k[4]))} width={w * 0.64} height={Math.max(1, Math.abs(Y(k[1]) - Y(k[4])))} /></g>); })}
        <polyline className="trail" pathLength={100} points={trail} />
        {seen.map((m, i) => { const x = Math.floor((Number(m.t) - c[0][0]) / 3600) * w + w / 2, y = Y(m.price); return <path key={i} className={m.deal_type === 0 ? "mkb" : "mks"} d={m.deal_type === 0 ? `M${x - 3} ${y + 5}h6l-3 -5z` : `M${x - 3} ${y - 5}h6l-3 5z`} />; })}
        <circle className="ping" cx={lastX} cy={Y(last[4])} r="2.5" /><circle className="ping two" cx={lastX} cy={Y(last[4])} r="2.5" />
        {levels.map((p) => <text key={p} x="326" y={Y(p) + 3} textAnchor="end">{p.toFixed(2)}</text>)}
        <rect className={up ? "tagu" : "tagd"} x="276" y={Y(last[4]) - 6} width="50" height="12" rx="2" /><text className="tagp" x="301" y={Y(last[4]) + 3} textAnchor="middle">{last[4].toFixed(2)}</text>
        <text x="0" y="126">{stamp(c[0][0])}</text><text x={X - 2} y="126" textAnchor="end">{hour(last[0])}</text>
      </svg>
      {market.range_3m ? (
        <div className="hrange" title={`Average H1 range. Backtests: profit mostly came when the 3-month value was at least $${RANGE_WIDE}; below $${RANGE_NARROW} results were flat or losing.`}>
          <span>H1 RANGE</span>
          <span>1M <b className={rangeTone(market.range_1m ?? 0)}>${(market.range_1m ?? 0).toFixed(2)}</b></span>
          <span>3M <b className={rangeTone(market.range_3m)}>${market.range_3m.toFixed(2)}</b></span>
          <em className={rangeTone(market.range_3m)}>{market.range_3m >= RANGE_WIDE ? "WIDE" : market.range_3m >= RANGE_NARROW ? "WATCH" : "NARROW"}</em>
        </div>
      ) : null}
    </section>
  );
}

function NewsPanel({ news, filter }: { news: News[] | undefined; filter?: boolean }) {
  const time = (t: number) => new Date(t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
  const now = Date.now() / 1000, next = news?.find((n) => n.t > now);
  const left = next ? next.t - now : 0;
  return (
    <section className="card news">
      <header><h2><CalIcon /> ECONOMIC NEWS</h2><span className="flt">FILTER {filter ? "ON" : "OFF"}<i className={filter ? "on" : ""} /></span></header>
      <div className="scroll"><table>
        <thead><tr><th>TIME</th><th>CUR</th><th>EVENT</th><th className="rt">ACT / FCST</th></tr></thead>
        <tbody>{news?.length ? news.map((n) => <tr key={`${n.t}${n.name}`} className={n === next ? "next" : ""}><td className="pos b">{time(n.t)}</td><td className="code">{n.cur} <span className="imp"><u /><u /><u /></span></td><td className="wrap-text">{n.name}</td><td className="rt">{n.act || n.fc ? `${n.act || "-"} / ${n.fc || "-"}` : ""}</td></tr>)
          : <tr><td colSpan={4} className="none">วันนี้ไม่มีข่าวสำคัญ</td></tr>}</tbody>
      </table></div>
      <p className="note">{next ? `next in ${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m   ` : ""}times in GMT+7</p>
    </section>
  );
}

function Meter({ label, value, pct, color = "" }: { label: string; value: string; pct: number; color?: string }) {
  return <div className="meter2"><div><small>{label}</small><b>{value}</b></div><i><span className={color} style={{ width: `${Math.min(100, Math.max(1, pct))}%` }} /></i></div>;
}

// loss against a prop-firm limit: green under half the limit, yellow under 80%, red above
function RiskCard({ title, loss, limitPct, initial, worst, worstD, sub, money }: { title: string; loss: number; limitPct: number; initial: number; worst: number; worstD: string | null; sub: string; money: Money }) {
  const pct = initial > 0 ? (loss / initial) * 100 : 0, worstPct = initial > 0 ? (worst / initial) * 100 : 0, use = limitPct > 0 ? pct / limitPct : 0;
  const tone = use < 0.5 ? "pos" : use < 0.8 ? "yel" : "neg", day = (d: string | null) => (d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(2, 4) : "");
  return (
    <section className="card dd risk" title={`${title}: limit ${limitPct}% of ${money(initial)} = ${money((initial * limitPct) / 100)}`}>
      <header><h3>{title}</h3><small>limit {limitPct}% &nbsp;{money((initial * limitPct) / 100)}</small></header>
      <strong className={tone}>{loss > 0 ? "-" : ""}{money(loss)} <small className={tone}>{pct.toFixed(2)}%</small></strong>
      <div className="meter"><span className={tone} style={{ width: `${Math.min(100, use * 100)}%` }} /></div>
      <small>{sub} &nbsp;<span className={worstPct >= limitPct ? "neg" : ""}>Worst -{money(worst)} ({worstPct.toFixed(2)}%) {day(worstD)}</span></small>
    </section>
  );
}

const BEAT = "l3-3 3 3h4l2 4 3-13 3 13 2-4h5l4-3 4 3H";

// the robot's speech bubble uses Prompt (Thai and Latin)
const prompt = Prompt({ subsets: ["thai", "latin"], weight: ["400", "500"] });

// robot reporter: says its lines one after another without stopping; each is typed, held BOT_HOLD to read, erased,
// the bubble closes, and the next line opens BOT_GAP later
const BOT_FIRST = 2_500, BOT_HOLD = 6_000, BOT_GAP = 800, BOT_TYPE_MS = 35, BOT_ERASE_MS = 18, BOT_FADE_MS = 600;
// pointing at (or touching) the robot or its bubble keeps the bubble up; after letting go it stays BOT_RELEASE longer
const BOT_RELEASE = 1_500;
function ChartBot({ market, positions, floating, money, ai, aiState, acc, notes, cot }: { market: Market | null | undefined; positions: Position[]; floating: number; money: Money; ai?: Analysis | null; aiState?: Data["ai_status"]; acc?: Data["ai_accuracy"]; notes?: Data["ai_notes"]; cot?: Data["cot"] }) {
  // the AI lines come first: joint signal and direction, then each model's reason and notes
  const aiLines = useMemo(() => {
    const views = ai?.views ?? [];
    // no analysis yet: say why, so a missing key or a failing model shows on the page
    const why = aiState?.state === "no_key" || aiState?.state === "error" ? "AI AGENTS CONNECTING..."
      : aiState?.state === "no_rows" ? "AI ยังไม่ทำงาน: ยังไม่มีข้อมูลจาก MT5 Service มาเริ่มการวิเคราะห์"
      : aiState?.state === "working" ? "AI กำลังวิเคราะห์ตลาด..." : "";
    const dir = (b: number) => (b > 0 ? "ขาขึ้น" : b < 0 ? "ขาลง" : "ไซด์เวย์");
    const hm = (t: number) => new Date(t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
    // a release coming up comes first: what a better or worse number would likely do to gold
    const pre = notes?.news;
    const preLines = pre ? [`ก่อนข่าว ${hm(pre.t)}${pre.names.length ? ` ${pre.names.join(", ")}` : ""}: ถ้าออกดีกว่าคาด ${pre.better}`, `ถ้าออกแย่กว่าคาด ${pre.worse}`, ...(pre.watch ? [`ระวัง: ${pre.watch}`] : [])] : [];
    // the 5-minute read of the M5 bars
    const q = notes?.m5;
    const quick = q ? [`AI 5 นาที ${hm(q.at)} · ${dir(q.bias)}: ${q.summary}`, ...(q.level ? [`จับตา: ${q.level}`] : [])] : [];
    if (!ai || !views.length) return [...preLines, ...(why ? [why] : []), ...quick];
    const head = `AI วิเคราะห์ ${hm(ai.at)} · สัญญาณ ${ai.signal.toUpperCase()} · ทิศทาง ${dir(ai.bias)} · มั่นใจ ${ai.confidence}%`;
    // the news read once (from the first model that gave one), right after the headline
    const news = views.find((v) => v.news)?.news;
    // the proposed levels of a buy / sell (recorded and measured, not traded)
    const px = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const lvl = ai.trade && ai.signal !== "wait" ? [`${ai.signal.toUpperCase()} เข้า ${px(ai.trade.entry)} · TP ${px(ai.trade.tp)} · SL ${px(ai.trade.sl)}`] : [];
    return [...preLines, head, ...lvl, ...(news ? [`ข่าว: ${news}`] : []), ...quick, ...views.flatMap((v) => [...(v.reason ? [`เหตุผล: ${v.reason}`] : []), ...v.lines])];
  }, [ai, aiState?.state, notes]);
  const lines = useMemo(() => {
    const out: string[] = [...aiLines];
    const c = market?.candles ?? [];
    if (c.length) {
      const last = c[c.length - 1], bar = ((last[4] - last[1]) / last[1]) * 100;
      out.push(`${market!.symbol} ${last[4].toFixed(2)} · แท่ง H1 นี้ ${bar >= 0 ? "+" : ""}${bar.toFixed(2)}%`);
      if (c.length > 24) {
        const ago = c[c.length - 25][4], diff = last[4] - ago, pct = (diff / ago) * 100;
        out.push(`24 ชั่วโมงล่าสุด ${diff >= 0 ? "+" : "-"}$${Math.abs(diff).toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%) ${Math.abs(pct) < 0.3 ? "ราคาทรงตัว" : diff > 0 ? "แนวโน้มขึ้น" : "แนวโน้มลง"}`);
      }
    }
    // weekly COT: hedge funds' net position in COMEX gold, its weekly change and where it sits in its 52-week range
    if (cot) {
      const k = (v: number) => `${(Math.abs(v) / 1000).toFixed(1)}K`, d = cot.date.slice(8, 10) + "/" + cot.date.slice(5, 7);
      out.push(`COT ${d}: กองทุนถือ ${cot.net >= 0 ? "Long" : "Short"} สุทธิ ${k(cot.net)} สัญญา (${cot.change >= 0 ? "+" : "-"}${k(cot.change)} จากสัปดาห์ก่อน) ${cot.change > 0 ? "แรงซื้อเพิ่ม" : cot.change < 0 ? "ลดสถานะซื้อ" : "ทรงตัว"} · ระดับ ${cot.index}% ของช่วง 52 สัปดาห์`);
    }
    // (the H1 range is not said here: it shows under the chart)
    const now = Date.now() / 1000;
    const hhmm = (t: number) => new Date(t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
    // important news still to come only (released ones are dropped): how many are left, then the next one due
    const news = market?.news ?? [], left = news.filter((n) => n.t > now).sort((a, b) => a.t - b.t);
    if (!news.length) out.push("วันนี้ไม่มีข่าวเศรษฐกิจสำคัญ ตลาดเคลื่อนไหวตามปัจจัยทางเทคนิค");
    if (left.length > 1) out.push(`ข่าวสำคัญรอประกาศอีก ${left.length} รายการ`);
    if (left.length) out.push(`ข่าวถัดไป ${hhmm(left[0].t)} ${left[0].name} ระวังความผันผวนช่วงประกาศ`);
    const buys = positions.filter((p) => p.type === 0).length, sells = positions.length - buys;
    out.push(positions.length ? `ถือ ${positions.length} ไม้ · BUY ${buys} SELL ${sells} · กำไรลอย ${money(floating, true)}` : "ตอนนี้ไม่มีไม้เปิดอยู่ รอสัญญาณ");
    return out;
  }, [market, positions, floating, money, aiLines, cot]);
  const [shown, setShown] = useState(-1);   // how many lines have been said so far (picks the line), -1 = bubble hidden
  const [erasing, setErasing] = useState(false);
  const said = useRef(0);
  // held = a mouse over, or a finger on, the robot or the bubble: the line stays (a hidden bubble opens at once, a line
  // being erased types itself back); moving between the two parts is bridged by a short delay before letting go
  const [held, setHeld] = useState(false);
  const letGo = useRef(0), released = useRef(false);
  const hold = () => { clearTimeout(letGo.current); setHeld(true); };
  const release = () => { clearTimeout(letGo.current); letGo.current = window.setTimeout(() => { released.current = true; setHeld(false); }, 150); };
  useEffect(() => () => clearTimeout(letGo.current), []);
  const holdProps = { onPointerEnter: hold, onPointerLeave: release, onPointerCancel: release };
  // bubble closed: open the next line (the first one waits BOT_FIRST after the page loads; at once while held)
  useEffect(() => {
    if (shown >= 0) return;
    const t = window.setTimeout(() => { setErasing(false); released.current = false; setShown(said.current++); }, held ? 0 : said.current ? BOT_GAP : BOT_FIRST);
    return () => clearTimeout(t);
  }, [shown, held]);
  useEffect(() => { if (held && erasing) setErasing(false); }, [held, erasing]);
  const text = shown >= 0 ? lines[shown % lines.length] : "";
  const chars = useMemo(() => Array.from(text), [text]);
  const len = useRef(0);
  len.current = chars.length;
  const [typed, setTyped] = useState(0);
  // typewriter: one more character every BOT_TYPE_MS, or one fewer every BOT_ERASE_MS while erasing
  useEffect(() => {
    if (shown < 0) return;
    const t = erasing
      ? window.setInterval(() => setTyped((n) => Math.max(0, Math.min(n, len.current) - 1)), BOT_ERASE_MS)
      : window.setInterval(() => setTyped((n) => Math.min(n + 1, len.current)), BOT_TYPE_MS);
    return () => clearInterval(t);
  }, [shown, erasing]);
  useEffect(() => { setTyped(0); }, [shown]);
  // once the line is erased the empty bubble fades out, then it is removed
  const closing = erasing && typed === 0 && shown >= 0;
  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => setShown(-1), BOT_FADE_MS);
    return () => clearTimeout(t);
  }, [closing]);
  const done = !erasing && typed >= chars.length;
  // fully typed: hold it to read (as long as it is held, then BOT_RELEASE), then start deleting it like backspace
  useEffect(() => {
    if (!done || shown < 0 || held) return;
    const t = window.setTimeout(() => setErasing(true), released.current ? BOT_RELEASE : BOT_HOLD);
    return () => clearTimeout(t);
  }, [done, shown, held]);
  return (
    // eye and mouth colour follow the 3-month H1 range: green WIDE, yellow WATCH, red NARROW (green until the bridge sends it)
    <div className={`chatbot ${market?.range_3m ? (market.range_3m >= RANGE_WIDE ? "tone-wide" : market.range_3m >= RANGE_NARROW ? "tone-watch" : "tone-narrow") : ""}`} aria-live="polite">
      {text && <p key={shown} className={`bubble ${prompt.className}${closing ? " closing" : ""}`} {...holdProps}><small><i className="botdot" aria-hidden="true" />TRENDX AI AGENTS</small><span className="sr-only">{text}</span><span className="tw" aria-hidden="true"><span className="ghost">{text}</span><span>{chars.slice(0, typed).join("")}{!done && <i className="caret" />}</span></span></p>}
      <svg className="bot" viewBox="0 0 120 142" width="96" height="114" aria-hidden="true" {...holdProps}>
        <defs>
          <linearGradient id="botShell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset=".55" stopColor="#e7ebf1" /><stop offset="1" stopColor="#b9c1cd" /></linearGradient>
          <linearGradient id="botVisor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#24364a" /><stop offset="1" stopColor="#0b141f" /></linearGradient>
          <radialGradient id="botShade" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#39ff6a" stopOpacity=".35" /><stop offset="1" stopColor="#39ff6a" stopOpacity="0" /></radialGradient>
        </defs>
        <ellipse className="shadow" cx="60" cy="134" rx="28" ry="5" fill="url(#botShade)" />
        <g className="body">
          <ellipse className="arm l" cx="23" cy="94" rx="8.5" ry="17" fill="url(#botShell)" />
          <ellipse className="arm r" cx="97" cy="94" rx="8.5" ry="17" fill="url(#botShell)" />
          <path d="M31 92c0-16 13-24 29-24s29 8 29 24c0 19-12 32-29 32S31 111 31 92Z" fill="url(#botShell)" />
          <path className="seam" d="M34 100h20l3 3h6l3-3h20" />
          {/* chest read-out: share of AI buy / sell signals that called the next H1 bar right, whole percent, shown without the % sign */}
          <rect className="accpanel" x="42" y="82" width="36" height="16" rx="5" fill="url(#botVisor)" />
          <text className="acc" x="60" y="94.2" textAnchor="middle"><title>{acc ? `AI ทายถูก ${acc.right} จาก ${acc.n} สัญญาณ` : "ยังไม่มีสัญญาณที่ปิดแท่งแล้ว"}</title>{acc ? String(acc.pct) : "--"}</text>
          <rect x="45" y="12" width="30" height="12" rx="6" fill="url(#botShell)" />
          <rect x="9" y="38" width="11" height="24" rx="5.5" fill="url(#botShell)" />
          <rect x="100" y="38" width="11" height="24" rx="5.5" fill="url(#botShell)" />
          <rect x="16" y="20" width="88" height="60" rx="26" fill="url(#botShell)" />
          <rect x="25" y="29" width="70" height="42" rx="16" fill="url(#botVisor)" />
          <path className="sheen" d="M33 33h22l-10 34H31Z" />
          <g className="face">
            <path className="eye" d="M41 53q7-9 14 0" /><path className="eye" d="M65 53q7-9 14 0" />
            <path className="mouth" d="M55 59q5 7 10 0Z" />
          </g>
        </g>
      </svg>
    </div>
  );
}

function Monitor({ sys, alive }: { sys?: Sys; alive: boolean }) {
  return (
    <section className="card">
      <header><h2><Pulse /> SYSTEM MONITOR</h2>
        {alive && <svg className="ecg" viewBox="0 0 80 18" preserveAspectRatio="xMinYMid slice" aria-hidden="true"><g><path d={`M0 10H22${BEAT}80H102${BEAT}160`} /></g></svg>}
        <span className={`pill ${sys?.anim ? "" : "off"}`}>ANIMATION {sys?.anim ? "ON" : "OFF"}</span></header>
      {sys ? <>
        <Meter label={`DASHBOARD CPU  (1 core / all ${sys.cores})`} value={`${sys.cpu.toFixed(1)}%  /  ${(sys.cpu / Math.max(1, sys.cores)).toFixed(2)}%`} pct={sys.cpu} />
        <Meter label="FRAME TIME  (avg / peak)" value={`${sys.frame.toFixed(1)} / ${sys.peak.toFixed(1)} ms`} pct={sys.frame} />
        <Meter label={`TERMINAL RAM  (of ${(sys.ram_mb / 1024).toFixed(1)} GB)`} value={`${sys.term_mb} MB  ${((sys.term_mb / Math.max(1, sys.ram_mb)) * 100).toFixed(1)}%`} pct={(sys.term_mb / Math.max(1, sys.ram_mb)) * 100} />
        <Meter label="AI MEMORY" value={`${sys.ea_mb} MB`} pct={(sys.ea_mb / Math.max(1, sys.term_mb)) * 100} color="cy" />
        <p className="note">{sys.fps.toFixed(1)} fps &nbsp; neural bg &nbsp; chart redraw not included</p>
      </> : <p className="none">อัปเดต EA V.1.39.1 เพื่อแสดงข้อมูลนี้</p>}
    </section>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [full, setFull] = useState(false);
  const [canFull, setCanFull] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    const sync = () => setFull(isFull());
    setCanFull(!installed());
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => { document.removeEventListener("fullscreenchange", sync); document.removeEventListener("webkitfullscreenchange", sync); };
  }, []);

  useEffect(() => {
    let live = true;
    const visitor = visitorId();
    const load = () => fetch("/api/dashboard", { cache: "no-store", headers: { "x-visitor": visitor } }).then((r) => {
      if (r.status === 401) { location.href = "/login"; return null; }
      if (!r.ok) throw new Error();
      return r.json();
    }).then((d) => { if (live && d) { setData(d); setError(""); } }).catch(() => live && setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้"));
    load();
    const t = setInterval(load, 3000);
    return () => { live = false; clearInterval(t); };
  }, []);

  const toggleFull = () => {
    const doc = document as FullDoc, root = document.documentElement as FullEl;
    const run = isFull() ? (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.bind(doc) : (root.requestFullscreen ?? root.webkitRequestFullscreen)?.bind(root);
    // iPhone Safari cannot make a page full screen
    if (!run) { setHint(true); return; }
    Promise.resolve(run()).catch(() => setHint(true));
  };

  const logout = () => fetch("/api/login", { method: "DELETE" }).then((r) => { if (!r.ok) throw new Error(); location.href = "/login"; }).catch(() => setError("ออกจากระบบไม่สำเร็จ"));

  if (!data) return (
    <main className="empty boot" role="status">
      <span className="bootcore"><i /><i /><i />
        {/* the same robot as the neural-core nodes, its eyes lighting up while the dashboard loads */}
        <svg className="bootbot" viewBox="-13 -22 26 25" width="34" height="33" aria-hidden="true">
          <circle className="tip" cy="-19" r="1.8" />
          <path d="M0 -17v3M-9 -9h-2v5h2M9 -9h2v5h-2M-4 -3h8" /><rect x="-9" y="-14" width="18" height="14" rx="4" />
          <circle className="glow" cx="-4" cy="-8" r="4.5" /><circle className="glow" cx="4" cy="-8" r="4.5" />
          <circle className="eye" cx="-4" cy="-8" r="1.7" /><circle className="eye" cx="4" cy="-8" r="1.7" />
        </svg>
      </span>
      <b>LOADING<em><u>.</u><u>.</u><u>.</u></em></b>
      <span className="bootbar"><i /></span>
      {error && <p className="neg">{error}</p>}
    </main>
  );

  const { account, state, last30 } = data;
  const ea = state?.ea_state;
  const cur = account.currency === "USC" ? "¢" : account.currency === "USD" ? "$" : `${account.currency} `;
  const money: Money = (v, plus = false, digits = 2) => `${plus && v >= 0 ? "+" : v < 0 ? "-" : ""}${cur}${Math.abs(v).toFixed(digits)}`;
  const online = !!state && state.age < 180, eaOn = online && state!.ea_alive;
  const positions = state?.positions ?? [];
  const floating = positions.reduce((s, p) => s + p.profit, 0);
  const balance = state?.balance ?? 0, equity = state?.equity ?? 0;
  const states = new Map((ea?.models ?? []).map((m) => [m.no, m.state]));
  const paused = [...states.values()].filter((s) => s < 0).length;
  const wr = last30.trades ? Math.round((last30.wins / last30.trades) * 100) : 0;
  const today = state?.server_time?.slice(0, 10), dayPl = (data.daily.find((x) => x.d === today)?.pl ?? 0) + floating;
  // drawdown figures come from the EA, which tracks them from the whole trade history; the web samples are the fallback
  const peak = ea?.dd?.peak || data.dd.peak, ddNow = Math.max(0, peak - equity), ddPct = peak > 0 ? (ddNow / peak) * 100 : 0;
  const ddMaxPct = Math.max(ea?.dd?.max_pct ?? data.dd.dd * 100, ddPct), ddMax = Math.max(ea?.dd?.max ?? data.dd.amount, ddNow);
  // FTMO-style: today's loss = closed P/L since the reset plus floating, max loss = initial capital minus equity
  const risk = data.risk, dayLoss = risk ? Math.max(0, -(risk.today + equity - balance)) : 0, maxLoss = risk ? Math.max(0, risk.initial - equity) : 0;
  const ratio = state?.market?.vol_ratio ?? 1;
  const regime = ratio > 1.3 ? "High Vol" : ratio < 0.7 ? "Low Vol" : "Normal";
  const side = Math.sign(positions.reduce((s, p) => s + (p.type === 0 ? p.volume : -p.volume), 0));
  const peakPl = Math.max(...data.ranking.map((r) => Math.abs(r.pl)), 1);

  return (
    <div className="page">
      <main className="layout">
        <div className="left">
          <header className="brand">
            <span className="logo"><Logo /></span>
            <div><h1>TrendX <em>Ultimate AI Pro</em></h1><p>Smart Trading &nbsp;• Smarter Decisions</p></div>
            <span className="ai"><AiChip /></span>
          </header>

          <div className="row4">
            <section className="card run">
              <h3 className={eaOn ? "pos" : "neg"}><Power /> {eaOn ? "AI Running" : online ? "EA Offline" : "Terminal Offline"}{eaOn && <i className="live" />}</h3>
              <dl><dt>Symbol</dt><dd>: &nbsp;{ea?.symbol ?? "-"}</dd><dt>Timeframe</dt><dd>: &nbsp;H1 (engine)</dd><dt>Magic</dt><dd>: &nbsp;{ea?.magic ?? "-"}xxx</dd></dl>
            </section>
            <section className="card stat"><span className="gold"><Coins /></span><h3>Balance</h3><strong>{money(balance)}</strong><small>{account.currency}</small></section>
            <section className="card stat"><span className="pos"><ChartUp /></span><h3>Equity</h3><strong>{money(equity)}</strong><small>{money(floating, true)} ({floating >= 0 ? "+" : ""}{balance ? ((floating / balance) * 100).toFixed(2) : "0.00"}%)</small></section>
            <section className="card stat"><span className="gold"><Trophy /></span><h3>Profit</h3><strong>{money(floating, true)}</strong><small>{positions.length} positions</small></section>
          </div>

          <div className="row3">
            <section className="card trades"><Ring value={wr} />
              <dl><dt>Total Trades</dt><dd>{last30.trades}</dd><dt className="pos">Win Trades</dt><dd className="pos">{last30.wins}</dd><dt className="cyan">Loss Trades</dt><dd className="neg">{last30.losses}</dd></dl>
              <small>last 30 days</small></section>
            <section className="card dd"><header><h3>Drawdown</h3><small>{money(ddNow)}</small></header><strong className={ddPct < 5 ? "pos" : ddPct < 15 ? "yel" : "neg"}>{ddPct.toFixed(2)}%</strong>
              <div className="meter"><span style={{ width: `${ddMaxPct > 0 ? (ddPct / ddMaxPct) * 100 : 0}%` }} /></div><small>Max {ddMaxPct.toFixed(1)}% &nbsp;{money(ddMax)}</small></section>
            <section className="card dd"><header><h3>Daily P/L</h3><small>30D</small></header><strong className={sign(dayPl)}>{money(dayPl, true)}</strong><Spark daily={data.daily} /></section>
          </div>

          {risk && risk.initial > 0 && <div className="row2">
            <RiskCard title="Daily Loss" loss={dayLoss} limitPct={risk.daily_pct} initial={risk.initial} worst={Math.max(risk.worst_day, dayLoss)} worstD={dayLoss > risk.worst_day ? today ?? null : risk.worst_day_d}
              sub={`reset ${String(risk.reset).padStart(2, "0")}:00`} money={money} />
            <RiskCard title="Max Loss" loss={maxLoss} limitPct={risk.max_pct} initial={risk.initial} worst={Math.max(risk.worst_max, maxLoss)} worstD={maxLoss > risk.worst_max ? today ?? null : risk.worst_max_d}
              sub={`start ${money(risk.initial, false, 0)}`} money={money} />
          </div>}

          <div className="chips">
            <div className="chip"><Signal /><span><small>Regime</small><b>{regime}</b></span></div>
            <div className="chip"><Neural /><span><small>AI Model</small><b>Active {MODEL_NAMES.length - paused}/{MODEL_NAMES.length}</b></span></div>
            <div className="chip"><Shield /><span><small>Risk Control</small><b>{ea?.virtual_sl === false ? "Broker SL" : "Virtual SL"}</b></span></div>
            <div className="chip"><Clock /><span><small>Session</small><b>{ea?.session ?? "03:00-23:00"}</b></span></div>
          </div>

          <section className="card pos-card">
            <header><h2><Layers /> OPEN POSITIONS</h2><span>{positions.length} live</span></header>
            <div className="scroll"><table>
              <thead><tr><th>MODEL</th><th>SIDE</th><th>LOTS</th><th>OPEN PRICE</th><th className="rt">P/L</th></tr></thead>
              <tbody>{positions.length ? positions.map((p) => (
                <tr key={p.ticket}><td className="code">{modelCode(p.magic % 1000)}</td><td className={p.type === 0 ? "pos" : "neg"}>{p.type === 0 ? "BUY" : "SELL"}</td>
                  <td>{p.volume.toFixed(2)}</td><td>{p.open_price.toFixed(2)}</td><td className={`rt ${sign(p.profit)}`}>{money(p.profit, true)}</td></tr>
              )) : <tr><td colSpan={5} className="none">- no open positions -</td></tr>}</tbody>
            </table></div>
          </section>
          <Calendar daily={data.daily} money={money} today={today} />
          <Monthly monthly={data.monthly} money={money} balance={balance} today={today} />
        </div>

        <div className="center">
          <NeuralCore states={states} side={side} />
          <ChartBot market={state?.market} positions={positions} floating={floating} money={money} ai={data.analysis} aiState={data.ai_status} acc={data.ai_accuracy} notes={data.ai_notes} cot={data.cot} />
        </div>

        <div className="right">
          <section className="card rank-card">
            <header><h2><AiChip /> RANKING MODEL</h2><span>all time &nbsp; {data.ranking.length} models</span></header>
            <div className="scroll"><table>
              <thead><tr><th>RANK</th><th>MODEL</th><th>TRADES</th><th>WIN</th><th>PF</th><th /><th className="rt">P/L</th></tr></thead>
              <tbody>{data.ranking.length ? data.ranking.map((r, i) => {
                const st = states.get(r.model) ?? 0;
                return <tr key={r.model} className={i === 0 ? "top1" : ""} style={{ "--i": i } as React.CSSProperties}><td><span className={`rank r${i + 1}`}>{i + 1}</span></td><td className="code">{modelCode(r.model)}{st !== 0 && <em className={st > 0 ? "tagy" : "tagr"}>{st > 0 ? "x2" : "STOP"}</em>}</td>
                  <td>{r.trades}</td><td>{Math.round((r.wins / r.trades) * 100)}%</td>
                  <td className={`pf ${r.pf === null ? "pos" : (r.pf ?? 0) >= 1.5 ? "pos" : (r.pf ?? 0) < 1 ? "neg" : ""}`} title="Profit factor: gross profit / gross loss of closed trades">{r.pf === null ? "∞" : (r.pf ?? 0).toFixed(2)}</td>
                  <td className="bar"><span className={r.pl >= 0 ? "up" : "down"} style={{ width: `${(Math.abs(r.pl) / peakPl) * 100}%` }} /></td><td className={`rt ${sign(r.pl)}`}>{money(r.pl, true)}</td></tr>;
              }) : <tr><td colSpan={7} className="none">ยังไม่มีไม้ที่ปิดแล้ว</td></tr>}</tbody>
            </table></div>
          </section>
          <Live market={state?.market} marks={data.marks ?? []} />
          <NewsPanel news={state?.market?.news} filter={ea?.news_filter} />
          <Monitor sys={ea?.sys} alive={eaOn} />
          <section className="card dev"><span className="avatar"><Person /></span><div className="acctinfo">
            <small><em>Login :</em> {account.login}{account.is_demo ? " (Demo)" : ""}</small>
            <b title={account.company}><em>Broker :</em> {account.company || "-"}</b>
            <span title={account.server}><em>Server :</em> {account.server}</span></div>
            <nav className="devlinks" aria-label="Developer profiles"><DevLink url={MYFXBOOK_URL} label="Myfxbook" icon={<ChartSmall />} /><DevLink url={MQL5_URL} label="MQL5" icon={<Code />} /></nav></section>
        </div>
      </main>
      <footer className="status"><span className="dot" /><b>TrendX Ultimate AI Pro</b>

        <span>Server Time : {state?.server_time?.replaceAll("-", ".") ?? "-"}</span><span className={state && state.age > 30 ? "neg" : ""}>Updated : {state ? `${state.age}s ago` : "-"}</span>{error && <span className="neg">{error}</span>}
        {data.online !== null && <span className="online"><Eye /> Space Viewing : {data.online}</span>}
        <button type="button" className="logout" onClick={logout}><Logout /> Logout</button>
        {canFull && <button type="button" className="fullbtn" onClick={toggleFull} aria-label={full ? "Exit full screen" : "Full screen"} title={full ? "Exit full screen" : "Full screen"}>{full ? <Shrink /> : <Expand />}</button>}</footer>
      {hint && <button type="button" className="fullhint" onClick={() => setHint(false)}>เบราว์เซอร์นี้เปิดเต็มจอจากปุ่มไม่ได้ บน iPhone ให้กด Share แล้วเลือก Add to Home Screen จากนั้นเปิดจากไอคอนบนหน้าจอหลัก</button>}
    </div>
  );
}
