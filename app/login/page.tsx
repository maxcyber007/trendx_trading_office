"use client";
import { useEffect, useState } from "react";
import { Exo_2, Orbitron } from "next/font/google";
import LoginBackdrop from "@/components/LoginBackdrop";
import { Logo } from "@/components/icons";

const display = Orbitron({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-display" });
const text = Exo_2({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-text" });
const SAVED = "trendx_saved_logins", OLD = "trendx_saved_login", MAX_SAVED = 8;
// every account signed in on this browser with "Remember" on, newest first. Browser storage can be blocked:
// the page then simply starts empty.
function saved(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED) ?? "[]");
    const old = localStorage.getItem(OLD);   // the single account the page kept before
    const all = [...(Array.isArray(list) ? list : []), ...(old ? [old] : [])].map(String).filter(Boolean);
    return [...new Set(all)].slice(0, MAX_SAVED);
  } catch { return []; }
}
function store(list: string[]) {
  try { localStorage.setItem(SAVED, JSON.stringify(list)); localStorage.removeItem(OLD); } catch {}
}

export default function Login() {
  const [login, setLogin] = useState("");
  const [servers, setServers] = useState<string[]>([]);
  const [server, setServer] = useState("");
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);
  const [accounts, setAccounts] = useState<string[]>([]);

  useEffect(() => {
    const list = saved();
    setAccounts(list);
    if (list.length) setLogin(list[0]);
  }, []);

  const pick = (value: string) => { setLogin(value); setServers([]); setServer(""); setError(""); };
  const forget = (value: string) => { const list = accounts.filter((a) => a !== value); setAccounts(list); store(list); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const fail = (message: string) => { setError(message); setTries((n) => n + 1); setBusy(false); };
    try {
      const r = await fetch("/api/login", { method: "POST", body: JSON.stringify({ login, server }) });
      if (r.ok) {
        const rest = accounts.filter((a) => a !== login);
        store(remember ? [login, ...rest].slice(0, MAX_SAVED) : rest);
        location.href = "/"; return;
      }
      if (r.status === 409) {
        const { servers: list } = await r.json();
        setServers(list); setServer(list[0]); setBusy(false);
        return;
      }
      fail(r.status === 401 ? "Account not found" : "Cannot reach the server. Please try again.");
    } catch { fail("Cannot reach the server. Please try again."); }
  }

  return (
    <main className={`login ${display.variable} ${text.variable}`}>
      <LoginBackdrop />
      <form key={tries} className={`gate ${tries ? "shake" : ""}`} onSubmit={submit}>
        <span className="emblem"><i /><i /><Logo /></span>
        <h1>TRENDX</h1>
        <p className="product">ULTIMATE AI PRO</p>
        <p className="tagline">Smart Trading &bull; Smarter Decisions</p>
        <label htmlFor="login">Account Number</label>
        <input id="login" autoComplete="username" autoCapitalize="characters" spellCheck={false} placeholder="Enter your account number" value={login} onChange={(e) => { setLogin(e.target.value.replace(/[^0-9a-z]/gi, "").toUpperCase()); setServers([]); setServer(""); }} aria-invalid={!!error} autoFocus required />
        {accounts.length > 0 && <div className="saved" aria-label="Saved accounts">
          {accounts.map((a) => <span key={a} className={a === login ? "on" : ""}>
            <button type="button" className="pick" onClick={() => pick(a)}>{a}</button>
            <button type="button" className="drop" aria-label={`Forget ${a}`} title="Forget" onClick={() => forget(a)}>&times;</button>
          </span>)}
        </div>}
        {servers.length > 1 && <>
          <label className="second" htmlFor="server">Server</label>
          <select id="server" value={server} onChange={(e) => setServer(e.target.value)}>{servers.map((s) => <option key={s}>{s}</option>)}</select>
        </>}
        {error && <p className="fail" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign In"}</button>
        <label className="remember"><input type="checkbox" role="switch" checked={remember} onChange={(e) => setRemember(e.target.checked)} /><i />Remember account number</label>
      </form>
    </main>
  );
}
