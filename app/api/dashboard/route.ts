import { NextRequest, NextResponse } from "next/server";
import { aiAccuracy, aiStatus, latestAnalysis } from "@/lib/analysis";
import { latestNotes } from "@/lib/notes";
import { latestCot } from "@/lib/cot";
import { read } from "@/lib/db";
import { onlineUsers } from "@/lib/presence";
import { COOKIE, sessionAccount } from "@/lib/session";

export const dynamic = "force-dynamic";
// same rules as the EA panel: every deal of the EA's symbol adds to P/L, commissions on entry included;
// only closing deals count as trades; deposits and withdrawals (types 2, 3) are never profit
const PL = "(profit + swap + commission)";
const OURS = `deal_type IN (0,1) AND symbol = COALESCE((SELECT ea_state->>'symbol' FROM account_state WHERE account_id=$1), symbol)`;
const OUT = "entry IN (1,3)";
// prop-firm loss limits (FTMO 2-Step by default), measured on the whole account like the firm does:
// daily loss = balance at the day reset (server hour RISK_RESET_HOUR) minus equity, max loss = initial capital minus equity,
// both as a share of the initial capital (deposits, plus the balance before the first deal the bridge sent)
const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
const RISK = { daily: num(process.env.RISK_DAILY_PCT, 5), max: num(process.env.RISK_MAX_PCT, 10), reset: Math.trunc(num(process.env.RISK_RESET_HOUR, 0)) };
// samples are stored in UTC; the server clock offset comes from the latest snapshot (the bridge sends TimeTradeServer)
const RISK_SQL = `
WITH a AS (SELECT balance::float bal, server_time now_s, make_interval(hours => $2::int) rh,
             make_interval(hours => round(extract(epoch FROM server_time - (updated_at AT TIME ZONE 'UTC')) / 3600)::int) o
           FROM account_state WHERE account_id=$1),
d AS (SELECT ticket, deal_time t, deal_type, (profit + swap + commission)::float pl FROM deals WHERE account_id=$1),
k AS (SELECT (SELECT bal FROM a) - COALESCE(sum(pl), 0) k, COALESCE(sum(pl) FILTER (WHERE deal_type NOT IN (0,1)), 0) cash FROM d),
run AS (SELECT ticket, t, deal_type, pl, date_trunc('day', t - (SELECT rh FROM a)) dy,
          sum(pl) OVER (ORDER BY t, ticket ROWS UNBOUNDED PRECEDING) + (SELECT k FROM k) bal FROM d),
dd AS (SELECT dy, max(start) - min(bal) FILTER (WHERE deal_type IN (0,1)) loss, min(bal) FILTER (WHERE deal_type IN (0,1)) low FROM
        (SELECT dy, deal_type, bal, first_value(bal - pl) OVER (PARTITION BY dy ORDER BY t, ticket) start FROM run) x GROUP BY dy),
s AS (SELECT date_trunc('day', (bucket AT TIME ZONE 'UTC') + a.o - a.rh) dy, min(equity)::float low FROM equity_samples, a WHERE account_id=$1 GROUP BY 1),
sd AS (SELECT dy, COALESCE((SELECT bal FROM run WHERE run.t < s.dy + (SELECT rh FROM a) ORDER BY t DESC, ticket DESC LIMIT 1), (SELECT k FROM k)) - low loss, low FROM s),
w AS (SELECT dy, loss, low FROM dd UNION ALL SELECT dy, loss, low FROM sd)
SELECT (SELECT k + cash FROM k) initial,
  COALESCE((SELECT sum(pl) FROM d, a WHERE deal_type IN (0,1) AND t >= date_trunc('day', a.now_s - a.rh) + a.rh), 0)::float today,
  (SELECT to_char(dy, 'YYYY-MM-DD') FROM w WHERE loss IS NOT NULL ORDER BY loss DESC LIMIT 1) worst_day_d,
  COALESCE((SELECT max(loss) FROM w), 0)::float worst_day,
  (SELECT to_char(dy, 'YYYY-MM-DD') FROM w WHERE low IS NOT NULL ORDER BY low LIMIT 1) worst_max_d,
  (SELECT min(low) FROM w)::float low`;

export async function GET(req: NextRequest) {
  // the account always comes from the signed login cookie, never from the request
  const who = await sessionAccount(req.cookies.get(COOKIE)?.value);
  if (!who) return NextResponse.json({ error: "login required" }, { status: 401 });

  try {
    const [row] = await read<{ id: string }>(`SELECT id FROM accounts WHERE login=$1 AND server=$2`, [who.login, who.server]);
    if (!row) return NextResponse.json({ error: "login required" }, { status: 401 });
    const q = (sql: string) => read<Record<string, any>>(sql, [row.id]);
    const [online, acc, state, recent30, daily, monthly, ranking, dd, marks, pfs] = await Promise.all([
      onlineUsers(req.headers.get("x-visitor"), row.id),
      q(`SELECT id,login,server,company,currency,is_demo,name FROM accounts WHERE id=$1`),
      q(`SELECT balance::float, equity::float, margin::float, to_char(server_time,'YYYY-MM-DD HH24:MI:SS') server_time, ea_alive, ea_state, positions, market,
           EXTRACT(EPOCH FROM now()-updated_at)::int age FROM account_state WHERE account_id=$1`),
      q(`SELECT count(*)::int trades, count(*) FILTER (WHERE ${PL}>0)::int wins, count(*) FILTER (WHERE ${PL}<=0)::int losses
         FROM deals WHERE account_id=$1 AND ${OURS} AND ${OUT}
           AND deal_time >= (SELECT server_time FROM account_state WHERE account_id=$1) - interval '30 days'`),
      q(`SELECT to_char(deal_time,'YYYY-MM-DD') d, sum(${PL})::float pl, count(*) FILTER (WHERE ${OUT})::int n
         FROM deals WHERE account_id=$1 AND ${OURS} GROUP BY 1 ORDER BY 1`),
      q(`SELECT to_char(deal_time,'YYYY-MM') m,
           COALESCE(sum(${PL}) FILTER (WHERE ${OURS}),0)::float pl,
           count(*) FILTER (WHERE ${OURS} AND ${OUT})::int n,
           sum(${PL})::float all_change,
           COALESCE(sum(profit) FILTER (WHERE deal_type NOT IN (0,1)),0)::float cash
         FROM deals WHERE account_id=$1 GROUP BY 1 ORDER BY 1`),
      q(`SELECT model, count(*) FILTER (WHERE ${OUT})::int trades, count(*) FILTER (WHERE ${OUT} AND ${PL}>0)::int wins, sum(${PL})::float pl
         FROM deals WHERE account_id=$1 AND ${OURS} GROUP BY model HAVING count(*) FILTER (WHERE ${OUT})>0 ORDER BY pl DESC`),
      q(`SELECT COALESCE(max(1 - equity/NULLIF(peak,0)),0)::float dd, COALESCE(max(peak-equity),0)::float amount, COALESCE(max(peak),0)::float peak FROM
         (SELECT equity, max(equity) OVER (ORDER BY bucket) peak FROM equity_samples WHERE account_id=$1) x`),
      q(`SELECT EXTRACT(EPOCH FROM deal_time)::bigint t, deal_type, price::float FROM deals
         WHERE account_id=$1 AND ${OURS} AND entry=0 ORDER BY deal_time DESC LIMIT 200`),
      // profit factor per model over closed positions: each position's deals (entry commission included) netted first
      q(`SELECT model, COALESCE(sum(net) FILTER (WHERE net > 0), 0)::float gp, COALESCE(-sum(net) FILTER (WHERE net < 0), 0)::float gl FROM
         (SELECT max(model) model, sum(${PL}) net FROM deals WHERE account_id=$1 AND ${OURS}
          GROUP BY position_id HAVING count(*) FILTER (WHERE ${OUT}) > 0) p GROUP BY model`),
    ]);
    const [rk] = await read<Record<string, any>>(RISK_SQL, [row.id, RISK.reset]);
    const risk = rk && state[0] ? { daily_pct: RISK.daily, max_pct: RISK.max, reset: RISK.reset, initial: rk.initial, today: rk.today,
      worst_day: Math.max(0, rk.worst_day), worst_day_d: rk.worst_day_d, worst_max: rk.low === null ? 0 : Math.max(0, rk.initial - rk.low), worst_max_d: rk.worst_max_d } : null;
    const pf = new Map(pfs.map((r) => [r.model, r.gl > 0 ? r.gp / r.gl : r.gp > 0 ? null : 0]));
    for (const r of ranking) r.pf = pf.has(r.model) ? pf.get(r.model) : 0;   // null = no losing trade yet
    const sym = state[0]?.market?.symbol;
    const [analysis, ai_status, ai_accuracy, ai_notes, cot] = await Promise.all([latestAnalysis(sym), aiStatus(sym), aiAccuracy(sym), latestNotes(sym), latestCot()]);
    return NextResponse.json({ online, account: acc[0], state: state[0] ?? null, last30: recent30[0], daily, monthly, ranking, dd: dd[0], marks, analysis, ai_status, ai_accuracy, ai_notes, cot, risk });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "database unavailable" }, { status: 503 });
  }
}
