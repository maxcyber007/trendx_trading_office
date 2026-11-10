import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { db, read } from "./db";

// 10 minutes before each H1 bar closes (minute 50, 06:00-22:00 Thailand time) the web asks the AI models, side by side, for a
// direction, a reason and a buy/sell/wait signal for the next H1 bar. The bubble reads out the joint view; the joint signal is
// stored for V.1.39.1 to check later through /api/signal. Nothing here changes a trade by itself.
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
// the first model gets 60 s (the free-tier Flash can be slow when busy), a fallback 45 s; both fit in the ingest function's 120 s
const TIMEOUT_MS = 60_000, FALLBACK_TIMEOUT_MS = 45_000;
// when a Gemini model fails, this one answers instead (free-tier quotas are per model, so it doesn't use the main model's quota)
const GEMINI_FALLBACK = process.env.AI_GEMINI_FALLBACK ?? "gemini-3.5-flash-lite";
// when to analyse (Thailand time, UTC+7): once per H1 bar at minute REPORT_MINUTE, from START_HOUR up to END_HOUR, i.e.
// 06:50, 07:50 ... 21:50 = 16 reports a day, inside the Gemini free tier's 20 requests a day.
const REPORT_MINUTE = 50, START_HOUR = 6, END_HOUR = 22, TH_OFFSET_MS = 7 * 3_600_000;
// AI_EVERY_SECONDS (testing only) replaces the schedule with one analysis per slot of that many seconds, at any hour
const EVERY = Number(process.env.AI_EVERY_SECONDS) > 0 ? Math.max(60, Number(process.env.AI_EVERY_SECONDS)) : 0;
// a failed or stuck request may be tried again after this long: twice more within the 10-minute window on the schedule;
// longer in test slots on the Gemini free tier so retries don't eat the daily quota
const RETRY_MINUTES = !EVERY ? 4 : MODELS.some(isGemini) ? 30 : 10;
// true from minute 50 to the end of each hour between 06:00 and 22:00 Thailand time
export function inReportWindow(now = Date.now()): boolean {
  const th = new Date(now + TH_OFFSET_MS);
  return th.getUTCHours() >= START_HOUR && th.getUTCHours() < END_HOUR && th.getUTCMinutes() >= REPORT_MINUTE;
}

type Candle = [number, number, number, number, number];
type News = { t: number; name: string; cur: string; imp: number; act: string; fc: string };
export type MarketIn = { symbol: string; candles: Candle[]; m5?: Candle[]; vol_ratio?: number; range_1m?: number; range_3m?: number; news?: News[] };
export type Signal = "buy" | "sell" | "wait";
// news: a one-sentence read of today's USD calendar (results against forecasts, what is still due) and what it means for gold
// trade: the entry, take-profit and stop the model proposes for a buy / sell (kept only when checkTrade passes them)
export type Trade = { entry: number; tp: number; sl: number };
export type ModelView = { model: string; bias: number; confidence: number; signal: Signal; reason: string; lines: string[]; news?: string; trade?: Trade | null };
// the joint view: the shared direction when every model agrees, otherwise sideways at half the confidence;
// the signal is buy or sell only when every configured model answered and gave that same signal, otherwise wait
export type Analysis = { bar: number; bias: number; confidence: number; signal: Signal; agree: boolean; views: ModelView[]; at: number; trade: Trade | null };

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
   ALTER TABLE market_analysis ADD COLUMN IF NOT EXISTS h1_bar BIGINT;
   ALTER TABLE market_analysis ADD COLUMN IF NOT EXISTS outcome DOUBLE PRECISION;
   ALTER TABLE market_analysis ADD COLUMN IF NOT EXISTS hit BOOLEAN;
   ALTER TABLE market_analysis ADD COLUMN IF NOT EXISTS entry DOUBLE PRECISION;
   ALTER TABLE market_analysis ADD COLUMN IF NOT EXISTS tp DOUBLE PRECISION;
   ALTER TABLE market_analysis ADD COLUMN IF NOT EXISTS sl DOUBLE PRECISION;
   ALTER TABLE market_analysis ADD COLUMN IF NOT EXISTS trade_result TEXT;
   ALTER TABLE market_analysis ADD COLUMN IF NOT EXISTS trade_r DOUBLE PRECISION;`,
).catch((e) => { ready = null; throw e; }));

// when this server instance should look at a symbol's bar again, so the bridge's 2-second sends cost no query
const wait = new Map<string, { bar: number; until: number }>();
const hold = (symbol: string, bar: number, ms: number) => wait.set(symbol, { bar, until: Date.now() + ms });

export async function analyzeIfDue(m: MarketIn | null | undefined): Promise<void> {
  if (!keysReady() || !m?.symbol || !Array.isArray(m.candles) || m.candles.length < 25) return;
  if (!EVERY && !inReportWindow()) return;
  // h1 = the H1 bar now open (broker server time); bar = the key of this analysis: that bar, or the test time slot;
  // the signal is for the next bar, which opens at h1 + 1 hour
  const h1 = m.candles[m.candles.length - 1][0];
  const bar = EVERY ? Math.floor(Date.now() / 1000 / EVERY) * EVERY : h1;
  const w = wait.get(m.symbol);
  if (w && w.bar === bar && Date.now() < w.until) return;
  try {
    await table();
    // claim the bar: only one request wins, a finished bar is never asked twice
    const claim = await db().query(
      `INSERT INTO market_analysis (symbol, bar_time, model, h1_bar) VALUES ($1, $2, $3, $4)
       ON CONFLICT (symbol, bar_time) DO UPDATE SET created_at = now(), error = NULL, model = $3
         WHERE market_analysis.results IS NULL AND market_analysis.created_at < now() - interval '${RETRY_MINUTES} minutes'
       RETURNING 1`, [m.symbol, bar, MODELS.join(","), h1 + 3600]);
    // not ours: finished, or another instance is asking; look again in a minute in case that one fails
    if (!claim.rowCount) { hold(m.symbol, bar, 60_000); return; }
    // look again after the retry time even if this run is cut off before it can record a result
    hold(m.symbol, bar, RETRY_MINUTES * 60_000);
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
      // the joint signal's levels: the first model's levels for that side that pass the checks
      const trade = signal === "wait" ? null : views.map((v) => checkTrade(v.trade, signal, m)).find(Boolean) ?? null;
      await db().query(`UPDATE market_analysis SET bias=$3, confidence=$4, signal=$5, reason=$6, results=$7, error=$8, entry=$9, tp=$10, sl=$11, done_at=now() WHERE symbol=$1 AND bar_time=$2`,
        [m.symbol, bar, agree ? views[0].bias : 0, Math.round(agree ? avg : avg / 2), signal, views.map((v) => v.reason).join(" / "),
         JSON.stringify({ views, failed }), failed.length ? `failed: ${failed.join(",")}` : null, trade?.entry ?? null, trade?.tp ?? null, trade?.sl ?? null]);
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

// the accuracy shown on the robot counts the scheduled minute-50 reports from this time on (earlier rows were tests)
const ACCURACY_FROM = "2026-11-09T05:45:00Z";
const scored = new Map<string, number>();

// once the H1 bar a signal was for has closed, record its move (close - open) and whether a buy / sell called it right;
// wait signals and flat bars get no verdict. Runs after the bridge's sends, at most every 5 minutes per symbol and instance.
export async function scoreSignals(m: MarketIn | null | undefined): Promise<void> {
  if (!m?.symbol || !Array.isArray(m.candles) || m.candles.length < 2) return;
  if (Date.now() < (scored.get(m.symbol) ?? 0)) return;
  scored.set(m.symbol, Date.now() + 5 * 60_000);
  try {
    await table();
    const closed = m.candles.slice(0, -1).map((c) => [c[0], c[1], c[4]]);   // the newest candle is still open
    await db().query(
      `UPDATE market_analysis a SET outcome = c.cl - c.o,
         hit = CASE WHEN a.signal IN ('buy','sell') AND c.cl <> c.o THEN (a.signal = 'buy') = (c.cl > c.o) END
       FROM (SELECT (x->>0)::bigint t, (x->>1)::float8 o, (x->>2)::float8 cl FROM jsonb_array_elements($2::jsonb) x) c
       WHERE a.symbol = $1 AND a.outcome IS NULL AND a.results IS NOT NULL AND a.h1_bar = c.t`,
      [m.symbol, JSON.stringify(closed)]);
    // the proposed levels against the same closed bar (one bar only: entered when its range reached the entry, then
    // the stop first if both levels are inside the bar, the take-profit, or out at the close); results in R (1 R = the stop)
    const bars = new Map(m.candles.slice(0, -1).map((c) => [c[0], c] as const));
    const open = await read<{ bar_time: string; h1_bar: string; signal: Signal; entry: number; tp: number; sl: number }>(
      `SELECT bar_time, h1_bar, signal, entry, tp, sl FROM market_analysis
       WHERE symbol = $1 AND entry IS NOT NULL AND trade_result IS NULL AND h1_bar = ANY($2::bigint[])`, [m.symbol, [...bars.keys()]]);
    for (const r of open) {
      const c = bars.get(Number(r.h1_bar));
      if (!c) continue;
      const [res, R] = judgeTrade(r.signal, r.entry, r.tp, r.sl, c);
      await db().query(`UPDATE market_analysis SET trade_result=$3, trade_r=$4 WHERE symbol=$1 AND bar_time=$2`, [m.symbol, r.bar_time, res, R]);
    }
  } catch (e) {
    console.error("score signals", String(e));
  }
}

// share of scored buy / sell signals that called the next H1 bar right (null until there is one)
export type AiAccuracy = { pct: number; right: number; n: number } | null;
export async function aiAccuracy(symbol: string | undefined): Promise<AiAccuracy> {
  if (!symbol) return null;
  try {
    await table();
    const [r] = await read<{ right: number; n: number }>(
      `SELECT count(*) FILTER (WHERE hit)::int "right", count(hit)::int n FROM market_analysis
       WHERE symbol = $1 AND created_at >= $2`, [symbol, ACCURACY_FROM]);
    return r && r.n > 0 ? { pct: Math.round((r.right / r.n) * 100), right: r.right, n: r.n } : null;
  } catch (e) {
    console.error("ai accuracy", String(e));
    return null;
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
      `SELECT bar_time::float bar, bias, confidence, signal, results, entry, tp, sl, EXTRACT(EPOCH FROM done_at)::float at FROM market_analysis
       WHERE symbol=$1 AND results IS NOT NULL AND done_at > now() - interval '6 hours' ORDER BY done_at DESC LIMIT 1`, [symbol]);
    if (!r) return null;
    const views: ModelView[] = r.results.views ?? [];
    return { bar: r.bar, bias: r.bias ?? 0, confidence: r.confidence ?? 0, signal: r.signal ?? "wait", at: r.at,
      trade: r.entry != null && r.tp != null && r.sl != null ? { entry: r.entry, tp: r.tp, sl: r.sl } : null,
      agree: views.every((v) => v.bias === views[0].bias), views: views.map((v) => ({ ...v, model: "" })) };   // model names stay off the page
  } catch (e) {
    console.error(e);
    return null;
  }
}

const SYSTEM = `คุณคือ TRENDX AI AGENTS ผู้วิเคราะห์ทองคำ (XAUUSD) บนกราฟ H1 ให้ระบบเทรดอัตโนมัติที่กำลังทดลอง
ตอบเป็น JSON เท่านั้น รูปแบบ {"bias":"up"|"down"|"sideways","confidence":0-100,"signal":"buy"|"sell"|"wait","reason":"...","lines":["...","..."],"news":"...","entry":0,"tp":0,"sl":0}
- ข้อมูลถูกส่งมาตอน 10 นาทีก่อนแท่ง H1 ปัจจุบันจะปิด (current_h1_bar_so_far คือแท่งที่ยังไม่ปิด)
- bias คือทิศทางของราคาในอีกไม่กี่ชั่วโมงข้างหน้า
- signal คือสัญญาณสำหรับแท่ง H1 ถัดไป ให้ตอบ wait เมื่อทิศไม่ชัด ตลาดแกว่งในกรอบ หรือใกล้เวลาข่าวสำคัญ
- reason เป็นภาษาไทย 1 ประโยค ไม่เกิน 100 ตัวอักษร บอกเหตุผลหลักของ signal
- lines เป็นภาษาไทย 2 ประโยค ประโยคละไม่เกิน 90 ตัวอักษร เรื่องระดับราคาสำคัญ ความผันผวน หรือข่าวที่ต้องระวัง
- news เป็นภาษาไทย 1 ประโยค ไม่เกิน 120 ตัวอักษร สรุปข่าว USD วันนี้จาก todays_usd_news_bangkok_time: ข่าวที่ออกแล้วดีหรือแย่กว่าคาดการณ์ (actual เทียบ forecast) หรือข่าวสำคัญที่ยังรอออก และผลที่น่าจะเกิดกับทิศทางทองคำ (ตัวเลขสหรัฐฯ ดีกว่าคาดมักกดดันทอง แย่กว่าคาดมักหนุนทอง) ถ้าไม่มีข่าวให้บอกว่าวันนี้ไม่มีข่าวสำคัญ
- entry, tp, sl เป็นราคา (ตัวเลข) สำหรับ signal buy หรือ sell: entry ใกล้ current_price (ไม่ห่างเกิน avg_h1_range_usd.last_1_month) sl และ tp ตั้งจากแนวรับแนวต้านและระยะวิ่งของแท่ง H1 ในข้อมูล buy ต้อง sl < entry < tp, sell ต้อง tp < entry < sl ถ้า signal เป็น wait ให้ entry, tp, sl เป็น 0
- ใช้เฉพาะตัวเลขจากข้อมูลที่ให้ ห้ามแต่งข้อมูลหรือข่าวเพิ่ม ห้ามพูดถึงขนาดไม้`;

// the reply every model gives; Claude is held to it by structured output, Ollama by the prompt and JSON mode
const Reply = z.object({
  bias: z.enum(["up", "down", "sideways"]),
  confidence: z.number(),
  signal: z.enum(["buy", "sell", "wait"]),
  reason: z.string(),
  lines: z.array(z.string()),
  news: z.string(),
  entry: z.number(),
  tp: z.number(),
  sl: z.number(),
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
    news: { type: "string" },
    entry: { type: "number" },
    tp: { type: "number" },
    sl: { type: "number" },
  },
  required: ["bias", "confidence", "signal", "reason", "lines", "news", "entry", "tp", "sl"],
};

let gemini: GoogleGenAI | null = null;
async function askGemini(model: string, user: string, ms: number): Promise<unknown> {
  // no SDK retry: the fallback model and the next retry window take over instead.
  // GEMINI_BASE_URL is only for local tests against a stand-in server.
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: {
    timeout: TIMEOUT_MS, retryOptions: { attempts: 1 }, ...(process.env.GEMINI_BASE_URL ? { baseUrl: process.env.GEMINI_BASE_URL } : {}) } });
  const r = await gemini.models.generateContent({
    model, contents: user,
    config: { systemInstruction: SYSTEM, responseMimeType: "application/json", responseJsonSchema: REPLY_SCHEMA,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },   // a short routine read: low thinking keeps it fast and inside the quota
      abortSignal: AbortSignal.timeout(ms) },
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
  const user = prompt(m);
  try {
    return await askOnce(model, user, TIMEOUT_MS);
  } catch (e) {
    if (!isGemini(model) || !GEMINI_FALLBACK || GEMINI_FALLBACK === model) throw e;
    console.error("market analysis", model, "failed, trying", GEMINI_FALLBACK, String(e));
    return await askOnce(GEMINI_FALLBACK, user, FALLBACK_TIMEOUT_MS);
  }
}

// the market data every model gets, as the user message
function prompt(m: MarketIn): string {
  const closed = m.candles.slice(0, -1), now = m.candles[m.candles.length - 1];   // the newest candle is still open
  const bkk = (t: number) => new Date(t * 1000).toLocaleString("en-GB", { timeZone: "Asia/Bangkok", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const data = {
    symbol: m.symbol,
    h1_candles_oldest_first: closed.map(([, o, h, l, c]) => [o, h, l, c]),
    candle_format: "[open, high, low, close]",
    current_h1_bar_so_far: [now[1], now[2], now[3], now[4]],
    current_price: now[4],
    avg_h1_range_usd: { last_1_month: m.range_1m ?? null, last_3_months: m.range_3m ?? null },
    volatility_ratio_recent_vs_normal: m.vol_ratio ?? null,
    todays_usd_news_bangkok_time: (m.news ?? []).map((n) => ({ time: bkk(n.t), name: n.name, forecast: n.fc || null, actual: n.act || null })),
  };
  return JSON.stringify(data);
}

// one model, one try; the answer trimmed to what the page shows
async function askOnce(model: string, user: string, ms: number): Promise<ModelView> {
  const out = (isGemini(model) ? await askGemini(model, user, ms) : isClaude(model) ? await askClaude(model, user) : await askOllama(model, user)) as Record<string, any>;
  const lines = (Array.isArray(out.lines) ? out.lines : []).map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, LINES_PER_MODEL).map((s: string) => s.slice(0, 140));
  if (!lines.length) throw new Error(`${model} reply had no lines`);
  const bias = out.bias === "up" ? 1 : out.bias === "down" ? -1 : 0;
  const confidence = Math.max(0, Math.min(100, Math.round(Number(out.confidence) || 0)));
  const signal: Signal = out.signal === "buy" || out.signal === "sell" ? out.signal : "wait";
  const reason = String(out.reason ?? "").trim().slice(0, 160);
  const news = String(out.news ?? "").trim().slice(0, 180);
  const [entry, tp, sl] = [out.entry, out.tp, out.sl].map(Number);
  const trade = signal !== "wait" && [entry, tp, sl].every((v) => Number.isFinite(v) && v > 0) ? { entry, tp, sl } : null;
  return { model, bias, confidence, signal, reason, lines, news, trade };
}

// a model's levels are kept only when they make sense for the side and the market: stop and target on the right sides
// of the entry, the entry within one average H1 range of the price, the stop 0.3-4 and the target 0.3-6 average ranges away
export function checkTrade(t: Trade | null | undefined, side: Signal, m: MarketIn): Trade | null {
  if (!t || side === "wait") return null;
  const closed = m.candles.slice(-25, -1), price = m.candles[m.candles.length - 1][4];
  const atr = m.range_1m && m.range_1m > 0 ? m.range_1m : closed.reduce((a, c) => a + (c[2] - c[3]), 0) / Math.max(1, closed.length);
  const dir = side === "buy" ? 1 : -1, risk = (t.entry - t.sl) * dir, reward = (t.tp - t.entry) * dir;
  if (!(atr > 0) || Math.abs(t.entry - price) > atr || risk < 0.3 * atr || risk > 4 * atr || reward < 0.3 * atr || reward > 6 * atr) return null;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { entry: r2(t.entry), tp: r2(t.tp), sl: r2(t.sl) };
}

// one closed H1 bar [time, open, high, low, close] against the levels: nofill, sl (-1 R), tp (+reward/risk) or close
export function judgeTrade(side: Signal, entry: number, tp: number, sl: number, c: Candle): [string, number | null] {
  const [, , high, low, close] = c, dir = side === "buy" ? 1 : -1, risk = Math.abs(entry - sl);
  if (!(risk > 0) || entry < low || entry > high) return ["nofill", null];
  const r2 = (v: number) => Math.round(v * 100) / 100;
  if (dir > 0 ? low <= sl : high >= sl) return ["sl", -1];
  if (dir > 0 ? high >= tp : low <= tp) return ["tp", r2(Math.abs(tp - entry) / risk)];
  return ["close", r2(((close - entry) * dir) / risk)];
}

// the newest joint signal for the bridge service, which can pass it on to the EA through a file (the EA never calls the web)
export async function latestSignal(symbol: string) {
  await table();
  const [r] = await read<Record<string, any>>(
    `SELECT symbol, COALESCE(h1_bar, bar_time)::float bar_time, signal, bias, confidence, reason, entry, tp, sl, EXTRACT(EPOCH FROM now() - done_at)::int age_seconds
     FROM market_analysis WHERE symbol=$1 AND results IS NOT NULL ORDER BY done_at DESC LIMIT 1`, [symbol]);
  return r ?? null;
}
