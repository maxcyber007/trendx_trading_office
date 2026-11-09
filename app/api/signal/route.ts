import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { latestSignal } from "@/lib/analysis";

export const dynamic = "force-dynamic";

// same key as /api/ingest: only the bridge service reads the AI signal
const keyOk = (got: string | null) => {
  const want = Buffer.from(process.env.INGEST_API_KEY ?? ""), have = Buffer.from(got ?? "");
  return want.length > 0 && want.length === have.length && timingSafeEqual(want, have);
};

// GET /api/signal?symbol=XAUUSD -> the newest joint AI signal (buy / sell / wait) and the H1 bar it belongs to.
// bar_time is the open of the H1 bar the signal is for (the next bar after the 10-minutes-before-close report),
// in broker server time as sent by the bridge, so the EA can match it to its own H1 bar.
export async function GET(req: NextRequest) {
  if (!keyOk(req.headers.get("x-api-key"))) return NextResponse.json({ error: "bad key" }, { status: 401 });
  const symbol = req.nextUrl.searchParams.get("symbol") ?? "";
  if (!/^[A-Za-z0-9._#-]{1,32}$/.test(symbol)) return NextResponse.json({ error: "bad symbol" }, { status: 400 });
  try {
    return NextResponse.json({ signal: await latestSignal(symbol) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "database unavailable" }, { status: 503 });
  }
}
