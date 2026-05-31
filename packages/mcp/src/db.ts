import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.AUTOINVOICE_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("AUTOINVOICE_DATABASE_URL or DATABASE_URL must be set");
    }
    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

export async function disconnect(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
