import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { db, read } from "./db";

// once per H1 bar (every EVERY seconds while testing) the web asks the AI models, side by side, for a direction, a reason and a
// buy/sell/wait signal. The bubble reads out the joint view; the joint signal is stored for V.1.39.1 to check later through
// /api/signal. Nothing here changes a trade by itself.
// AI_MODELS picks the models by name:
// - "gemini-..." -> Gemini API (GEMINI_API_KEY from Google AI Studio). gemini-3.8-flash on the free tier for now.
// - "claude-..." -> Claude API (ANTHROPIC_API_KEY), e.g. claude-haiku-5-5
// - anything else -> Ollama Cloud (OLLAMA_API_KEY), e.g. deepseek-v4.1-flash,glm-5.3-flash
const OLLAMA_URL = process.env.OLLAMA_URL || "https://ollama.com/api/chat";
const MODELS = (process.env.AI_MODELS || "gemini-3.8-flash").split(",").map((s) => s.trim()).filter(Boolean);
const isClaude = (model: string) => model.startsWith("claude-");
const isGemini = (model: string) => model.startsWith("gemini-");
const keyFor = (model: string) => (isGemini(model) ? process.env.GEMINI_API_KEY : isClaude(model) ? process.env.ANTHROPIC_API_KEY : process.env.OLLAMA_API_KEY);
// every model needs its provider's key on the server
const keysReady = () => MODELS.length > 0 && MODELS.every((m) => !!keyFor(m));
const LINES_PER_MODEL = 2;
const TIMEOUT_MS = 45_000;
// a failed or stuck request may be tried again after this long; longer on the Gemini free tier so retries don't eat the daily quota
const RETRY_MINUTES = MODELS.some(isGemini) ? 30 : 10;
// how often to analyse: exactly 3600 = once per H1 bar (keyed by the bar), anything else = once per slot of that many seconds.
// Paid models: every minute while testing (1,440 calls a day each). Gemini free tier allows only 20 requests a day
// (5 a minute), so with a Gemini model in the list the default is every 90 minutes = 16 a day, leaving room for retries.
const EVERY = Math.max(60, Number(process.env.AI_EVERY_SECONDS) || (MODELS.some(isGemini) ? 5400 : 60));

type Candle = [number, number, number, number, number];
type News = { t: number; name: string; cur: string; imp: number; act: string; fc: string };
export type MarketIn = { symbol: string; candles: Candle[]; vol_ratio?: number; range_1m?: number; range_3m?: number; news?: News[] };
export type Signal = "buy" | "sell" | "wait";
export type ModelView = { model: string; bias: number; confidence: number; signal: Signal; reason: string; lines: string[] };
// the joint view: the shared direction when every model agrees, otherwise sideways at half the confidence;
// the signal is buy or sell only when every configured model answered and gave that same signal, otherwise wait
export type Analysis = { bar: number; bias: number; confidence: number; signal: Signal; agree: boolean; views: ModelView[]; at: number };

let ready: Promise<unknown> | null = null;
// created on first use, so a deploy works without a separate migration step
const table = () => (ready ??= db().query(
  `CREATE TABLE IF NOT EXISTS market_analysis (
     symbol TEXT NOT NULL, bar_time BIGINT NOT NULL, model TEXT NOT NULL DEFAULT '',
     bias INT, confidence INT, signal TEXT, reason TEXT, results JSONB, error TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(), done_at TIMESTAMPTZ,
     PRIMARY KEY (symbol, bar_time));
   ALTER TABLE market_analysis ADD COLUMN IF NOT EXISTS signal TEXT;
   ALTER TABLE market_analysis ADD COLUMN IF NOT EXISTS reason TEXT;
   ALTER TABLE market_analysis ADD COLUMN IF NOT EXISTS h1_bar BIGINT;`,
).catch((e) => { ready = null; throw e; }));

// when this server instance should look at a symbol's bar again, so the bridge's 2-second sends cost no query
const wait = new Map<string, { bar: number; until: number }>();
const hold = (symbol: string, bar: number, ms: number) => wait.set(symbol, { bar, until: Date.now() + ms });

export async function analyzeIfDue(m: MarketIn | null | undefined): Promise<void> {
  if (!keysReady() || !m?.symbol || !Array.isArray(m.candles) || m.candles.length < 25) return;
  // h1 = the H1 bar now open (broker server time); bar = the key of this analysis: that bar, or the current time slot
  const h1 = m.candles[m.candles.length - 1][0];
  const bar = EVERY === 3600 ? h1 : Math.floor(Date.now() / 1000 / EVERY) * EVERY;
  const w = wait.get(m.symbol);
  if (w && w.bar === bar && Date.now() < w.until) return;
  try {
    await table();
    // claim the bar: only one request wins, a finished bar is never asked twice
    const claim = await db().query(
      `INSERT INTO market_analysis (symbol, bar_time, model, h1_bar) VALUES ($1, $2, $3, $4)
       ON CONFLICT (symbol, bar_time) DO UPDATE SET created_at = now(), error = NULL, model = $3
         WHERE market_analysis.results IS NULL AND market_analysis.created_at < now() - interval '${RETRY_MINUTES} minutes'
       RETURNING 1`, [m.symbol, bar, MODELS.join(","), h1]);
    // not ours: finished, or another instance is asking; look again in a minute in case that one fails
    if (!claim.rowCount) { hold(m.symbol, bar, 60_000); return; }
    hold(m.symbol, bar, Infinity);
    try {
      // all models at once; one that fails is left out and the others still speak
      const got = await Promise.allSettled(MODELS.map((model) => ask(model, m)));
      const views = got.flatMap((g) => (g.status === "fulfilled" ? [g.value] : []));
      const failed = MODELS.filter((_, i) => got[i].status === "rejected");
      got.forEach((g, i) => g.status === "rejected" && console.error("market analysis", MODELS[i], String(g.reason)));
      if (!views.length) throw new Error(got.map((g) => (g.status === "rejected" ? String(g.reason) : "")).join(" | "));
      const agree = views.every((v) => v.bias === views[0].bias);
      const avg = views.reduce((a, v) => a + v.confidence, 0) / views.length;
      const signal: Signal = !failed.length && views.every((v) => v.signal === views[0].signal) ? views[0].signal : "wait";
      await db().query(`UPDATE market_analysis SET bias=$3, confidence=$4, signal=$5, reason=$6, results=$7, error=$8, done_at=now() WHERE symbol=$1 AND bar_time=$2`,
        [m.symbol, bar, agree ? views[0].bias : 0, Math.round(agree ? avg : avg / 2), signal, views.map((v) => v.reason).join(" / "),
         JSON.stringify({ views, failed }), failed.length ? `failed: ${failed.join(",")}` : null]);
    } catch (e) {
      console.error("market analysis failed", String(e));
      await db().query(`UPDATE market_analysis SET error=$3 WHERE symbol=$1 AND bar_time=$2`, [m.symbol, bar, String(e).slice(0, 300)]);
      hold(m.symbol, bar, RETRY_MINUTES * 60_000);
    }
  } catch (e) {
    console.error("market analysis table", String(e));
    hold(m.symbol, bar, 60_000);
  }
}

// why no fresh analysis is showing, for the bubble: no key on the server, nothing has triggered it yet,
// a request in progress, or a failed attempt (the details stay in the table and the server log, not on the page)
export type AiStatus = { state: "ok" | "no_key" | "no_rows" | "working" | "error"; at?: number };
export async function aiStatus(symbol: string | undefined): Promise<AiStatus> {
  if (!keysReady()) return { state: "no_key" };
  if (!symbol) return { state: "no_rows" };
  try {
    await table();
    const [r] = await read<Record<string, any>>(
      `SELECT results IS NOT NULL done, error, EXTRACT(EPOCH FROM created_at)::float at FROM market_analysis
       WHERE symbol=$1 ORDER BY created_at DESC LIMIT 1`, [symbol]);
    if (!r) return { state: "no_rows" };
    if (r.done) return { state: "ok", at: r.at };
    return { state: r.error ? "error" : "working", at: r.at };
  } catch (e) {
    console.error("ai status", String(e));
    return { state: "error" };
  }
}

// the newest finished commentary for this symbol; a failure here must never stop the dashboard
export async function latestAnalysis(symbol: string | undefined): Promise<Analysis | null> {
  if (!symbol) return null;
  try {
    await table();
    const [r] = await read<Record<string, any>>(
      `SELECT bar_time::float bar, bias, confidence, signal, results, EXTRACT(EPOCH FROM done_at)::float at FROM market_analysis
       WHERE symbol=$1 AND results IS NOT NULL AND done_at > now() - interval '6 hours' ORDER BY done_at DESC LIMIT 1`, [symbol]);
    if (!r) return null;
    const views: ModelView[] = r.results.views ?? [];
    return { bar: r.bar, bias: r.bias ?? 0, confidence: r.confidence ?? 0, signal: r.signal ?? "wait", at: r.at,
      agree: views.every((v) => v.bias === views[0].bias), views: views.map((v) => ({ ...v, model: "" })) };   // model names stay off the page
  } catch (e) {
    console.error(e);
    return null;
  }
}

const SYSTEM = `คุณคือ TRENDX AI AGENTS ผู้วิเคราะห์ทองคำ (XAUUSD) บนกราฟ H1 ให้ระบบเทรดอัตโนมัติที่กำลังทดลอง
ตอบเป็น JSON เท่านั้น รูปแบบ {"bias":"up"|"down"|"sideways","confidence":0-100,"signal":"buy"|"sell"|"wait","reason":"...","lines":["...","..."]}
- bias คือทิศทางของราคาในอีกไม่กี่ชั่วโมงข้างหน้า
- signal คือสัญญาณสำหรับแท่ง H1 ที่เพิ่งเปิด ให้ตอบ wait เมื่อทิศไม่ชัด ตลาดแกว่งในกรอบ หรือใกล้เวลาข่าวสำคัญ
- reason เป็นภาษาไทย 1 ประโยค ไม่เกิน 100 ตัวอักษร บอกเหตุผลหลักของ signal
- lines เป็นภาษาไทย 2 ประโยค ประโยคละไม่เกิน 90 ตัวอักษร เรื่องระดับราคาสำคัญ ความผันผวน หรือข่าวที่ต้องระวัง
- ใช้เฉพาะตัวเลขจากข้อมูลที่ให้ ห้ามแต่งข้อมูลหรือข่าวเพิ่ม ห้ามพูดถึงขนาดไม้`;

// the reply every model gives; Claude is held to it by structured output, Ollama by the prompt and JSON mode
const Reply = z.object({
  bias: z.enum(["up", "down", "sideways"]),
  confidence: z.number(),
  signal: z.enum(["buy", "sell", "wait"]),
  reason: z.string(),
  lines: z.array(z.string()),
});

let claude: Anthropic | null = null;
async function askClaude(model: string, user: string): Promise<unknown> {
  // no retry: a second try would not fit in the function's 60-second limit; the next slot tries again
  claude ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
  const r = await claude.messages.parse({
    model, max_tokens: 4000, system: SYSTEM,
    messages: [{ role: "user", content: user }],
    output_config: { effort: "low", format: zodOutputFormat(Reply) },   // a short routine read: low effort keeps thinking tokens down
  });
  if (r.stop_reason === "refusal") throw new Error(`${model} refused`);
  if (!r.parsed_output) throw new Error(`${model} reply did not parse (${r.stop_reason})`);
  return r.parsed_output;
}

// the same reply shape as plain JSON Schema, for Gemini's structured output
const REPLY_SCHEMA = {
  type: "object",
  properties: {
    bias: { type: "string", enum: ["up", "down", "sideways"] },
    confidence: { type: "number" },
    signal: { type: "string", enum: ["buy", "sell", "wait"] },
    reason: { type: "string" },
    lines: { type: "array", items: { type: "string" } },
  },
  required: ["bias", "confidence", "signal", "reason", "lines"],
};

let gemini: GoogleGenAI | null = null;
async function askGemini(model: string, user: string): Promise<unknown> {
  // no retry: a second try would not fit in the function's 60-second limit; the next slot tries again.
  // GEMINI_BASE_URL is only for local tests against a stand-in server.
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: {
    timeout: TIMEOUT_MS, retryOptions: { attempts: 1 }, ...(process.env.GEMINI_BASE_URL ? { baseUrl: process.env.GEMINI_BASE_URL } : {}) } });
  const r = await gemini.models.generateContent({
    model, contents: user,
    config: { systemInstruction: SYSTEM, responseMimeType: "application/json", responseJsonSchema: REPLY_SCHEMA,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },   // a short routine read: low thinking keeps it fast and inside the quota
  });
  const text = r.text;
  if (!text) throw new Error(`${model} empty reply (${r.candidates?.[0]?.finishReason ?? "no candidate"})`);
  return JSON.parse(text);
}

async function askOllama(model: string, user: string): Promise<unknown> {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OLLAMA_API_KEY}` },
    body: JSON.stringify({ model, stream: false, format: "json", options: { temperature: 0.3 },
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${model} ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  return JSON.parse(String(body?.message?.content ?? "").replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

async function ask(model: string, m: MarketIn): Promise<ModelView> {
  const closed = m.candles.slice(0, -1);   // the newest candle has just opened
  const bkk = (t: number) => new Date(t * 1000).toLocaleString("en-GB", { timeZone: "Asia/Bangkok", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const data = {
    symbol: m.symbol,
    h1_candles_oldest_first: closed.map(([, o, h, l, c]) => [o, h, l, c]),
    candle_format: "[open, high, low, close]",
    current_price: m.candles[m.candles.length - 1][4],
    avg_h1_range_usd: { last_1_month: m.range_1m ?? null, last_3_months: m.range_3m ?? null },
    volatility_ratio_recent_vs_normal: m.vol_ratio ?? null,
    todays_usd_news_bangkok_time: (m.news ?? []).map((n) => ({ time: bkk(n.t), name: n.name, forecast: n.fc || null, actual: n.act || null })),
  };
  const user = JSON.stringify(data);
  const out = (isGemini(model) ? await askGemini(model, user) : isClaude(model) ? await askClaude(model, user) : await askOllama(model, user)) as Record<string, any>;
  const lines = (Array.isArray(out.lines) ? out.lines : []).map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, LINES_PER_MODEL).map((s: string) => s.slice(0, 140));
  if (!lines.length) throw new Error(`${model} reply had no lines`);
  const bias = out.bias === "up" ? 1 : out.bias === "down" ? -1 : 0;
  const confidence = Math.max(0, Math.min(100, Math.round(Number(out.confidence) || 0)));
  const signal: Signal = out.signal === "buy" || out.signal === "sell" ? out.signal : "wait";
  const reason = String(out.reason ?? "").trim().slice(0, 160);
  return { model, bias, confidence, signal, reason, lines };
}

// the newest joint signal for the bridge service, which can pass it on to the EA through a file (the EA never calls the web)
export async function latestSignal(symbol: string) {
  await table();
  const [r] = await read<Record<string, any>>(
    `SELECT symbol, COALESCE(h1_bar, bar_time)::float bar_time, signal, bias, confidence, reason, EXTRACT(EPOCH FROM now() - done_at)::int age_seconds
     FROM market_analysis WHERE symbol=$1 AND results IS NOT NULL ORDER BY done_at DESC LIMIT 1`, [symbol]);
  return r ?? null;
}
