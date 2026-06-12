import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";

let container: StartedPostgreSqlContainer;
let client: Client;
const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../apps/backend/prisma/migrations");

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  client = new Client({ connectionString: container.getConnectionUri() });
  await client.connect();

  // Prerequisite tables (minimal columns the view touches)
  await client.query(`
    CREATE TABLE "Company" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "active" BOOLEAN NOT NULL DEFAULT true
    );
    CREATE TABLE "TaxAccount" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "accountType" TEXT NOT NULL
    );
    CREATE TABLE "Vendor" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "name" TEXT NOT NULL
    );
    CREATE TABLE "BankAccount" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "name" TEXT NOT NULL
    );
    CREATE TABLE "BankTransaction" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "bankAccountId" TEXT NOT NULL,
      "date" TIMESTAMPTZ NOT NULL,
      "description" TEXT NOT NULL,
      "amount" DECIMAL(10,2) NOT NULL,
      "taxAccountId" TEXT,
      "vendorId" TEXT,
      "vendorRaw" TEXT,
      "parentId" TEXT,
      "isSplit" BOOLEAN NOT NULL DEFAULT false
    );
  `);

  const sql = readFileSync(
    path.join(MIGRATIONS_DIR, "20260612000001_v_transactions_search", "migration.sql"),
    "utf-8"
  );
  await client.query(sql);

  await client.query(`
    INSERT INTO "Company" ("id", "userId", "name") VALUES ('co1', 'u1', 'Donovan Farms');
    INSERT INTO "TaxAccount" ("id", "companyId", "code", "name", "accountType") VALUES
      ('ta-office', 'co1', '6100', 'Office Supplies', 'EXPENSE_OPERATING'),
      ('ta-hw', 'co1', '6200', 'Hardware', 'EXPENSE_OPERATING');
    INSERT INTO "Vendor" ("id", "companyId", "name") VALUES ('ven-amazon', 'co1', 'Amazon');
    INSERT INTO "BankAccount" ("id", "companyId", "name") VALUES ('ba1', 'co1', 'Business Card');
    INSERT INTO "BankTransaction"
      ("id", "companyId", "bankAccountId", "date", "description", "amount",
       "taxAccountId", "vendorId", "vendorRaw", "parentId", "isSplit") VALUES
      -- plain transaction with matched vendor
      ('bt-plain', 'co1', 'ba1', '2026-02-01', 'AMAZON.COM*MF4Y', -50.00,
       'ta-office', 'ven-amazon', 'AMAZON.COM*MF4Y', NULL, false),
      -- unmatched vendor: raw descriptor must surface as vendor
      ('bt-raw', 'co1', 'ba1', '2026-02-02', 'SHELL OIL 5571', -30.00,
       NULL, NULL, 'SHELL OIL 5571', NULL, false),
      -- split parent (must be EXCLUDED) with two children (must be INCLUDED)
      ('bt-parent', 'co1', 'ba1', '2026-02-03', 'AMAZON.COM*SPLIT', -100.00,
       NULL, 'ven-amazon', NULL, NULL, true),
      ('bt-child1', 'co1', 'ba1', '2026-02-03', 'AMAZON.COM*SPLIT', -60.00,
       'ta-office', 'ven-amazon', NULL, 'bt-parent', false),
      ('bt-child2', 'co1', 'ba1', '2026-02-03', 'AMAZON.COM*SPLIT', -40.00,
       'ta-hw', 'ven-amazon', NULL, 'bt-parent', false);
  `);
}, 120_000);

afterAll(async () => {
  await client.end();
  await container.stop();
});

describe("v_transactions_search — shape and split-safety", () => {
  it("has expected columns", async () => {
    const r = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema='public' AND table_name='v_transactions_search'
       ORDER BY ordinal_position`
    );
    expect(r.rows.map((c: any) => c.column_name)).toEqual([
      "transaction_id", "date", "company_id", "amount_cents",
      "description", "vendor", "category", "account_name",
    ]);
    expect(r.rows.find((c: any) => c.column_name === "amount_cents")?.data_type).toBe("bigint");
  });

  it("excludes split parents, includes split children — sum never double-counts", async () => {
    const r = await client.query(
      `SELECT transaction_id FROM v_transactions_search ORDER BY transaction_id`
    );
    const ids = r.rows.map((row: any) => row.transaction_id);
    expect(ids).not.toContain("bt-parent");
    expect(ids).toContain("bt-child1");
    expect(ids).toContain("bt-child2");

    const sum = await client.query(
      `SELECT SUM(amount_cents)::bigint AS cents FROM v_transactions_search WHERE vendor = 'Amazon'`
    );
    // -50.00 plain + (-60.00 + -40.00) children; parent -100.00 NOT counted again
    expect(sum.rows[0].cents).toBe("-15000");
  });

  it("surfaces matched vendor name, falling back to raw descriptor", async () => {
    const r = await client.query(
      `SELECT transaction_id, vendor, category, account_name, amount_cents
       FROM v_transactions_search WHERE transaction_id IN ('bt-plain', 'bt-raw')
       ORDER BY transaction_id`
    );
    expect(r.rows[0]).toMatchObject({
      transaction_id: "bt-plain",
      vendor: "Amazon",
      category: "Office Supplies",
      account_name: "Business Card",
      amount_cents: "-5000",
    });
    expect(r.rows[1]).toMatchObject({
      transaction_id: "bt-raw",
      vendor: "SHELL OIL 5571",
      category: null,
      amount_cents: "-3000",
    });
  });
});
