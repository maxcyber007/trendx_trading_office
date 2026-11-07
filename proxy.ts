import { NextRequest, NextResponse } from "next/server";
import { COOKIE, sessionAccount } from "@/lib/session";

// every page and API needs the login, except the login itself and the key-protected ingest
export async function proxy(req: NextRequest) {
  if (await sessionAccount(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "login required" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = { matcher: ["/((?!login|api/login|api/ingest|_next|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest).*)"] };
