import { Pool, QueryResultRow } from "pg";

// one pool per server instance; serverless functions reuse it between requests
const g = globalThis as unknown as { pool?: Pool };

export function db(): Pool {
  if (!g.pool) {
    g.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
    // a function frozen between requests finds its idle connections closed: drop them instead of crashing
    g.pool.on("error", (e) => console.error("idle database connection lost", e.message));
  }
  return g.pool;
}

const DROPPED = /terminated|ECONNRESET|EPIPE|timeout|Connection ended|closed/i;

// read query that retries once on a dropped connection
export async function read<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    return (await db().query<T>(sql, params)).rows;
  } catch (e) {
    if (!DROPPED.test(String(e))) throw e;
    return (await db().query<T>(sql, params)).rows;
  }
}
