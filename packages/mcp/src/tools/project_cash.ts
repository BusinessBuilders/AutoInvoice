import { z } from "zod";
import { getPool } from "../db.js";
import { McpError } from "../errors.js";
import { SOURCE_TAG } from "../constants.js";
import type pg from "pg";

export const InputSchema = z.object({
  horizon_days: z.number().int().min(1).max(365),
  company_id: z.string().optional(),
  allow_partial: z.boolean().optional().default(false),
});

export const toolSpec = {
  name: "project_cash",
  description:
    "Project future cash position for a given horizon. Blocks with RECONCILIATION_REQUIRED if any company needs reconciliation (unless allow_partial=true).",
  inputSchema: {
    type: "object" as const,
    properties: {
      horizon_days: {
        type: "integer",
        minimum: 1,
        maximum: 365,
        description: "Number of days to project forward (1-365)",
      },
      company_id: {
        type: "string",
        description: "Filter to a single company (optional)",
      },
      allow_partial: {
        type: "boolean",
        description: "If true, return results even when some companies need reconciliation (default false)",
      },
    },
    required: ["horizon_days"],
  },
};

interface ProjectionRow {
  status: string;
  company_id: string;
  projected_net_cents: string | null;
  band_low_cents: string | null;
  band_high_cents: string | null;
  confidence: string | null;
  method: string | null;
  reconciled_through: string | null;
  required_through: string | null;
  message: string | null;
}

export async function projectCashHandler(input: unknown, pool?: pg.Pool) {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) throw new McpError("INVALID_PARAM", parsed.error.message);

  const { horizon_days, company_id, allow_partial } = parsed.data;
  const db = pool ?? getPool();

  const result = await db.query<ProjectionRow>(
    `SELECT * FROM f_project_cash($1, $2)`,
    [horizon_days, company_id ?? null]
  );

  const rows = result.rows;

  // Check for reconciliation-required rows
  const needsRecon = rows.filter((r) => r.status === "reconciliation_required");

  if (!allow_partial && needsRecon.length > 0) {
    throw new McpError(
      "RECONCILIATION_REQUIRED",
      `${needsRecon.length} company/companies need reconciliation before projections are available.`,
      {
        companies_needing_reconciliation: needsRecon.map((r) => ({
          company_id: r.company_id,
          reconciled_through: r.reconciled_through,
          required_through: r.required_through,
          message: r.message,
        })),
      }
    );
  }

  const projections = rows.map((r) => ({
    company_id: r.company_id,
    status: r.status,
    projected_net_cents: r.projected_net_cents != null ? Number(r.projected_net_cents) : null,
    band_low_cents: r.band_low_cents != null ? Number(r.band_low_cents) : null,
    band_high_cents: r.band_high_cents != null ? Number(r.band_high_cents) : null,
    confidence: r.confidence != null ? Number(r.confidence) : null,
    method: r.method ?? null,
    reconciled_through: r.reconciled_through ?? null,
    message: r.message ?? null,
  }));

  return {
    horizon_days,
    projections,
    all_reconciled: needsRecon.length === 0,
    source: SOURCE_TAG,
  };
}
