import { describe, it, expect, vi } from "vitest";
import { projectCashHandler } from "../../src/tools/project_cash.js";
import { McpError } from "../../src/errors.js";

const COMPANY_A = "comp-alpha";
const COMPANY_B = "comp-beta";

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    status: "ok",
    company_id: COMPANY_A,
    projected_net_cents: "150000",
    band_low_cents: "105000",
    band_high_cents: "195000",
    confidence: "0.6",
    method: "linear_90d_avg",
    reconciled_through: "2026-05-20",
    required_through: "2026-05-15",
    message: null,
    ...overrides,
  };
}

function mockPool(rows: any[]) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as any;
}

describe("project_cash", () => {
  it("returns projections when all companies are reconciled", async () => {
    const rows = [
      makeRow({ company_id: COMPANY_A }),
      makeRow({ company_id: COMPANY_B }),
    ];
    const result = await projectCashHandler({ horizon_days: 30 }, mockPool(rows));

    expect(result.horizon_days).toBe(30);
    expect(result.projections).toHaveLength(2);
    expect(result.all_reconciled).toBe(true);
    expect(result.projections[0].projected_net_cents).toBe(150000);
    expect(result.projections[0].band_low_cents).toBe(105000);
    expect(result.projections[0].band_high_cents).toBe(195000);
    expect(result.projections[0].confidence).toBe(0.6);
    expect(result.projections[0].method).toBe("linear_90d_avg");
    expect(result.source).toMatch(/^autoinvoice-mcp@/);
  });

  it("throws RECONCILIATION_REQUIRED when gate blocks (allow_partial=false)", async () => {
    const rows = [
      makeRow({ company_id: COMPANY_A }),
      makeRow({
        company_id: COMPANY_B,
        status: "reconciliation_required",
        projected_net_cents: null,
        band_low_cents: null,
        band_high_cents: null,
        confidence: null,
        method: null,
        message: "Reconciliation needed for Company B",
      }),
    ];

    await expect(
      projectCashHandler({ horizon_days: 30 }, mockPool(rows))
    ).rejects.toThrow(McpError);

    try {
      await projectCashHandler({ horizon_days: 30 }, mockPool(rows));
    } catch (e) {
      const err = e as McpError;
      expect(err.code).toBe("RECONCILIATION_REQUIRED");
      expect(err.details?.companies_needing_reconciliation).toHaveLength(1);
      const companies = err.details!.companies_needing_reconciliation as any[];
      expect(companies[0].company_id).toBe(COMPANY_B);
    }
  });

  it("returns mixed results with allow_partial=true", async () => {
    const rows = [
      makeRow({ company_id: COMPANY_A }),
      makeRow({
        company_id: COMPANY_B,
        status: "reconciliation_required",
        projected_net_cents: null,
        band_low_cents: null,
        band_high_cents: null,
        confidence: null,
        method: null,
        message: "Needs reconciliation",
      }),
    ];

    const result = await projectCashHandler(
      { horizon_days: 30, allow_partial: true },
      mockPool(rows)
    );

    expect(result.projections).toHaveLength(2);
    expect(result.all_reconciled).toBe(false);
    expect(result.projections[0].status).toBe("ok");
    expect(result.projections[0].projected_net_cents).toBe(150000);
    expect(result.projections[1].status).toBe("reconciliation_required");
    expect(result.projections[1].projected_net_cents).toBeNull();
  });

  it("passes company_id filter correctly", async () => {
    const pool = mockPool([makeRow({ company_id: COMPANY_A })]);

    await projectCashHandler({ horizon_days: 60, company_id: COMPANY_A }, pool);

    expect(pool.query).toHaveBeenCalledWith(
      `SELECT * FROM f_project_cash($1, $2)`,
      [60, COMPANY_A]
    );
  });

  it("passes null when company_id is not provided", async () => {
    const pool = mockPool([makeRow()]);

    await projectCashHandler({ horizon_days: 90 }, pool);

    expect(pool.query).toHaveBeenCalledWith(
      `SELECT * FROM f_project_cash($1, $2)`,
      [90, null]
    );
  });

  it("validates horizon_days minimum (rejects 0)", async () => {
    await expect(
      projectCashHandler({ horizon_days: 0 }, mockPool([]))
    ).rejects.toThrow(McpError);
  });

  it("validates horizon_days maximum (rejects 366)", async () => {
    await expect(
      projectCashHandler({ horizon_days: 366 }, mockPool([]))
    ).rejects.toThrow(McpError);
  });

  it("validates horizon_days is required", async () => {
    await expect(
      projectCashHandler({}, mockPool([]))
    ).rejects.toThrow(McpError);
  });
});
