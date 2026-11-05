// signed login cookie; Web Crypto so the same code runs in the proxy and in API routes
export const COOKIE = "trendx_session";
const DAYS = 30;

async function sign(text: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(process.env.SESSION_SECRET ?? ""),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(text));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makeSession(): Promise<string> {
  const expires = String(Date.now() + DAYS * 86400000);
  return `${expires}.${await sign(expires)}`;
}

export async function validSession(value?: string): Promise<boolean> {
  if (!value || !process.env.SESSION_SECRET) return false;
  const [expires, mac] = value.split(".");
  if (!expires || !mac || Number(expires) < Date.now()) return false;
  return (await sign(expires)) === mac;
}

export const maxAge = DAYS * 86400;
