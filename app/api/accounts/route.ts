import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const r = await db().query(
    `SELECT a.id, a.login, a.server, a.company, a.currency, a.is_demo, a.name, s.balance, s.equity, s.updated_at
     FROM accounts a LEFT JOIN account_state s ON s.account_id=a.id ORDER BY s.updated_at DESC NULLS LAST`);
  return NextResponse.json(r.rows);
}
