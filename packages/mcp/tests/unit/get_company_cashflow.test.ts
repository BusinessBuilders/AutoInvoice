import { describe, it, expect, vi } from "vitest";
import { getCompanyCashflowHandler } from "../../src/tools/get_company_cashflow.js";

const COMPANY_ID = "comp-farms";
const COMPANY_NAME = "Donovan Farms";

function mockPool(opts: { company?: any; cashRows?: any[] } = {}) {
  const company = opts.company ?? { id: COMPANY_ID, name: COMPANY_NAME };
  const cashRows = opts.cashRows ?? [
    { date: new Date("2026-03-15"), gross_inflow_cents: "50000", expenses_cents: "20000", net_cents: "30000" },
    { date: new Date("2026-03-16"), gross_inflow_cents: "10000", expenses_cents: "5000", net_cents: "5000" },
  ];

  return {
    query: vi.fn().mockImplementation((sql: string, params?: any[]) => {
      if (sql.includes('"Company"')) {
        return { rows: company ? [company] : [] };
      }
      if (sql.includes("v_company_cash_daily")) {
        return { rows: cashRows };
      }
      return { rows: [] };
    }),
  } as any;
}

describe("get_company_cashflow", () => {
  it("returns cashflow data for valid company + date range", async () => {
    const pool = mockPool();
    const result = await getCompanyCashflowHandler(
      { company_id: COMPANY_ID, start_date: "2026-03-01", end_date: "2026-03-31" },
      pool
    );

    expect(result.company_id).toBe(COMPANY_ID);
    expect(result.company_name).toBe(COMPANY_NAME);
    expect(result.start_date).toBe("2026-03-01");
    expect(result.end_date).toBe("2026-03-31");
    expect(result.days).toHaveLength(2);
    expect(result.days[0]).toEqual({
      date: "2026-03-15",
      gross_inflow_cents: 50000,
      expenses_cents: 20000,
      net_cents: 30000,
    });
    expect(result.totals).toEqual({
      gross_inflow_cents: 60000,
      expenses_cents: 25000,
      net_cents: 35000,
    });
    expect(result.source).toMatch(/^autoinvoice-mcp@/);
  });

  it("throws COMPANY_NOT_FOUND for non-existent company", async () => {
    const pool = mockPool({ company: null });
    // override the mock to return empty rows for company query
    pool.query = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('"Company"')) return { rows: [] };
      return { rows: [] };
    });

    await expect(
      getCompanyCashflowHandler(
        { company_id: "nonexistent", start_date: "2026-03-01", end_date: "2026-03-31" },
        pool
      )
    ).rejects.toMatchObject({ code: "COMPANY_NOT_FOUND" });
  });

  it("throws INVALID_DATE_RANGE when start > end", async () => {
    const pool = mockPool();
    await expect(
      getCompanyCashflowHandler(
        { company_id: COMPANY_ID, start_date: "2026-04-01", end_date: "2026-03-01" },
        pool
      )
    ).rejects.toMatchObject({ code: "INVALID_DATE_RANGE" });
  });

  it("throws INVALID_DATE_RANGE when range > 365 days", async () => {
    const pool = mockPool();
    await expect(
      getCompanyCashflowHandler(
        { company_id: COMPANY_ID, start_date: "2025-01-01", end_date: "2026-03-01" },
        pool
      )
    ).rejects.toMatchObject({ code: "INVALID_DATE_RANGE" });
  });

  it("parameterized query uses provided company_id to prevent cross-tenant access", async () => {
    const pool = mockPool();
    await getCompanyCashflowHandler(
      { company_id: COMPANY_ID, start_date: "2026-03-01", end_date: "2026-03-31" },
      pool
    );

    // Find the v_company_cash_daily query call
    const cashCall = pool.query.mock.calls.find((call: any[]) =>
      call[0].includes("v_company_cash_daily")
    );
    expect(cashCall).toBeDefined();
    // Verify it uses parameterized $1 with company_id
    expect(cashCall![0]).toContain("company_id = $1");
    expect(cashCall![1]).toContain(COMPANY_ID);
  });
});
