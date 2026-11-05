import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { COOKIE, makeSession, maxAge } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  const want = Buffer.from(process.env.DASHBOARD_PASSWORD ?? "");
  const got = Buffer.from(String(password ?? ""));
  if (!want.length || want.length !== got.length || !timingSafeEqual(want, got))
    return NextResponse.json({ error: "wrong password" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await makeSession(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge, path: "/" });
  return res;
}
