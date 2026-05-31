import { describe, it, expect, vi } from "vitest";
import { getPulseHandler } from "../../src/tools/get_pulse.js";

const FARMS = "comp-farms";
const BB = "comp-bb";

function mockPool(opts: { ytd?: any[]; recon?: any[]; companies?: any[] } = {}) {
  const companies = opts.companies ?? [
    { id: FARMS, name: "Donovan Farms" },
    { id: BB, name: "Business Builders" },
  ];
  const ytd = opts.ytd ?? [
    { company_id: FARMS, ytd_inflow_cents: "5000000", ytd_expenses_cents: "3000000", ytd_supernova_cents: "100000", ytd_net_cents: "1900000" },
    { company_id: BB, ytd_inflow_cents: "4000000", ytd_expenses_cents: "2000000", ytd_supernova_cents: "100000", ytd_net_cents: "1900000" },
  ];
  const recon = opts.recon ?? [];

  return {
    query: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('"Company"')) return { rows: companies };
      if (sql.includes("v_ytd_pulse")) return { rows: ytd };
      if (sql.includes("reconciliation_log")) return { rows: recon };
      return { rows: [] };
    }),
  } as any;
}

describe("get_pulse", () => {
  it("returns YTD aggregates + data_quality gaps for never-reconciled companies", async () => {
    const r = await getPulseHandler({}, mockPool());
    expect(r.companies).toHaveLength(2);
    expect(r.ytd_net_cents).toBe(3800000);
    expect(r.gap_to_1m_cents).toBe(100_000_000 - 3800000);
    expect(r.data_quality.gaps).toHaveLength(2);
    expect(r.data_quality.gaps[0].reason).toBe("never_reconciled");
    expect(r.source).toMatch(/^autoinvoice-mcp@/);
  });

  it("computes weeks_remaining correctly", async () => {
    const r = await getPulseHandler({ week: 22, year: 2026 }, mockPool());
    expect(r.weeks_remaining).toBe(30);
    expect(r.week).toBe(22);
    expect(r.year).toBe(2026);
  });

  it("marks companies as stale when recon date is before required", async () => {
    const oldDate = "2026-01-01";
    const recon = [{ company_id: FARMS, through_date: oldDate }];
    const r = await getPulseHandler({ week: 22, year: 2026 }, mockPool({ recon }));
    const farmsGap = r.data_quality.gaps.find((g: any) => g.company_id === FARMS);
    expect(farmsGap?.reason).toBe("stale");
  });

  it("no gap when reconciliation is recent enough", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const recon = [
      { company_id: FARMS, through_date: today },
      { company_id: BB, through_date: today },
    ];
    const r = await getPulseHandler({}, mockPool({ recon }));
    expect(r.data_quality.gaps).toHaveLength(0);
  });
});
