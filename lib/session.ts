// signed login cookie tied to one trading account; Web Crypto so the same code runs in the proxy and in API routes
export const COOKIE = "trendx_session";
const DAYS = 30;

export type SessionAccount = { login: string; server: string };

async function sign(text: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(process.env.SESSION_SECRET ?? ""),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(text));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}

// the account is kept as login and server, not a row id: row ids can be reused after the tables are cleared
export async function makeSession({ login, server }: SessionAccount): Promise<string> {
  const body = `${Date.now() + DAYS * 86400000}.${login}.${encodeURIComponent(server)}`;
  return `${body}.${await sign(body)}`;
}

export async function sessionAccount(value?: string): Promise<SessionAccount | null> {
  if (!value || !process.env.SESSION_SECRET) return null;
  const cut = value.lastIndexOf("."), body = value.slice(0, cut), mac = value.slice(cut + 1);
  const [expires, login, ...server] = body.split(".");
  if (cut < 0 || !login || !server.length || Number(expires) < Date.now()) return null;
  if ((await sign(body)) !== mac) return null;
  return { login, server: decodeURIComponent(server.join(".")) };
}

export const maxAge = DAYS * 86400;
