import { Pool } from "pg";

// one pool per server instance; serverless functions reuse it between requests
const g = globalThis as unknown as { pool?: Pool };

export function db(): Pool {
  if (!g.pool) g.pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return g.pool;
}
