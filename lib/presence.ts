import { db, read } from "./db";

// a browser counts as online while its dashboard keeps refreshing
const ONLINE_SECONDS = 15;
let ready: Promise<unknown> | null = null;

// created on first use, so a deploy works without a separate migration step
const table = () => (ready ??= db().query(
  `CREATE TABLE IF NOT EXISTS web_visitors (id TEXT PRIMARY KEY, last_seen TIMESTAMPTZ NOT NULL DEFAULT now());
   ALTER TABLE web_visitors ADD COLUMN IF NOT EXISTS account_id BIGINT;`,
).catch((e) => { ready = null; throw e; }));

// browsers looking at this account now; a failure here must never stop the dashboard
export async function onlineUsers(visitor: string | null, account: string): Promise<number | null> {
  try {
    await table();
    if (visitor && /^[a-zA-Z0-9-]{8,40}$/.test(visitor))
      await db().query(`INSERT INTO web_visitors (id, account_id) VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE SET account_id = $2, last_seen = now()`, [visitor, account]);
    if (Math.random() < .01) await db().query(`DELETE FROM web_visitors WHERE last_seen < now() - interval '1 day'`);
    const [row] = await read<{ n: number }>(`SELECT count(*)::int n FROM web_visitors
      WHERE account_id = $1 AND last_seen > now() - interval '${ONLINE_SECONDS} seconds'`, [account]);
    return row.n;
  } catch (e) {
    console.error(e);
    return null;
  }
}
