import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { MarketIn } from "./analysis";
import { db, read } from "./db";

// Short AI notes beside the hourly signal, on the light Gemini model (its own free-tier quota, 500 requests a day):
// - "m5":   every 5 minutes from 06:00 to 23:00 Thailand time, a one-line read of the last 3 hours of M5 bars (204 a day)
// - "news": about 20 minutes before each important USD release, what a better or worse number would likely do to gold
// They are commentary only: no buy / sell signal, nothing for /api/signal, not counted in the accuracy on the robot.
// A note that fails is not retried (the next slot comes soon), so the quota stays predictable.
const MODEL = process.env.AI_QUICK_MODEL || "gemini-3.5-flash-lite";
const TIMEOUT_MS = 40_000;
const START_HOUR = 6, END_HOUR = 23, TH_OFFSET_MS = 7 * 3_600_000, SLOT = 300;
const NEWS_FROM = 21 * 60, NEWS_TO = 5 * 60;   // a pre-news note is asked 21 to 5 minutes before the release (normally ~20)

type Candle = [number, number, number, number, number];
export type M5Note = { bias: number; summary: string; level: string; at: number };
export type NewsNote = { t: number; names: string[]; better: string; worse: string; watch: string; at: number };
export type Notes = { m5: M5Note | null; news: NewsNote | null };

let ready: Promise<unknown> | null = null;
const table = () => (ready ??= db().query(
  `CREATE TABLE IF NOT EXISTS market_notes (
     symbol TEXT NOT NULL, kind TEXT NOT NULL, slot BIGINT NOT NULL, model TEXT NOT NULL DEFAULT '',
     data JSONB, error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), done_at TIMESTAMPTZ,
     PRIMARY KEY (symbol, kind, slot))`,
).catch((e) => { ready = null; throw e; }));

// the last slot this server instance already claimed or saw taken, so the bridge's 2-second sends cost no query
const seen = new Map<string, number>();

const inHours = (now: number) => { const h = new Date(now + TH_OFFSET_MS).getUTCHours(); return h >= START_HOUR && h < END_HOUR; };

export async function notesIfDue(m: MarketIn | null | undefined): Promise<void> {
  if (!process.env.GEMINI_API_KEY || !m?.symbol || !inHours(Date.now())) return;
  const now = Math.floor(Date.now() / 1000);
  const jobs: Promise<void>[] = [];
  const m5 = Array.isArray(m.m5) ? m.m5 : [];
  if (m5.length >= 12) jobs.push(run(m, "m5", Math.floor(now / SLOT) * SLOT, () => m5Prompt(m, m5), M5_SYSTEM, M5_SCHEMA));
  // important USD releases still to come, grouped by time: one note per release time
  const due = (m.news ?? []).filter((n) => n.imp >= 3 && !n.act && n.t - now <= NEWS_FROM && n.t - now >= NEWS_TO);
  for (const t of [...new Set(due.map((n) => n.t))])
    jobs.push(run(m, "news", t, () => newsPrompt(m, due.filter((n) => n.t === t)), NEWS_SYSTEM, NEWS_SCHEMA,
      { names: due.filter((n) => n.t === t).map((n) => n.name) }));
  await Promise.all(jobs);
}

async function run(m: MarketIn, kind: string, slot: number, user: () => string, system: string, schema: object, extra: object = {}): Promise<void> {
  const key = `${m.symbol}|${kind}`;
  if ((seen.get(key) ?? 0) >= slot) return;
  seen.set(key, slot);
  try {
    await table();
    const claim = await db().query(
      `INSERT INTO market_notes (symbol, kind, slot, model) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING 1`,
      [m.symbol, kind, slot, MODEL]);
    if (!claim.rowCount) return;   // another instance has it
    try {
      const out = await ask(system, user(), schema);
      await db().query(`UPDATE market_notes SET data=$4, done_at=now() WHERE symbol=$1 AND kind=$2 AND slot=$3`, [m.symbol, kind, slot, JSON.stringify({ ...out, ...extra })]);
    } catch (e) {
      console.error("market note", kind, MODEL, String(e));
      await db().query(`UPDATE market_notes SET error=$4 WHERE symbol=$1 AND kind=$2 AND slot=$3`, [m.symbol, kind, slot, String(e).slice(0, 300)]);
    }
  } catch (e) {
    console.error("market notes table", String(e));
  }
}

let gemini: GoogleGenAI | null = null;
async function ask(system: string, user: string, schema: object): Promise<Record<string, unknown>> {
  // GEMINI_BASE_URL is only for local tests against a stand-in server
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: {
    timeout: TIMEOUT_MS, retryOptions: { attempts: 1 }, ...(process.env.GEMINI_BASE_URL ? { baseUrl: process.env.GEMINI_BASE_URL } : {}) } });
  const r = await gemini.models.generateContent({
    model: MODEL, contents: user,
    config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: schema,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, abortSignal: AbortSignal.timeout(TIMEOUT_MS) },
  });
  if (!r.text) throw new Error(`empty reply (${r.candidates?.[0]?.finishReason ?? "no candidate"})`);
  return JSON.parse(r.text);
}

const bars = (c: Candle[]) => c.map(([, o, h, l, cl]) => [o, h, l, cl]);
const bkk = (t: number) => new Date(t * 1000).toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });

const M5_SYSTEM = `คุณคือ TRENDX AI AGENTS ผู้อ่านกราฟทองคำ (XAUUSD) ระยะสั้นจากแท่ง M5 ย้อนหลัง 3 ชั่วโมง
ตอบเป็น JSON เท่านั้น รูปแบบ {"bias":"up"|"down"|"sideways","summary":"...","level":"..."}
- bias คือทิศทางระยะสั้นในอีก 15-30 นาที
- summary ภาษาไทย 1 ประโยค ไม่เกิน 110 ตัวอักษร: ราคากำลังทำอะไรตอนนี้ (แรงส่ง กรอบแกว่ง การทะลุ)
- level ภาษาไทย 1 ประโยค ไม่เกิน 90 ตัวอักษร: ระดับราคาที่ควรจับตาถัดไป
- ใช้เฉพาะตัวเลขจากข้อมูลที่ให้ ห้ามแต่งข้อมูลหรือข่าวเพิ่ม ห้ามแนะนำขนาดไม้ ไม่ต้องให้สัญญาณ buy/sell`;
const M5_SCHEMA = {
  type: "object",
  properties: { bias: { type: "string", enum: ["up", "down", "sideways"] }, summary: { type: "string" }, level: { type: "string" } },
  required: ["bias", "summary", "level"],
};
function m5Prompt(m: MarketIn, m5: Candle[]): string {
  const closed = m5.slice(0, -1), now = m5[m5.length - 1], h1 = m.candles.slice(-7, -1);
  return JSON.stringify({
    symbol: m.symbol, candle_format: "[open, high, low, close]",
    m5_candles_oldest_first: bars(closed), current_m5_bar_so_far: bars([now])[0], current_price: now[4],
    last_6_h1_candles_oldest_first: bars(h1), avg_h1_range_usd_1_month: m.range_1m ?? null,
    upcoming_usd_news_bangkok_time: (m.news ?? []).filter((n) => !n.act && n.t > Date.now() / 1000).map((n) => ({ time: bkk(n.t), name: n.name, forecast: n.fc || null })),
  });
}

const NEWS_SYSTEM = `คุณคือ TRENDX AI AGENTS ผู้วิเคราะห์ทองคำ (XAUUSD) ก่อนข่าวเศรษฐกิจสหรัฐฯ จะประกาศในอีกประมาณ 20 นาที
ตอบเป็น JSON เท่านั้น รูปแบบ {"better":"...","worse":"...","watch":"..."}
- better ภาษาไทย 1 ประโยค ไม่เกิน 100 ตัวอักษร: ถ้าตัวเลขออกดีกว่าคาดการณ์ (ดีต่อเศรษฐกิจ/ดอลลาร์สหรัฐ) ทองน่าจะไปทางไหน และระดับราคาที่น่าจะไปถึง
- worse ภาษาไทย 1 ประโยค ไม่เกิน 100 ตัวอักษร: ถ้าตัวเลขออกแย่กว่าคาดการณ์ ทองน่าจะไปทางไหน และระดับราคา
- watch ภาษาไทย 1 ประโยค ไม่เกิน 100 ตัวอักษร: สิ่งที่ควรระวังช่วงประกาศ เช่น ความผันผวน spread กว้าง หรือกรอบราคาที่ใกล้ที่สุด
- ระวังข่าวที่ค่าสูงแปลว่าแย่ เช่น Jobless Claims และ Unemployment Rate: ค่าสูงกว่าคาดคือแย่กว่าคาด
- ใช้เฉพาะตัวเลขจากข้อมูลที่ให้ ห้ามแต่งข้อมูลหรือข่าวเพิ่ม ห้ามแนะนำขนาดไม้`;
const NEWS_SCHEMA = {
  type: "object",
  properties: { better: { type: "string" }, worse: { type: "string" }, watch: { type: "string" } },
  required: ["better", "worse", "watch"],
};
function newsPrompt(m: MarketIn, events: NonNullable<MarketIn["news"]>): string {
  const m5 = Array.isArray(m.m5) ? m.m5 : [];
  return JSON.stringify({
    symbol: m.symbol, candle_format: "[open, high, low, close]",
    news_bangkok_time: events.map((n) => ({ time: bkk(n.t), name: n.name, forecast: n.fc || null })),
    current_price: (m5.length ? m5[m5.length - 1] : m.candles[m.candles.length - 1])[4],
    last_12_m5_candles_oldest_first: bars(m5.slice(-13, -1)), last_6_h1_candles_oldest_first: bars(m.candles.slice(-7, -1)),
    avg_h1_range_usd_1_month: m.range_1m ?? null,
  });
}

const txt = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

// the newest m5 note of the last 10 minutes and the pre-news note of a release due now or within 5 minutes after it
export async function latestNotes(symbol: string | undefined): Promise<Notes> {
  if (!symbol || !process.env.GEMINI_API_KEY) return { m5: null, news: null };
  try {
    await table();
    const rows = await read<Record<string, any>>(
      `(SELECT kind, slot::float slot, data, EXTRACT(EPOCH FROM done_at)::float at FROM market_notes
         WHERE symbol=$1 AND kind='m5' AND data IS NOT NULL AND done_at > now() - interval '10 minutes' ORDER BY slot DESC LIMIT 1)
       UNION ALL
       (SELECT kind, slot::float slot, data, EXTRACT(EPOCH FROM done_at)::float at FROM market_notes
         WHERE symbol=$1 AND kind='news' AND data IS NOT NULL AND slot > EXTRACT(EPOCH FROM now()) - 300 ORDER BY slot LIMIT 1)`, [symbol]);
    const a = rows.find((r) => r.kind === "m5"), b = rows.find((r) => r.kind === "news");
    return {
      m5: a ? { bias: a.data.bias === "up" ? 1 : a.data.bias === "down" ? -1 : 0, summary: txt(a.data.summary, 160), level: txt(a.data.level, 140), at: a.at } : null,
      news: b ? { t: b.slot, names: Array.isArray(b.data.names) ? b.data.names.map(String).slice(0, 4) : [], better: txt(b.data.better, 150), worse: txt(b.data.worse, 150), watch: txt(b.data.watch, 150), at: b.at } : null,
    };
  } catch (e) {
    console.error("latest notes", String(e));
    return { m5: null, news: null };
  }
}
