import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { getCompanyCashflowHandler } from "../../src/tools/get_company_cashflow.js";

let container: StartedPostgreSqlContainer;
let client: Client;

const COMPANY_A = "tenant-a";
const COMPANY_B = "tenant-b";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  client = new Client({ connectionString: container.getConnectionUri() });
  await client.connect();

  // Create tables
  await client.query(`
    CREATE TABLE "Company" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "name" TEXT NOT NULL, "active" BOOLEAN DEFAULT true, "createdAt" TIMESTAMPTZ DEFAULT now(), "updatedAt" TIMESTAMPTZ DEFAULT now());
    CREATE TABLE "TaxAccount" ("id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "accountType" TEXT NOT NULL, "taxTreatment" TEXT DEFAULT '100%', "active" BOOLEAN DEFAULT true, "isSystemAccount" BOOLEAN DEFAULT false, "createdAt" TIMESTAMPTZ DEFAULT now(), "updatedAt" TIMESTAMPTZ DEFAULT now());
    CREATE TABLE "BankTransaction" ("id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "bankAccountId" TEXT NOT NULL, "date" TIMESTAMPTZ NOT NULL, "description" TEXT NOT NULL, "amount" DECIMAL(10,2) NOT NULL, "balance" DECIMAL(10,2) DEFAULT 0, "taxAccountId" TEXT, "vendorId" TEXT, "parentId" TEXT, "isSplit" BOOLEAN DEFAULT false, "needsReview" BOOLEAN DEFAULT true, "isManualCategorization" BOOLEAN DEFAULT false, "createdAt" TIMESTAMPTZ DEFAULT now(), "updatedAt" TIMESTAMPTZ DEFAULT now());
  `);

  // Create only the v_company_cash_daily view (the one this test needs)
  await client.query(`
    CREATE OR REPLACE VIEW v_company_cash_daily AS
    SELECT
      bt."companyId" AS company_id,
      bt.date::date AS date,
      (COALESCE(SUM(bt.amount) FILTER (WHERE bt.amount > 0), 0) * 100)::bigint AS gross_inflow_cents,
      (COALESCE(SUM(ABS(bt.amount)) FILTER (WHERE bt.amount < 0), 0) * 100)::bigint AS expenses_cents,
      (COALESCE(SUM(bt.amount), 0) * 100)::bigint AS net_cents
    FROM "BankTransaction" bt
    WHERE (bt."isSplit" = false AND bt."parentId" IS NULL)
       OR bt."parentId" IS NOT NULL
    GROUP BY bt."companyId", bt.date::date;
  `);

  // Seed companies
  await client.query(`INSERT INTO "Company" (id, "userId", name) VALUES ($1, 'u1', 'Company A'), ($2, 'u2', 'Company B')`, [COMPANY_A, COMPANY_B]);

  // Seed transactions — A gets $100 inflow, B gets $200 inflow on same day
  await client.query(`
    INSERT INTO "BankTransaction" (id, "companyId", "bankAccountId", date, description, amount) VALUES
    ('tx1', $1, 'bank1', '2026-03-15', 'Payment from client', 100.00),
    ('tx2', $2, 'bank2', '2026-03-15', 'Big payment', 200.00)
  `, [COMPANY_A, COMPANY_B]);
}, 120_000);

afterAll(async () => { await client.end(); await container.stop(); });

describe("cross-tenant isolation", () => {
  it("company A only sees its own cashflow", async () => {
    const pool = { query: (sql: string, params?: any[]) => client.query(sql, params) } as any;
    const result = await getCompanyCashflowHandler(
      { company_id: COMPANY_A, start_date: "2026-03-01", end_date: "2026-03-31" },
      pool
    );
    expect(result.company_id).toBe(COMPANY_A);
    expect(result.totals.gross_inflow_cents).toBe(10000); // $100 = 10000 cents
    // Must NOT contain B's $200
    const hasB = result.days.some((d: any) => d.gross_inflow_cents === 20000);
    expect(hasB).toBe(false);
  });

  it("company B only sees its own cashflow", async () => {
    const pool = { query: (sql: string, params?: any[]) => client.query(sql, params) } as any;
    const result = await getCompanyCashflowHandler(
      { company_id: COMPANY_B, start_date: "2026-03-01", end_date: "2026-03-31" },
      pool
    );
    expect(result.company_id).toBe(COMPANY_B);
    expect(result.totals.gross_inflow_cents).toBe(20000); // $200
  });
});
