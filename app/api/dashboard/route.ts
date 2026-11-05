import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
// closed-trade result of a deal row; deposits and withdrawals (types 2, 3) are not trading results
const PL = "(profit + swap + commission)";
const TRADE = "deal_type IN (0,1) AND entry IN (1,2,3)";

export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("account"));
  if (!id) return NextResponse.json({ error: "account required" }, { status: 400 });
  const q = (sql: string) => db().query(sql, [id]).then((r) => r.rows);

  const [acc, state, totals, recent30, daily, monthly, ranking, dd, marks] = await Promise.all([
    q(`SELECT id,login,server,company,currency,is_demo,name FROM accounts WHERE id=$1`),
    q(`SELECT balance::float, equity::float, margin::float, to_char(server_time,'YYYY-MM-DD HH24:MI:SS') server_time, ea_alive, ea_state, positions, market,
         EXTRACT(EPOCH FROM now()-updated_at)::int age FROM account_state WHERE account_id=$1`),
    q(`SELECT count(*)::int trades, count(*) FILTER (WHERE ${PL}>0)::int wins, count(*) FILTER (WHERE ${PL}<0)::int losses,
         COALESCE(sum(${PL}),0)::float total,
         COALESCE(sum(${PL}) FILTER (WHERE ${PL}>0),0)::float gross_win,
         COALESCE(-sum(${PL}) FILTER (WHERE ${PL}<0),0)::float gross_loss
       FROM deals WHERE account_id=$1 AND ${TRADE}`),
    q(`SELECT count(*)::int trades, count(*) FILTER (WHERE ${PL}>0)::int wins, count(*) FILTER (WHERE ${PL}<0)::int losses
       FROM deals WHERE account_id=$1 AND ${TRADE} AND deal_time > (SELECT max(deal_time) FROM deals WHERE account_id=$1) - interval '30 days'`),
    q(`SELECT to_char(deal_time,'YYYY-MM-DD') d, sum(${PL})::float pl, count(*)::int n
       FROM deals WHERE account_id=$1 AND ${TRADE} GROUP BY 1 ORDER BY 1`),
    q(`SELECT to_char(deal_time,'YYYY-MM') m, sum(${PL})::float pl, count(*)::int n
       FROM deals WHERE account_id=$1 AND ${TRADE} GROUP BY 1 ORDER BY 1`),
    q(`SELECT model, count(*)::int trades, count(*) FILTER (WHERE ${PL}>0)::int wins, sum(${PL})::float pl
       FROM deals WHERE account_id=$1 AND ${TRADE} GROUP BY model ORDER BY pl DESC`),
    q(`SELECT COALESCE(max(1 - equity/NULLIF(peak,0)),0)::float dd, COALESCE(max(peak-equity),0)::float amount, COALESCE(max(peak),0)::float peak FROM
       (SELECT equity, max(equity) OVER (ORDER BY bucket) peak FROM equity_samples WHERE account_id=$1) x`),
    q(`SELECT EXTRACT(EPOCH FROM deal_time)::bigint t, deal_type, price::float FROM deals
       WHERE account_id=$1 AND deal_type IN (0,1) AND entry=0 ORDER BY deal_time DESC LIMIT 200`),
  ]);
  if (!acc.length) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ account: acc[0], state: state[0] ?? null, totals: totals[0], last30: recent30[0], daily, monthly, ranking, dd: dd[0], marks });
}
