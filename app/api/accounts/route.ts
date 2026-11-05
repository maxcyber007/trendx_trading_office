import { NextResponse } from "next/server";
import { read } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await read(
      `SELECT a.id, a.login, a.server, a.company, a.currency, a.is_demo, a.name, s.balance, s.equity, s.updated_at
       FROM accounts a LEFT JOIN account_state s ON s.account_id=a.id ORDER BY s.updated_at DESC NULLS LAST`));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "database unavailable" }, { status: 503 });
  }
}
