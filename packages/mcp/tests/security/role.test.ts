import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";

let container: StartedPostgreSqlContainer;
let adminClient: Client;
const PRISMA_DIR = path.resolve(__dirname, "../../../../apps/backend/prisma");
const VISION_READER_PASSWORD = "test-vision-reader-pw";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  adminClient = new Client({ connectionString: container.getConnectionUri() });
  await adminClient.connect();

  // Create the Company table (simplified for testing)
  await adminClient.query(`
    CREATE TABLE "Company" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Apply reconciliation_log migration
  const reconSql = readFileSync(
    path.join(PRISMA_DIR, "migrations/20260531000001_add_reconciliation_log/migration.sql"),
    "utf-8"
  );
  await adminClient.query(reconSql);

  // Apply vision_reader role migration
  const roleSql = readFileSync(
    path.join(PRISMA_DIR, "migrations/20260531000002_add_vision_reader_role/migration.sql"),
    "utf-8"
  );
  await adminClient.query(roleSql);

  // Set vision_reader password for test
  await adminClient.query(`ALTER ROLE vision_reader WITH PASSWORD '${VISION_READER_PASSWORD}'`);
}, 120_000);

afterAll(async () => {
  await adminClient.end();
  await container.stop();
});

function readerClient(): Client {
  const uri = new URL(container.getConnectionUri());
  uri.username = "vision_reader";
  uri.password = VISION_READER_PASSWORD;
  return new Client({ connectionString: uri.toString() });
}

describe("reconciliation_log schema", () => {
  it("has expected columns", async () => {
    const { rows } = await adminClient.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='reconciliation_log'
      ORDER BY ordinal_position
    `);
    const cols = rows.map((r) => r.column_name);
    expect(cols).toEqual(["id", "companyId", "throughDate", "source", "writtenBy", "writtenAt", "note"]);
  });

  it("enforces source CHECK constraint", async () => {
    await expect(
      adminClient.query(`
        INSERT INTO reconciliation_log (id, "companyId", "throughDate", source, "writtenBy")
        VALUES ('test1', 'comp1', CURRENT_DATE, 'invalid_source', 'tester')
      `)
    ).rejects.toThrow(/reconciliation_log_source_check|violates check constraint/i);
  });
});

describe("vision_reader role permissions", () => {
  it("cannot INSERT into reconciliation_log", async () => {
    const c = readerClient();
    await c.connect();
    await expect(
      c.query(`INSERT INTO reconciliation_log (id, "companyId", "throughDate", source, "writtenBy")
               VALUES ('x', 'c1', CURRENT_DATE, 'manual', 'test')`)
    ).rejects.toThrow(/permission denied/i);
    await c.end();
  });

  it("cannot SELECT from reconciliation_log directly", async () => {
    const c = readerClient();
    await c.connect();
    await expect(
      c.query(`SELECT * FROM reconciliation_log LIMIT 1`)
    ).rejects.toThrow(/permission denied/i);
    await c.end();
  });

  it("CAN SELECT from Company table", async () => {
    const c = readerClient();
    await c.connect();
    const r = await c.query(`SELECT id, "name" FROM "Company" LIMIT 5`);
    expect(r.rowCount).toBeGreaterThanOrEqual(0);
    await c.end();
  });

  it("CANNOT INSERT into Company table", async () => {
    const c = readerClient();
    await c.connect();
    await expect(
      c.query(`INSERT INTO "Company" (id, "userId", "name") VALUES ('evil', 'u1', 'evil')`)
    ).rejects.toThrow(/permission denied/i);
    await c.end();
  });
});
