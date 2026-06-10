import { describe, it, expect, vi } from "vitest";
import { getDsoHandler } from "../../src/tools/get_dso.js";

function mockPool(rows: any[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as any;
}

describe("get_dso", () => {
  it("computes correct DSO with sample data", async () => {
    // 5 invoices with known issue→paid gaps
    const rows = [
      { issue_date: "2026-01-01", paid_date: "2026-01-15" }, // 14 days
      { issue_date: "2026-01-05", paid_date: "2026-01-25" }, // 20 days
      { issue_date: "2026-02-01", paid_date: "2026-03-03" }, // 30 days
      { issue_date: "2026-02-10", paid_date: "2026-03-22" }, // 40 days
      { issue_date: "2026-03-01", paid_date: "2026-03-11" }, // 10 days
    ];

    const r = await getDsoHandler({}, mockPool(rows));

    // mean = (14 + 20 + 30 + 40 + 10) / 5 = 22.8
    expect(r.dso_days).toBe(22.8);
    expect(r.sample_size).toBe(5);
    expect(r.lookback_months).toBe(6);
    expect(r.method).toBe("mean_paid_invoices");
    expect(r.source).toMatch(/^autoinvoice-mcp@/);
  });

  it("throws INSUFFICIENT_DATA when < 3 invoices", async () => {
    const rows = [
      { issue_date: "2026-01-01", paid_date: "2026-01-15" },
      { issue_date: "2026-01-05", paid_date: "2026-01-25" },
    ];

    await expect(getDsoHandler({}, mockPool(rows))).rejects.toMatchObject({
      code: "INSUFFICIENT_DATA",
      details: { sample_size: 2, min_required: 3 },
    });
  });

  it("uses default 6 months when not specified", async () => {
    const pool = mockPool([
      { issue_date: "2026-01-01", paid_date: "2026-01-10" },
      { issue_date: "2026-01-02", paid_date: "2026-01-12" },
      { issue_date: "2026-01-03", paid_date: "2026-01-13" },
    ]);

    await getDsoHandler({}, pool);

    // Verify the query was called with "6" (default months)
    expect(pool.query).toHaveBeenCalledWith(
      expect.any(String),
      ["6"]
    );
  });

  it("accepts custom months param", async () => {
    const pool = mockPool([
      { issue_date: "2026-01-01", paid_date: "2026-01-10" },
      { issue_date: "2026-01-02", paid_date: "2026-01-12" },
      { issue_date: "2026-01-03", paid_date: "2026-01-13" },
    ]);

    await getDsoHandler({ months: 12 }, pool);

    expect(pool.query).toHaveBeenCalledWith(
      expect.any(String),
      ["12"]
    );
  });

  it("bounds are p10 and p90", async () => {
    // 10 invoices with known DSO values to make p10/p90 predictable
    const rows = [
      { issue_date: "2026-01-01", paid_date: "2026-01-06" },  //  5 days
      { issue_date: "2026-01-01", paid_date: "2026-01-11" },  // 10 days
      { issue_date: "2026-01-01", paid_date: "2026-01-16" },  // 15 days
      { issue_date: "2026-01-01", paid_date: "2026-01-21" },  // 20 days
      { issue_date: "2026-01-01", paid_date: "2026-01-26" },  // 25 days
      { issue_date: "2026-01-01", paid_date: "2026-01-31" },  // 30 days
      { issue_date: "2026-01-01", paid_date: "2026-02-05" },  // 35 days
      { issue_date: "2026-01-01", paid_date: "2026-02-10" },  // 40 days
      { issue_date: "2026-01-01", paid_date: "2026-02-15" },  // 45 days
      { issue_date: "2026-01-01", paid_date: "2026-02-20" },  // 50 days
    ];

    const r = await getDsoHandler({}, mockPool(rows));

    // sorted = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]
    // p10 index = floor(10 * 0.1) = 1 → sorted[1] = 10
    // p90 index = floor(10 * 0.9) = 9 → sorted[9] = 50
    expect(r.bounds.low_days).toBe(10);
    expect(r.bounds.high_days).toBe(50);
  });

  it("throws INVALID_PARAM on invalid months", async () => {
    await expect(getDsoHandler({ months: 0 }, mockPool([]))).rejects.toMatchObject({
      code: "INVALID_PARAM",
    });

    await expect(getDsoHandler({ months: 25 }, mockPool([]))).rejects.toMatchObject({
      code: "INVALID_PARAM",
    });
  });

  it("clamps negative DSO values to 0", async () => {
    // Edge case: paid_date before issue_date (data anomaly)
    const rows = [
      { issue_date: "2026-01-15", paid_date: "2026-01-10" }, // -5 → clamped to 0
      { issue_date: "2026-01-01", paid_date: "2026-01-11" }, // 10
      { issue_date: "2026-01-01", paid_date: "2026-01-21" }, // 20
    ];

    const r = await getDsoHandler({}, mockPool(rows));

    // mean = (0 + 10 + 20) / 3 = 10
    expect(r.dso_days).toBe(10);
  });
});
