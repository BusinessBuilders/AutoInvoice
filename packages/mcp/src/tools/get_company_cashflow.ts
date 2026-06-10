import { z } from "zod";
import { getPool } from "../db.js";
import { McpError } from "../errors.js";
import { SOURCE_TAG } from "../constants.js";
import type pg from "pg";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 365;

export const InputSchema = z.object({
  company_id: z.string().min(1),
  start_date: z.string().regex(DATE_RE, "Must be YYYY-MM-DD"),
  end_date: z.string().regex(DATE_RE, "Must be YYYY-MM-DD"),
});

export const toolSpec = {
  name: "get_company_cashflow",
  description:
    "Daily cashflow for a specific company within a date range. Returns gross inflow, expenses, and net per day with totals.",
  inputSchema: {
    type: "object" as const,
    properties: {
      company_id: { type: "string", description: "Company ID (cuid)" },
      start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
      end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
    },
    required: ["company_id", "start_date", "end_date"],
  },
};

export async function getCompanyCashflowHandler(
  input: unknown,
  pool?: pg.Pool
) {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) throw new McpError("INVALID_PARAM", parsed.error.message);

  const { company_id, start_date, end_date } = parsed.data;
  const db = pool ?? getPool();

  // Verify company exists and is active
  const companyResult = await db.query(
    `SELECT id, name FROM "Company" WHERE id = $1 AND active = true`,
    [company_id]
  );
  if (companyResult.rows.length === 0) {
    throw new McpError("COMPANY_NOT_FOUND", `Company not found: ${company_id}`);
  }
  const company = companyResult.rows[0] as { id: string; name: string };

  // Validate date range
  const start = new Date(start_date);
  const end = new Date(end_date);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new McpError("INVALID_DATE_RANGE", "Invalid date format");
  }
  if (start > end) {
    throw new McpError("INVALID_DATE_RANGE", "start_date must be <= end_date");
  }
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > MAX_RANGE_DAYS) {
    throw new McpError(
      "INVALID_DATE_RANGE",
      `Date range exceeds maximum of ${MAX_RANGE_DAYS} days (got ${diffDays})`
    );
  }

  // Query cashflow — MUST use parameterized query for cross-tenant security
  const cashResult = await db.query(
    `SELECT date, gross_inflow_cents, expenses_cents, net_cents
     FROM v_company_cash_daily
     WHERE company_id = $1 AND date >= $2 AND date <= $3
     ORDER BY date`,
    [company_id, start_date, end_date]
  );

  const days = cashResult.rows.map((row: any) => ({
    date: typeof row.date === "string" ? row.date : (row.date as Date).toISOString().slice(0, 10),
    gross_inflow_cents: Number(row.gross_inflow_cents),
    expenses_cents: Number(row.expenses_cents),
    net_cents: Number(row.net_cents),
  }));

  // Compute totals
  const totals = days.reduce(
    (acc, day) => ({
      gross_inflow_cents: acc.gross_inflow_cents + day.gross_inflow_cents,
      expenses_cents: acc.expenses_cents + day.expenses_cents,
      net_cents: acc.net_cents + day.net_cents,
    }),
    { gross_inflow_cents: 0, expenses_cents: 0, net_cents: 0 }
  );

  return {
    company_id: company.id,
    company_name: company.name,
    start_date,
    end_date,
    days,
    totals,
    source: SOURCE_TAG,
  };
}
