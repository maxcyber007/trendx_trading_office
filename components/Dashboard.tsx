"use client";
import { useEffect, useMemo, useState } from "react";
import { MODEL_NAMES, modelCode } from "@/lib/models";
import NeuralCore from "./NeuralCore";

type Account = { id: string; login: string; server: string; company: string; currency: string; is_demo: boolean };
type Position = { ticket: number; symbol: string; type: number; magic: number; volume: number; open_price: number; profit: number };
type News = { t: number; name: string; cur: string; imp: number; act: string; fc: string };
type Market = { symbol: string; candles: [number, number, number, number, number][]; vol_ratio: number; news: News[] };
type Data = {
  account: Account;
  state: { balance: number; equity: number; server_time: string; ea_alive: boolean; age: number; positions: Position[]; market: Market | null;
    ea_state: { version?: string; symbol?: string; magic?: number; virtual_sl?: boolean; session?: string; models?: { no: number; state: number }[] } | null } | null;
  totals: { trades: number; wins: number; losses: number; total: number; gross_win: number; gross_loss: number };
  last30: { trades: number; wins: number; losses: number };
  daily: { d: string; pl: number; n: number }[];
  monthly: { m: string; pl: number; n: number }[];
  ranking: { model: number; trades: number; wins: number; pl: number }[];
  dd: { dd: number; amount: number; peak: number };
};
type Money = (v: number, plus?: boolean) => string;

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const sign = (v: number) => (v > 0 ? "pos" : v < 0 ? "neg" : "");

function Ring({ value }: { value: number }) {
  const c = 2 * Math.PI * 30;
  return (
    <svg className="ring" viewBox="0 0 76 76" role="img" aria-label={`Win rate ${value}%`}>
      <circle cx="38" cy="38" r="30" className="track" />
      <circle cx="38" cy="38" r="30" className="fill" strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 38 38)" />
      <text x="38" y="44" textAnchor="middle">{value}%</text>
    </svg>
  );
}

function Spark({ daily }: { daily: Data["daily"] }) {
  const pts = useMemo(() => { let s = 0; return daily.slice(-30).map((x) => (s += x.pl)); }, [daily]);
  if (pts.length < 2) return <svg className="spark" />;
  const lo = Math.min(...pts, 0), hi = Math.max(...pts, 1);
  const xy = pts.map((v, i) => `${(i / (pts.length - 1)) * 200},${46 - ((v - lo) / (hi - lo)) * 42}`);
  return <svg className="spark" viewBox="0 0 200 48" preserveAspectRatio="none" aria-hidden="true"><polygon points={`0,48 ${xy.join(" ")} 200,48`} /><polyline points={xy.join(" ")} /></svg>;
}

function Calendar({ daily, money }: { daily: Data["daily"]; money: Money }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const days = useMemo(() => new Map(daily.map((x) => [x.d, x])), [daily]);
  const [y, m] = month.split("-").map(Number);
  const first = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;   // Monday first
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const shift = (n: number) => setMonth(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7));
  const inMonth = daily.filter((x) => x.d.startsWith(month));
  const total = inMonth.reduce((s, x) => s + x.pl, 0);
  return (
    <section className="card">
      <header><h2>PROFIT CALENDAR</h2>
        <span className="nav"><button onClick={() => shift(-1)} aria-label="เดือนก่อน">‹</button>{new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" })} {y}<button onClick={() => shift(1)} aria-label="เดือนถัดไป">›</button></span>
        <b className={sign(total)}>Month {money(total, true)}</b></header>
      <div className="cal">
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => <i key={d}>{d}</i>)}
        {Array.from({ length: first }, (_, i) => <span key={`e${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const key = `${month}-${String(i + 1).padStart(2, "0")}`, v = days.get(key);
          return <div key={key} className={`day ${v ? (v.pl >= 0 ? "up" : "down") : ""}`}><small>{i + 1}</small>{v && <b>{money(v.pl, true)}</b>}</div>;
        })}
      </div>
      <p className="note">{inMonth.reduce((s, x) => s + x.n, 0)} trades &nbsp; {inMonth.filter((x) => x.pl >= 0).length} green days &nbsp; {inMonth.filter((x) => x.pl < 0).length} red days</p>
    </section>
  );
}

function Monthly({ monthly, money, balance }: { monthly: Data["monthly"]; money: Money; balance: number }) {
  const year = new Date().getUTCFullYear();
  const rows = MONTHS.map((_, i) => monthly.find((x) => x.m === `${year}-${String(i + 1).padStart(2, "0")}`));
  const vals = rows.map((r) => r?.pl ?? 0), total = vals.reduce((a, b) => a + b, 0), peak = Math.max(...vals.map(Math.abs), 1);
  const base = balance - total;
  return (
    <section className="card">
      <header><h2>MONTHLY P/L <small>{year}</small></h2><b className={sign(total)}>Year {money(total, true)} {base > 0 ? `${total >= 0 ? "+" : ""}${((total / base) * 100).toFixed(1)}%` : ""}</b></header>
      <p className="note">{rows.reduce((s, r) => s + (r?.n ?? 0), 0)} trades &nbsp; {vals.filter((v) => v > 0).length} green months &nbsp; {vals.filter((v) => v < 0).length} red months</p>
      <div className="bars">{vals.map((v, i) => (
        <div key={i} title={money(v, true)}><div className="half up">{v > 0 && <span style={{ height: `${(v / peak) * 100}%` }} />}</div>
          <div className="half down">{v < 0 && <span style={{ height: `${(-v / peak) * 100}%` }} />}</div><small>{MONTHS[i]}</small></div>
      ))}</div>
    </section>
  );
}

function Live({ market }: { market: Market | null | undefined }) {
  if (!market?.candles?.length) return <section className="card"><header><h2><span className="dot" />LIVE</h2></header><p className="none">รอข้อมูลกราฟจาก MT5</p></section>;
  const c = market.candles, last = c[c.length - 1];
  const hi = Math.max(...c.map((x) => x[2])), lo = Math.min(...c.map((x) => x[3])), Y = (p: number) => 6 + ((hi - p) / (hi - lo || 1)) * 128;
  const change = ((last[4] - last[1]) / last[1]) * 100, w = 300 / c.length;
  return (
    <section className="card">
      <header><h2><span className="dot" />LIVE <small>{market.symbol} H1</small></h2><b className={sign(change)}>{last[4].toFixed(2)} <small>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</small></b></header>
      <svg className="candles" viewBox="0 0 340 140" role="img" aria-label="H1 price chart">
        <line className="px" x1="0" x2="300" y1={Y(last[4])} y2={Y(last[4])} />
        {c.map((k, i) => { const up = k[4] >= k[1], x = i * w + w / 2; return (
          <g key={k[0]} className={up ? "cu" : "cd"}><line x1={x} x2={x} y1={Y(k[2])} y2={Y(k[3])} /><rect x={x - w * 0.32} y={Math.min(Y(k[1]), Y(k[4]))} width={w * 0.64} height={Math.max(1, Math.abs(Y(k[1]) - Y(k[4])))} /></g>); })}
        <text x="338" y="12" textAnchor="end">{hi.toFixed(2)}</text>
        <text x="338" y="136" textAnchor="end">{lo.toFixed(2)}</text>
      </svg>
    </section>
  );
}

function NewsPanel({ news }: { news: News[] | undefined }) {
  const time = (t: number) => new Date(t * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
  return (
    <section className="card">
      <header><h2>ECONOMIC NEWS</h2></header>
      <div className="scroll short"><table>
        <thead><tr><th>Time</th><th>Cur</th><th>Event</th><th>Act / Fcst</th></tr></thead>
        <tbody>{news?.length ? news.map((n) => <tr key={`${n.t}${n.name}`}><td className="pos">{time(n.t)}</td><td className="code">{n.cur}</td><td className="wrap-text">{n.name}</td><td>{n.act || "-"} / {n.fc || "-"}</td></tr>)
          : <tr><td colSpan={4} className="none">วันนี้ไม่มีข่าวสำคัญ</td></tr>}</tbody>
      </table></div>
      <p className="note">times in GMT+7</p>
    </section>
  );
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [id, setId] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then((a: Account[]) => {
      setAccounts(a);
      const saved = localStorage.getItem("trendx_account");
      setId(a.some((x) => x.id === saved) ? saved! : a[0]?.id ?? "");
    }).catch(() => setError("โหลดรายชื่อบัญชีไม่ได้"));
  }, []);

  useEffect(() => {
    if (!id) return;
    localStorage.setItem("trendx_account", id);
    let live = true;
    const load = () => fetch(`/api/dashboard?account=${id}`).then((r) => r.json())
      .then((d) => { if (live) { setData(d); setError(""); } }).catch(() => live && setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้"));
    load();
    const t = setInterval(load, 10000);
    return () => { live = false; clearInterval(t); };
  }, [id]);

  if (error && !data) return <main className="empty">{error}</main>;
  if (!accounts.length) return <main className="empty">ยังไม่มีบัญชีส่งข้อมูลเข้ามา เปิด TrendX Cloud Bridge ใน MT5 ก่อน</main>;
  if (!data?.account) return <main className="empty">กำลังโหลด...</main>;

  const { account, state, last30 } = data;
  const cur = account.currency === "USC" ? "¢" : account.currency === "USD" ? "$" : `${account.currency} `;
  const money: Money = (v, plus = false) => `${plus && v > 0 ? "+" : v < 0 ? "-" : ""}${cur}${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const online = !!state && state.age < 180, eaOn = online && state!.ea_alive;
  const positions = state?.positions ?? [];
  const floating = positions.reduce((s, p) => s + p.profit, 0);
  const balance = state?.balance ?? 0, equity = state?.equity ?? 0;
  const states = new Map((state?.ea_state?.models ?? []).map((m) => [m.no, m.state]));
  const paused = [...states.values()].filter((s) => s < 0).length;
  const wr = last30.trades ? Math.round((last30.wins / last30.trades) * 100) : 0;
  const today = state?.server_time?.slice(0, 10), dayPl = data.daily.find((x) => x.d === today)?.pl ?? 0;
  const ddNow = Math.max(0, data.dd.peak - equity), ddPct = data.dd.peak > 0 ? (ddNow / data.dd.peak) * 100 : 0;
  const ratio = state?.market?.vol_ratio ?? 1;
  const regime = ratio > 1.3 ? "High Vol" : ratio < 0.7 ? "Low Vol" : "Normal";
  const side = Math.sign(positions.reduce((s, p) => s + (p.type === 0 ? p.volume : -p.volume), 0));
  const peakPl = Math.max(...data.ranking.map((r) => Math.abs(r.pl)), 1);

  return (
    <div className="page">
      <main className="layout">
        <div className="left">
          <header className="brand">
            <span className="logo" aria-hidden="true">▲</span>
            <div><h1>TrendX <em>Ultimate AI Pro</em></h1><p>Smart Trading &nbsp;•&nbsp; Smarter Decisions</p></div>
            <span className="ai">AI</span>
          </header>
          <select aria-label="เลือกบัญชี" value={id} onChange={(e) => setId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.login} · {a.company || a.server}{a.is_demo ? " (Demo)" : ""}</option>)}
          </select>

          <div className="row4">
            <section className="card run">
              <h3 className={eaOn ? "pos" : "neg"}>{eaOn ? "EA Running" : online ? "EA Offline" : "Terminal Offline"}</h3>
              <dl><dt>Symbol</dt><dd>{state?.ea_state?.symbol ?? "-"}</dd><dt>Timeframe</dt><dd>H1 (engine)</dd><dt>Magic</dt><dd>{state?.ea_state?.magic ?? "-"}xxx</dd></dl>
            </section>
            <section className="card stat"><h3>Balance</h3><strong>{money(balance)}</strong><small>{account.currency}</small></section>
            <section className="card stat"><h3>Equity</h3><strong>{money(equity)}</strong><small className={sign(floating)}>{money(floating, true)} ({balance ? ((floating / balance) * 100).toFixed(2) : "0.00"}%)</small></section>
            <section className="card stat"><h3>Profit</h3><strong className={sign(floating)}>{money(floating, true)}</strong><small>{positions.length} positions</small></section>
          </div>

          <div className="row3">
            <section className="card trades"><Ring value={wr} />
              <dl><dt>Total Trades</dt><dd>{last30.trades}</dd><dt className="pos">Win Trades</dt><dd className="pos">{last30.wins}</dd><dt className="cyan">Loss Trades</dt><dd className="neg">{last30.losses}</dd></dl>
              <small>last 30 days</small></section>
            <section className="card"><header><h3>Drawdown</h3><small>{money(ddNow)}</small></header><strong>{ddPct.toFixed(2)}%</strong>
              <div className="meter"><span style={{ width: `${Math.min(100, ddPct)}%` }} /></div><small>Max {(data.dd.dd * 100).toFixed(1)}% &nbsp; {money(data.dd.amount)}</small></section>
            <section className="card"><header><h3>Daily P/L</h3><small>30D</small></header><strong className={sign(dayPl)}>{money(dayPl, true)}</strong><Spark daily={data.daily} /></section>
          </div>

          <div className="chips">
            <div className="chip"><small>Regime</small><b>{regime}</b></div>
            <div className="chip"><small>AI Model</small><b>Active {MODEL_NAMES.length - paused}/{MODEL_NAMES.length}</b></div>
            <div className="chip"><small>Risk Control</small><b>{state?.ea_state?.virtual_sl === false ? "Broker SL" : "Virtual SL"}</b></div>
            <div className="chip"><small>Session</small><b>{state?.ea_state?.session ?? "03:00-23:00"}</b></div>
          </div>

          <section className="card">
            <header><h2>OPEN POSITIONS</h2><span>{positions.length} live</span></header>
            <div className="scroll"><table>
              <thead><tr><th>Model</th><th>Side</th><th>Lots</th><th>Open Price</th><th>P/L</th></tr></thead>
              <tbody>{positions.length ? positions.map((p) => (
                <tr key={p.ticket}><td className="code">{modelCode(p.magic % 1000)}</td><td className={p.type === 0 ? "pos" : "neg"}>{p.type === 0 ? "BUY" : "SELL"}</td>
                  <td>{p.volume.toFixed(2)}</td><td>{p.open_price.toFixed(2)}</td><td className={sign(p.profit)}>{money(p.profit, true)}</td></tr>
              )) : <tr><td colSpan={5} className="none">- no open positions -</td></tr>}</tbody>
            </table></div>
          </section>
          <Calendar daily={data.daily} money={money} />
          <Monthly monthly={data.monthly} money={money} balance={balance} />
        </div>

        <div className="center">
          <NeuralCore states={states} side={side} />
          <div className="models">{MODEL_NAMES.map((name, i) => {
            const st = states.get(i + 1) ?? 0;
            return <div key={name} className={`node ${st > 0 ? "boost" : st < 0 ? "stop" : ""}`}><b>{modelCode(i + 1)}</b><span>{name}</span>{st !== 0 && <em>{st > 0 ? "x2" : "STOP"}</em>}</div>;
          })}</div>
        </div>

        <div className="right">
          <section className="card">
            <header><h2>RANKING MODEL</h2><span>all time &nbsp; {data.ranking.length} models</span></header>
            <div className="scroll"><table>
              <thead><tr><th>Rank</th><th>Model</th><th>Trades</th><th>Win</th><th /><th>P/L</th></tr></thead>
              <tbody>{data.ranking.length ? data.ranking.map((r, i) => {
                const st = states.get(r.model) ?? 0;
                return <tr key={r.model}><td><span className={`rank r${i + 1}`}>{i + 1}</span></td><td className="code">{modelCode(r.model)}{st !== 0 && <em className={st > 0 ? "tagy" : "tagr"}>{st > 0 ? "x2" : "STOP"}</em>}</td>
                  <td>{r.trades}</td><td>{Math.round((r.wins / r.trades) * 100)}%</td>
                  <td className="bar"><span className={r.pl >= 0 ? "up" : "down"} style={{ width: `${(Math.abs(r.pl) / peakPl) * 100}%` }} /></td><td className={sign(r.pl)}>{money(r.pl, true)}</td></tr>;
              }) : <tr><td colSpan={6} className="none">ยังไม่มีไม้ที่ปิดแล้ว</td></tr>}</tbody>
            </table></div>
          </section>
          <Live market={state?.market} />
          <NewsPanel news={state?.market?.news} />
          <section className="card">
            <header><h2>SYSTEM MONITOR</h2><span className={online ? "pill" : "pill off"}>{online ? "ONLINE" : "OFFLINE"}</span></header>
            <dl className="mon"><dt>Last update</dt><dd>{state ? `${state.age}s ago` : "-"}</dd><dt>EA version</dt><dd>{state?.ea_state?.version ?? "-"}</dd><dt>Broker</dt><dd>{account.company || "-"}</dd><dt>Server</dt><dd>{account.server}</dd><dt>Account</dt><dd>{account.login}{account.is_demo ? " (Demo)" : ""}</dd></dl>
          </section>
          <section className="card dev"><small>DEVELOPED BY</small><b>ANUCHAT RUNGSIYANON</b><span>rungsiyanon@gmail.com</span></section>
        </div>
      </main>
      <footer className="status"><span className="dot" /><b>TrendX Ultimate AI Pro</b><span>Refresh : 10s</span><span>Server Time : {state?.server_time?.replaceAll("-", ".") ?? "-"}</span>{error && <span className="neg">{error}</span>}</footer>
    </div>
  );
}
