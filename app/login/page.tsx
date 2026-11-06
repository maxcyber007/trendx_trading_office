"use client";
import { useState } from "react";
import { Exo_2, Orbitron } from "next/font/google";
import LoginBackdrop from "@/components/LoginBackdrop";
import { Logo } from "@/components/icons";

const display = Orbitron({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-display" });
const text = Exo_2({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-text" });

export default function Login() {
  const [login, setLogin] = useState("");
  const [servers, setServers] = useState<string[]>([]);
  const [server, setServer] = useState("");
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const fail = (message: string) => { setError(message); setTries((n) => n + 1); setBusy(false); };
    try {
      const r = await fetch("/api/login", { method: "POST", body: JSON.stringify({ login, server }) });
      if (r.ok) { location.href = "/"; return; }
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
        <input id="login" inputMode="numeric" autoComplete="username" placeholder="Enter your account number" value={login} onChange={(e) => { setLogin(e.target.value.replace(/\D/g, "")); setServers([]); setServer(""); }} aria-invalid={!!error} autoFocus required />
        {servers.length > 1 && <>
          <label className="second" htmlFor="server">Server</label>
          <select id="server" value={server} onChange={(e) => setServer(e.target.value)}>{servers.map((s) => <option key={s}>{s}</option>)}</select>
        </>}
        {error && <p className="fail" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign In"}</button>
      </form>
    </main>
  );
}
