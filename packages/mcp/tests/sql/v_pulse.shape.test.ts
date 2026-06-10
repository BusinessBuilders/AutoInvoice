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

  // Create prerequisite tables
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

  for (const migration of [
    "20260531000001_add_reconciliation_log",
    "20260531000002_add_vision_reader_role",
    "20260531000003_add_sql_views",
    "20260531000004_add_f_project_cash",
    "20260607000001_tax_account_aware_wealth_views",
  ]) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, migration, "migration.sql"), "utf-8");
    await client.query(sql);
  }
}, 120_000);

afterAll(async () => {
  await client.end();
  await container.stop();
});

async function viewColumns(view: string) {
  const r = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [view]
  );
  return r.rows;
}

describe("SQL views — shape and types", () => {
  it("v_company_cash_daily has expected columns", async () => {
    const cols = await viewColumns("v_company_cash_daily");
    expect(cols.map((c: any) => c.column_name)).toEqual([
      "company_id", "date", "gross_inflow_cents", "expenses_cents", "net_cents"
    ]);
    expect(cols.find((c: any) => c.column_name === "net_cents")?.data_type).toBe("bigint");
  });

  it("v_ytd_pulse has expected columns", async () => {
    const cols = await viewColumns("v_ytd_pulse");
    expect(cols.map((c: any) => c.column_name)).toEqual([
      "year", "company_id", "ytd_inflow_cents", "ytd_expenses_cents",
      "ytd_supernova_cents", "ytd_net_cents"
    ]);
  });

  it("v_super_nova_burn has expected columns", async () => {
    const cols = await viewColumns("v_super_nova_burn");
    expect(cols.map((c: any) => c.column_name)).toEqual(["date", "category", "cents"]);
  });

  it("calculates pulse from tax-report categories, not raw cash movement signs", async () => {
    await client.query(`
      INSERT INTO "Company" ("id", "userId", "name") VALUES ('co-tax-aware', 'u1', 'Tax Aware Co');
      INSERT INTO "TaxAccount" ("id", "companyId", "code", "name", "accountType") VALUES
        ('ta-income', 'co-tax-aware', '4000', 'Gross Receipts', 'INCOME'),
        ('ta-transfer', 'co-tax-aware', '1000', 'Transfer', 'TRANSFER'),
        ('ta-expense', 'co-tax-aware', '5000', 'Tools', 'EXPENSE_OPERATING'),
        ('ta-liability', 'co-tax-aware', '2100', 'Credit Card Payable', 'LIABILITY'),
        ('ta-asset', 'co-tax-aware', '1100', 'Petty Cash', 'ASSET');
      INSERT INTO "BankTransaction" (
        "id", "companyId", "bankAccountId", "date", "description", "amount", "taxAccountId", "needsReview"
      ) VALUES
        ('bt-income', 'co-tax-aware', 'ba1', '2026-01-05', 'Customer payment', 1000.00, 'ta-income', false),
        ('bt-transfer-in', 'co-tax-aware', 'ba1', '2026-01-05', 'Internal transfer in', 500.00, 'ta-transfer', false),
        ('bt-uncat-in', 'co-tax-aware', 'ba1', '2026-01-05', 'Unknown deposit', 200.00, NULL, true),
        ('bt-expense', 'co-tax-aware', 'ba1', '2026-01-06', 'Tool purchase', -300.00, 'ta-expense', false),
        ('bt-liability', 'co-tax-aware', 'ba1', '2026-01-07', 'Credit card payment', -400.00, 'ta-liability', false),
        ('bt-transfer-out', 'co-tax-aware', 'ba1', '2026-01-08', 'Internal transfer out', -50.00, 'ta-transfer', false),
        ('bt-asset', 'co-tax-aware', 'ba1', '2026-01-09', 'Petty cash move', -25.00, 'ta-asset', false);
    `);

    const pulse = await client.query(`
      SELECT ytd_inflow_cents, ytd_expenses_cents, ytd_net_cents
      FROM v_ytd_pulse
      WHERE year = 2026 AND company_id = 'co-tax-aware'
    `);

    expect(pulse.rows[0]).toEqual({
      ytd_inflow_cents: "100000",
      ytd_expenses_cents: "30000",
      ytd_net_cents: "70000",
    });
  });
});
