import { NextRequest, NextResponse } from "next/server";
import { read } from "@/lib/db";
import { COOKIE, makeSession, maxAge } from "@/lib/session";

// LOGIN_CODES (Vercel env) gives an account its own sign-in code, e.g. "IC186221911:186221911" (several: comma separated).
// Such an account signs in with its code only; its bare number is refused. Other accounts sign in with their number.
function codes(): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of (process.env.LOGIN_CODES ?? "").split(",")) {
    const [code, acc] = pair.split(":").map((x) => x.trim());
    if (code && acc && /^\d{1,18}$/.test(acc)) map.set(code.toUpperCase(), acc);
  }
  return map;
}
function accountFor(typed: string): string | null {
  const map = codes();
  if (map.has(typed)) return map.get(typed)!;
  if (!/^\d{1,18}$/.test(typed) || [...map.values()].includes(typed)) return null;
  return typed;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const typed = String(body?.login ?? "").replace(/\s/g, "").toUpperCase(), server = String(body?.server ?? "");
  const login = accountFor(typed);
  if (!login) return NextResponse.json({ error: "unknown account" }, { status: 401 });

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
