import { describe, it, expect, vi } from "vitest";
import { searchTransactionsHandler } from "../../src/tools/search_transactions.js";

const ROW = {
  transaction_id: "bt-1",
  date: new Date("2026-02-01"),
  company_id: "co1",
  amount_cents: "-5000",
  description: "AMAZON.COM*MF4Y",
  vendor: "Amazon",
  category: "Office Supplies",
  account_name: "Business Card",
};

function mockPool(opts: { rows?: any[]; matchCount?: number; totalCents?: string } = {}) {
  const rows = opts.rows ?? [ROW];
  return {
    query: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes("count(*)")) {
        return {
          rows: [{ match_count: opts.matchCount ?? rows.length, total_cents: opts.totalCents ?? "-5000" }],
        };
      }
      return { rows };
    }),
  } as any;
}

describe("search_transactions", () => {
  it("returns mapped transactions with totals over all matches", async () => {
    const pool = mockPool({ matchCount: 120, totalCents: "-987654" });
    const result = await searchTransactionsHandler({ text: "amazon" }, pool);

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toEqual({
      transaction_id: "bt-1",
      date: "2026-02-01",
      company_id: "co1",
      amount_cents: -5000,
      description: "AMAZON.COM*MF4Y",
      vendor: "Amazon",
      category: "Office Supplies",
      account_name: "Business Card",
    });
    expect(result.returned).toBe(1);
    expect(result.match_count).toBe(120);
    expect(result.total_cents).toBe(-987654);
    expect(result.limit).toBe(50);
  });

  it("passes all filters as parameters and applies the limit", async () => {
    const pool = mockPool();
    await searchTransactionsHandler(
      {
        company_id: "co1",
        start_date: "2026-01-01",
        end_date: "2026-03-31",
        text: "AMZN",
        category: "office",
        min_amount_cents: -100000,
        max_amount_cents: 0,
        limit: 10,
      },
      pool
    );

    const [listSql, listParams] = pool.query.mock.calls[0];
    expect(listSql).toContain("v_transactions_search");
    expect(listParams).toEqual(["co1", "2026-01-01", "2026-03-31", "AMZN", "office", -100000, 0, 10]);

    const [aggSql, aggParams] = pool.query.mock.calls[1];
    expect(aggSql).toContain("count(*)");
    expect(aggParams).toEqual(["co1", "2026-01-01", "2026-03-31", "AMZN", "office", -100000, 0]);
  });

  it("defaults: no filters → all-null params, limit 50", async () => {
    const pool = mockPool();
    await searchTransactionsHandler({}, pool);
    const [, listParams] = pool.query.mock.calls[0];
    expect(listParams).toEqual([null, null, null, null, null, null, null, 50]);
  });

  it("rejects bad dates, inverted ranges, and out-of-range limits", async () => {
    const pool = mockPool();
    await expect(searchTransactionsHandler({ start_date: "02/01/2026" }, pool)).rejects.toThrow(/YYYY-MM-DD/);
    await expect(
      searchTransactionsHandler({ start_date: "2026-03-01", end_date: "2026-01-01" }, pool)
    ).rejects.toThrow(/start_date must be <= end_date/);
    await expect(searchTransactionsHandler({ limit: 501 }, pool)).rejects.toThrow();
    await expect(searchTransactionsHandler({ limit: 0 }, pool)).rejects.toThrow();
    expect(pool.query).not.toHaveBeenCalled();
  });
});
