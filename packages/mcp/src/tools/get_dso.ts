import { z } from "zod";
import { getPool } from "../db.js";
import { McpError } from "../errors.js";
import { SOURCE_TAG } from "../constants.js";
import type pg from "pg";

export const InputSchema = z.object({
  company_id: z.string().optional(),
  months: z.number().int().min(1).max(24).optional().default(6),
});

export const toolSpec = {
  name: "get_dso",
  description:
    "Days Sales Outstanding — average days from invoice issue to payment. Returns INSUFFICIENT_DATA if fewer than 3 paid invoices in the lookback window.",
  inputSchema: {
    type: "object" as const,
    properties: {
      company_id: { type: "string", description: "Reserved — currently ignored (invoices not company-scoped)" },
      months: { type: "integer", minimum: 1, maximum: 24, description: "Lookback period in months (default: 6)" },
    },
  },
};

const MIN_SAMPLE = 3;

export async function getDsoHandler(input: unknown, pool?: pg.Pool) {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) throw new McpError("INVALID_PARAM", parsed.error.message);

  const db = pool ?? getPool();
  const { company_id, months } = parsed.data;

  if (company_id) {
    // Log but ignore — invoices are not company-scoped in current schema
    process.stderr.write(`get_dso: company_id="${company_id}" ignored — invoices not company-scoped\n`);
  }

  const result = await db.query<{ issue_date: string; paid_date: string }>(
    `SELECT "issueDate"::text AS issue_date, "paidDate"::text AS paid_date
     FROM "Invoice"
     WHERE status = 'PAID'
       AND "paidDate" IS NOT NULL
       AND "paidDate" >= NOW() - ($1 || ' months')::interval
     ORDER BY "paidDate" DESC`,
    [months.toString()]
  );

  const rows = result.rows;

  if (rows.length < MIN_SAMPLE) {
    throw new McpError(
      "INSUFFICIENT_DATA",
      `Need at least ${MIN_SAMPLE} paid invoices to compute DSO, found ${rows.length}`,
      { sample_size: rows.length, min_required: MIN_SAMPLE }
    );
  }

  // Calculate DSO for each invoice
  const dsoValues = rows.map((r) => {
    const issue = new Date(r.issue_date);
    const paid = new Date(r.paid_date);
    return Math.max(0, (paid.getTime() - issue.getTime()) / 86_400_000);
  });

  const mean = dsoValues.reduce((a, b) => a + b, 0) / dsoValues.length;
  const sorted = [...dsoValues].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * 0.1)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];

  return {
    dso_days: Math.round(mean * 10) / 10,
    bounds: {
      low_days: Math.round(p10),
      high_days: Math.round(p90),
    },
    sample_size: rows.length,
    lookback_months: months,
    method: "mean_paid_invoices",
    source: SOURCE_TAG,
  };
}
