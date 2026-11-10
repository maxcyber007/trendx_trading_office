import { timingSafeEqual } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { analyzeIfDue, scoreSignals } from "@/lib/analysis";
import { db } from "@/lib/db";

// the hourly market commentary runs after the response, inside this function's time limit (a slow model plus its fallback)
export const maxDuration = 120;

type Deal = { ticket: number; position: number; time: number; symbol: string; type: number; entry: number; magic: number;
  volume: number; price: number; commission: number; swap: number; profit: number; comment: string };

const keyOk = (got: string | null) => {
  const want = Buffer.from(process.env.INGEST_API_KEY ?? ""), have = Buffer.from(got ?? "");
  return want.length > 0 && want.length === have.length && timingSafeEqual(want, have);
};
// broker clock as a plain timestamp: MT5 sends it as seconds, already in server time
const serverTime = (s: number) => new Date(s * 1000).toISOString().slice(0, 19).replace("T", " ");

export async function POST(req: NextRequest) {
  if (!keyOk(req.headers.get("x-api-key"))) return NextResponse.json({ error: "bad key" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const a = body?.account, s = body?.snapshot;
  if (!a?.login || !a?.server || !s) return NextResponse.json({ error: "bad payload" }, { status: 400 });

  const c = await db().connect();
  try {
    await c.query("BEGIN");
    const acc = await c.query(
      `INSERT INTO accounts (login, server, company, currency, is_demo, name) VALUES ($1,$2,$3,$4,$5,NULLIF($6,''))
       ON CONFLICT (login, server) DO UPDATE SET company=$3, currency=$4, is_demo=$5, name=COALESCE(NULLIF($6,''),accounts.name) RETURNING id`,
      [a.login, a.server, a.company ?? "", a.currency ?? "USD", !!a.demo, a.name ?? ""]);
    const id = acc.rows[0].id;

    // one statement for the whole batch, so a long history stays well inside the function time limit
    const rows = ((body.deals ?? []) as Deal[]).map((d) => ({ ticket: d.ticket, position_id: d.position, deal_time: serverTime(d.time), symbol: d.symbol,
      deal_type: d.type, entry: d.entry, magic: d.magic, model: d.magic % 1000, volume: d.volume, price: d.price, commission: d.commission, swap: d.swap, profit: d.profit, comment: d.comment }));
    if (rows.length)
      await c.query(
        `INSERT INTO deals (account_id,ticket,position_id,deal_time,symbol,deal_type,entry,magic,model,volume,price,commission,swap,profit,comment)
         SELECT $1,ticket,position_id,deal_time,symbol,deal_type,entry,magic,model,volume,price,commission,swap,profit,comment
         FROM jsonb_to_recordset($2::jsonb) AS x(ticket bigint, position_id bigint, deal_time timestamp, symbol text, deal_type int, entry int, magic bigint,
           model int, volume numeric, price numeric, commission numeric, swap numeric, profit numeric, comment text)
         ON CONFLICT DO NOTHING`,
        [id, JSON.stringify(rows)]);

    await c.query(
      `INSERT INTO account_state (account_id,balance,equity,margin,server_time,ea_alive,ea_state,positions,market,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
       ON CONFLICT (account_id) DO UPDATE SET balance=$2,equity=$3,margin=$4,server_time=$5,ea_alive=$6,
         ea_state=COALESCE($7,account_state.ea_state),positions=$8,market=COALESCE($9,account_state.market),updated_at=now()`,
      [id, s.balance, s.equity, s.margin ?? 0, serverTime(s.server_time), !!s.ea_alive, body.state ? JSON.stringify(body.state) : null, JSON.stringify(body.positions ?? []), body.market ? JSON.stringify(body.market) : null]);

    await c.query(
      `INSERT INTO equity_samples (account_id,bucket,balance,equity)
       VALUES ($1,to_timestamp(floor(extract(epoch from now())/300)*300),$2,$3) ON CONFLICT DO NOTHING`,
      [id, s.balance, s.equity]);
    await c.query("COMMIT");
    // score finished signals against the closed bars first (one quick query), then the commentary when it is due
    if (body.market) after(async () => { await scoreSignals(body.market); await analyzeIfDue(body.market); });
    return NextResponse.json({ ok: true, deals: body.deals?.length ?? 0 });
  } catch (e) {
    await c.query("ROLLBACK");
    console.error(e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  } finally {
    c.release();
  }
}
