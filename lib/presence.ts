import { db, read } from "./db";

// a browser counts as online while its dashboard keeps refreshing
const ONLINE_SECONDS = 15;
let ready: Promise<unknown> | null = null;

// created on first use, so a deploy works without a separate migration step
const table = () => (ready ??= db().query(
  `CREATE TABLE IF NOT EXISTS web_visitors (id TEXT PRIMARY KEY, last_seen TIMESTAMPTZ NOT NULL DEFAULT now())`,
).catch((e) => { ready = null; throw e; }));

// the count is extra information: a failure here must never stop the dashboard
export async function onlineUsers(visitor: string | null): Promise<number | null> {
  try {
    await table();
    if (visitor && /^[a-zA-Z0-9-]{8,40}$/.test(visitor))
      await db().query(`INSERT INTO web_visitors (id) VALUES ($1) ON CONFLICT (id) DO UPDATE SET last_seen = now()`, [visitor]);
    if (Math.random() < .01) await db().query(`DELETE FROM web_visitors WHERE last_seen < now() - interval '1 day'`);
    const [row] = await read<{ n: number }>(`SELECT count(*)::int n FROM web_visitors WHERE last_seen > now() - interval '${ONLINE_SECONDS} seconds'`);
    return row.n;
  } catch (e) {
    console.error(e);
    return null;
  }
}
