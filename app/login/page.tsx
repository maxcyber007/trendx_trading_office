"use client";
import { useState } from "react";

export default function Login() {
  const [password, setPassword] = useState("");
  const [bad, setBad] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/login", { method: "POST", body: JSON.stringify({ password }) });
    if (r.ok) location.href = "/"; else setBad(true);
  }
  return (
    <main className="login">
      <form className="card" onSubmit={submit}>
        <h1>TrendX <em>Ultimate AI Pro</em></h1>
        <label htmlFor="pw">รหัสผ่าน</label>
        <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        {bad && <p className="neg">รหัสผ่านไม่ถูกต้อง</p>}
        <button type="submit">เข้าสู่ระบบ</button>
      </form>
    </main>
  );
}
