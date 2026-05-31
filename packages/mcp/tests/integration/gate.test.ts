import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";

let container: StartedPostgreSqlContainer;
let client: Client;
const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../apps/backend/prisma/migrations");
const COMPANY_ID = "test-company-1";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  client = new Client({ connectionString: container.getConnectionUri() });
  await client.connect();

  // Create tables
  await client.query(`
    CREATE TABLE "Company" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "fiscalYearStart" TEXT DEFAULT '01-01',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE "TaxAccount" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "accountType" TEXT NOT NULL,
      "taxTreatment" TEXT NOT NULL DEFAULT '100%',
      "active" BOOLEAN DEFAULT true,
      "isSystemAccount" BOOLEAN DEFAULT false,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE "BankTransaction" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "bankAccountId" TEXT NOT NULL,
      "date" TIMESTAMPTZ NOT NULL,
      "description" TEXT NOT NULL,
      "amount" DECIMAL(10,2) NOT NULL,
      "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
      "taxAccountId" TEXT,
      "vendorId" TEXT,
      "parentId" TEXT,
      "isSplit" BOOLEAN NOT NULL DEFAULT false,
      "needsReview" BOOLEAN DEFAULT true,
      "isManualCategorization" BOOLEAN DEFAULT false,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Apply all migrations
  for (const dir of [
    "20260531000001_add_reconciliation_log",
    "20260531000002_add_vision_reader_role",
    "20260531000003_add_sql_views",
    "20260531000004_add_f_project_cash",
  ]) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf-8");
    await client.query(sql);
  }

  // Seed test company
  await client.query(
    `INSERT INTO "Company" (id, "userId", name) VALUES ($1, 'user1', 'Donovan Farms')`,
    [COMPANY_ID]
  );
}, 120_000);

afterAll(async () => {
  await client.end();
  await container.stop();
});

describe("f_project_cash gate behavior", () => {
  it("returns reconciliation_required when log is missing", async () => {
    const r = await client.query(
      `SELECT status, projected_net_cents FROM f_project_cash(30, $1)`,
      [COMPANY_ID]
    );
    expect(r.rows[0].status).toBe("reconciliation_required");
    expect(r.rows[0].projected_net_cents).toBeNull();
  });

  it("returns ok when reconciliation_log is fresh", async () => {
    await client.query(
      `INSERT INTO reconciliation_log (id, "companyId", "throughDate", source, "writtenBy")
       VALUES ('recon1', $1, CURRENT_DATE, 'manual', 'test')`,
      [COMPANY_ID]
    );
    const r = await client.query(
      `SELECT status FROM f_project_cash(30, $1)`,
      [COMPANY_ID]
    );
    expect(r.rows[0].status).toBe("ok");
  });

  it("returns reconciliation_required when log is stale (>7d before week start)", async () => {
    await client.query(`DELETE FROM reconciliation_log WHERE "companyId" = $1`, [COMPANY_ID]);
    await client.query(
      `INSERT INTO reconciliation_log (id, "companyId", "throughDate", source, "writtenBy")
       VALUES ('recon2', $1, CURRENT_DATE - INTERVAL '60 days', 'manual', 'test')`,
      [COMPANY_ID]
    );
    const r = await client.query(
      `SELECT status FROM f_project_cash(30, $1)`,
      [COMPANY_ID]
    );
    expect(r.rows[0].status).toBe("reconciliation_required");
  });
});
