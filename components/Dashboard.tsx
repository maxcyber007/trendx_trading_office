"use client";
import { useEffect, useMemo, useState } from "react";
import { MODEL_NAMES, modelCode } from "@/lib/models";
import NeuralCore from "./NeuralCore";
import { AiChip, Bars, Calendar as CalIcon, ChartUp, Clock, Coins, Expand, Eye, Layers, Logo, Logout, Neural, Person, Power, Pulse, Shield, Shrink, Signal, Trophy } from "./icons";

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
  ranking: { model: number; trades: number; wins: number; pl: number }[];
  dd: { dd: number; amount: number; peak: number };
  marks: { t: string; deal_type: number; price: number }[];
};
type Money = (v: number, plus?: boolean, digits?: number) => string;

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
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

const BEAT = "l3-3 3 3h4l2 4 3-13 3 13 2-4h5l4-3 4 3H";

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
      <span className="bootcore"><i /><i /><i /><AiChip size={23} /></span>
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
        </div>

        <div className="right">
          <section className="card rank-card">
            <header><h2><AiChip /> RANKING MODEL</h2><span>all time &nbsp; {data.ranking.length} models</span></header>
            <div className="scroll"><table>
              <thead><tr><th>RANK</th><th>MODEL</th><th>TRADES</th><th>WIN</th><th /><th className="rt">P/L</th></tr></thead>
              <tbody>{data.ranking.length ? data.ranking.map((r, i) => {
                const st = states.get(r.model) ?? 0;
                return <tr key={r.model} className={i === 0 ? "top1" : ""} style={{ "--i": i } as React.CSSProperties}><td><span className={`rank r${i + 1}`}>{i + 1}</span></td><td className="code">{modelCode(r.model)}{st !== 0 && <em className={st > 0 ? "tagy" : "tagr"}>{st > 0 ? "x2" : "STOP"}</em>}</td>
                  <td>{r.trades}</td><td>{Math.round((r.wins / r.trades) * 100)}%</td>
                  <td className="bar"><span className={r.pl >= 0 ? "up" : "down"} style={{ width: `${(Math.abs(r.pl) / peakPl) * 100}%` }} /></td><td className={`rt ${sign(r.pl)}`}>{money(r.pl, true)}</td></tr>;
              }) : <tr><td colSpan={6} className="none">ยังไม่มีไม้ที่ปิดแล้ว</td></tr>}</tbody>
            </table></div>
          </section>
          <Live market={state?.market} marks={data.marks ?? []} />
          <NewsPanel news={state?.market?.news} filter={ea?.news_filter} />
          <Monitor sys={ea?.sys} alive={eaOn} />
          <section className="card dev"><span className="avatar"><Person /></span><div><small>DEVELOPED BY</small><b>TRENDX TRADING SPACE</b><span>trendx.cloudsync@gmail.com</span></div></section>
        </div>
      </main>
      <footer className="status"><span className="dot" /><b>TrendX Ultimate AI Pro</b>
        <span>Login : {account.login}{account.is_demo ? " (Demo)" : ""}</span>
        <span className="acct" title={account.company}>Broker : {account.company || "-"}</span><span className="acct" title={account.server}>Server : {account.server}</span>
        <span>Server Time : {state?.server_time?.replaceAll("-", ".") ?? "-"}</span><span className={state && state.age > 30 ? "neg" : ""}>Updated : {state ? `${state.age}s ago` : "-"}</span>{error && <span className="neg">{error}</span>}
        {data.online !== null && <span className="online"><Eye /> Space Viewing : {data.online}</span>}
        <button type="button" className="logout" onClick={logout}><Logout /> Logout</button>
        {canFull && <button type="button" className="fullbtn" onClick={toggleFull} aria-label={full ? "Exit full screen" : "Full screen"} title={full ? "Exit full screen" : "Full screen"}>{full ? <Shrink /> : <Expand />}</button>}</footer>
      {hint && <button type="button" className="fullhint" onClick={() => setHint(false)}>เบราว์เซอร์นี้เปิดเต็มจอจากปุ่มไม่ได้ บน iPhone ให้กด Share แล้วเลือก Add to Home Screen จากนั้นเปิดจากไอคอนบนหน้าจอหลัก</button>}
    </div>
  );
}
