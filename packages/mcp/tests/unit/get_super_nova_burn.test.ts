import { describe, it, expect, vi } from "vitest";
import { getSuperNovaBurnHandler } from "../../src/tools/get_super_nova_burn.js";

function mockPool(rows: any[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as any;
}

describe("get_super_nova_burn", () => {
  it("returns entries with correct totals", async () => {
    const rows = [
      { date: "2026-02-10", category: "Super Nova - Parts", cents: 15000 },
      { date: "2026-02-09", category: "Super Nova - Software", cents: 5000 },
    ];
    const r = await getSuperNovaBurnHandler(
      { start_date: "2026-02-01", end_date: "2026-02-10" },
      mockPool(rows)
    );
    expect(r.entries).toHaveLength(2);
    expect(r.total_burn_cents).toBe(20000);
    // 10 days in range (Feb 1 through Feb 10 inclusive)
    expect(r.daily_avg_cents).toBe(Math.round(20000 / 10));
    expect(r.start_date).toBe("2026-02-01");
    expect(r.end_date).toBe("2026-02-10");
    expect(r.source).toMatch(/^autoinvoice-mcp@/);
  });

  it("defaults to current year when no dates provided", async () => {
    const r = await getSuperNovaBurnHandler({}, mockPool([]));
    const year = new Date().getUTCFullYear();
    expect(r.start_date).toBe(`${year}-01-01`);
    expect(r.end_date).toBe(new Date().toISOString().slice(0, 10));
  });

  it("handles empty results (no burn data)", async () => {
    const r = await getSuperNovaBurnHandler(
      { start_date: "2026-03-01", end_date: "2026-03-31" },
      mockPool([])
    );
    expect(r.entries).toHaveLength(0);
    expect(r.total_burn_cents).toBe(0);
    expect(r.daily_avg_cents).toBe(0);
  });

  it("validates date format", async () => {
    await expect(
      getSuperNovaBurnHandler({ start_date: "not-a-date" }, mockPool([]))
    ).rejects.toThrow();
  });

  it("throws on invalid date range (start > end)", async () => {
    await expect(
      getSuperNovaBurnHandler(
        { start_date: "2026-03-15", end_date: "2026-03-01" },
        mockPool([])
      )
    ).rejects.toThrow("start_date must be <= end_date");
  });
});
