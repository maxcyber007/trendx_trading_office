"use client";
import { useState } from "react";
import { Exo_2, Orbitron } from "next/font/google";
import LoginBackdrop from "@/components/LoginBackdrop";
import { Logo } from "@/components/icons";

const display = Orbitron({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-display" });
const text = Exo_2({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-text" });

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const fail = (message: string) => { setError(message); setTries((n) => n + 1); setBusy(false); };
    try {
      const r = await fetch("/api/login", { method: "POST", body: JSON.stringify({ password }) });
      if (r.ok) location.href = "/"; else fail("Incorrect password");
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
        <label htmlFor="pw">Password</label>
        <input id="pw" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!error} autoFocus required />
        {error && <p className="fail" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign In"}</button>
      </form>
    </main>
  );
}
