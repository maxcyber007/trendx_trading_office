import { NextRequest, NextResponse } from "next/server";
import { read } from "@/lib/db";
import { COOKIE, makeSession, maxAge } from "@/lib/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const login = String(body?.login ?? "").trim(), server = String(body?.server ?? "");
  if (!/^\d{1,18}$/.test(login)) return NextResponse.json({ error: "unknown account" }, { status: 401 });

  try {
    const found = await read<{ server: string }>(`SELECT server FROM accounts WHERE login=$1 ORDER BY server`, [login]);
    const match = found.filter((a) => !server || a.server === server);
    if (!match.length) return NextResponse.json({ error: "unknown account" }, { status: 401 });
    // the same number can exist at two brokers: the page then asks which one
    if (match.length > 1) return NextResponse.json({ servers: match.map((a) => a.server) }, { status: 409 });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE, await makeSession({ login, server: match[0].server }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge, path: "/" });
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "database unavailable" }, { status: 503 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE);
  return res;
}
