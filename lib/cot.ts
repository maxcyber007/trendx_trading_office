import { db, read } from "./db";

// CFTC Commitments of Traders for COMEX gold futures (market code 088691), disaggregated futures-only report from the
// CFTC public API (free, no key). Weekly: positions as of Tuesday, published Friday. We keep the Managed Money group
// (hedge funds / CTAs): their net long position, its weekly change, its share of open interest and where it sits in its
// own 52-week range. It is weekly background for the AI, not a timing tool.
const URL = "https://publicreporting.cftc.gov/resource/72hh-3qpy.json";
const MARKET = "088691";
const REFRESH_MS = 6 * 3_600_000;   // look for a new report every 6 hours (from the bridge's sends)

export type Cot = { date: string; net: number; change: number; oi: number; pct: number; index: number; long: number; short: number };

let ready: Promise<unknown> | null = null;
const table = () => (ready ??= db().query(
  `CREATE TABLE IF NOT EXISTS cot_gold (
     report_date DATE PRIMARY KEY, mm_long INT NOT NULL, mm_short INT NOT NULL,
     mm_long_chg INT, mm_short_chg INT, oi INT, oi_chg INT, fetched_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
).catch((e) => { ready = null; throw e; }));

let nextLook = 0;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : null; };

// fetch the last 60 weekly reports and upsert them; at most every 6 hours per server instance
export async function refreshCot(): Promise<void> {
  if (Date.now() < nextLook) return;
  nextLook = Date.now() + REFRESH_MS;
  try {
    await table();
    const [last] = await read<{ age: number }>(`SELECT EXTRACT(EPOCH FROM now() - max(fetched_at))::float age FROM cot_gold`);
    if (last?.age != null && last.age * 1000 < REFRESH_MS) return;   // another instance did it lately
    const q = `?cftc_contract_market_code=${MARKET}&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=60`;
    const res = await fetch(URL + q, { signal: AbortSignal.timeout(20_000), headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`CFTC ${res.status}`);
    const rows = (await res.json()) as Record<string, unknown>[];
    for (const r of rows) {
      const date = String(r.report_date_as_yyyy_mm_dd ?? "").slice(0, 10), long = num(r.m_money_positions_long_all), short = num(r.m_money_positions_short_all);
      if (!/^\d{4}-\d\d-\d\d$/.test(date) || long == null || short == null) continue;
      await db().query(
        `INSERT INTO cot_gold (report_date, mm_long, mm_short, mm_long_chg, mm_short_chg, oi, oi_chg) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (report_date) DO UPDATE SET mm_long=$2, mm_short=$3, mm_long_chg=$4, mm_short_chg=$5, oi=$6, oi_chg=$7, fetched_at=now()`,
        [date, long, short, num(r.change_in_m_money_long_all), num(r.change_in_m_money_short_all), num(r.open_interest_all), num(r.change_in_open_interest_all)]);
    }
    // a successful pass with no rows still marks the time, so a quiet API is not asked again for 6 hours
    if (!rows.length) await db().query(`UPDATE cot_gold SET fetched_at = now() WHERE report_date = (SELECT max(report_date) FROM cot_gold)`);
  } catch (e) {
    console.error("cot refresh", String(e));
    nextLook = Date.now() + 30 * 60_000;   // try again in half an hour
  }
}

// the newest report, with the net position's place in the last 52 weekly values (0 = lowest, 100 = highest)
export async function latestCot(): Promise<Cot | null> {
  try {
    await table();
    const rows = await read<{ d: string; l: number; s: number; lc: number | null; sc: number | null; oi: number | null }>(
      `SELECT to_char(report_date, 'YYYY-MM-DD') d, mm_long l, mm_short s, mm_long_chg lc, mm_short_chg sc, oi FROM cot_gold
       ORDER BY report_date DESC LIMIT 52`);
    if (!rows.length) return null;
    const nets = rows.map((r) => r.l - r.s), net = nets[0], lo = Math.min(...nets), hi = Math.max(...nets), r = rows[0];
    return {
      date: r.d, net, long: r.l, short: r.s,
      change: r.lc != null && r.sc != null ? r.lc - r.sc : rows.length > 1 ? net - nets[1] : 0,
      oi: r.oi ?? 0, pct: r.oi ? Math.round((net / r.oi) * 1000) / 10 : 0,
      index: hi > lo ? Math.round(((net - lo) / (hi - lo)) * 100) : 50,
    };
  } catch (e) {
    console.error("latest cot", String(e));
    return null;
  }
}
