import { z } from "zod";
import { getPool } from "../db.js";
import { McpError } from "../errors.js";
import { SOURCE_TAG } from "../constants.js";
import type pg from "pg";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export const InputSchema = z
  .object({
    company_id: z.string().min(1).optional(),
    start_date: z.string().regex(DATE_RE, "Must be YYYY-MM-DD").optional(),
    end_date: z.string().regex(DATE_RE, "Must be YYYY-MM-DD").optional(),
    text: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    min_amount_cents: z.number().int().optional(),
    max_amount_cents: z.number().int().optional(),
    limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  })
  .refine(
    (v) => !(v.start_date && v.end_date) || v.start_date <= v.end_date,
    { message: "start_date must be <= end_date" }
  );

export const toolSpec = {
  name: "search_transactions",
  description:
    "Search individual bank transactions across the holding (split-safe; split parents excluded). Filter by company, date range, free text (description/vendor, case-insensitive), category, and amount range. Amounts in cents; negative = money out. Read-only.",
  inputSchema: {
    type: "object" as const,
    properties: {
      company_id: { type: "string", description: "Filter to one company (optional)" },
      start_date: { type: "string", description: "Earliest date, YYYY-MM-DD (optional)" },
      end_date: { type: "string", description: "Latest date, YYYY-MM-DD (optional)" },
      text: { type: "string", description: "Case-insensitive substring match on description or vendor, e.g. 'amazon' (optional)" },
      category: { type: "string", description: "Case-insensitive substring match on tax category name (optional)" },
      min_amount_cents: { type: "number", description: "Minimum amount in cents; negative = money out (optional)" },
      max_amount_cents: { type: "number", description: "Maximum amount in cents (optional)" },
      limit: { type: "number", description: `Max rows returned (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})` },
    },
  },
};

const FILTER_SQL = `
  ($1::text IS NULL OR company_id = $1)
  AND ($2::date IS NULL OR date >= $2)
  AND ($3::date IS NULL OR date <= $3)
  AND ($4::text IS NULL OR description ILIKE '%' || $4 || '%' OR vendor ILIKE '%' || $4 || '%')
  AND ($5::text IS NULL OR category ILIKE '%' || $5 || '%')
  AND ($6::bigint IS NULL OR amount_cents >= $6)
  AND ($7::bigint IS NULL OR amount_cents <= $7)`;

export async function searchTransactionsHandler(input: unknown, pool?: pg.Pool) {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) throw new McpError("INVALID_PARAM", parsed.error.message);

  const p = parsed.data;
  const db = pool ?? getPool();
  const filterParams = [
    p.company_id ?? null,
    p.start_date ?? null,
    p.end_date ?? null,
    p.text ?? null,
    p.category ?? null,
    p.min_amount_cents ?? null,
    p.max_amount_cents ?? null,
  ];

  const { rows } = await db.query(
    `SELECT transaction_id, date, company_id, amount_cents, description, vendor, category, account_name
     FROM v_transactions_search
     WHERE ${FILTER_SQL}
     ORDER BY date DESC, transaction_id
     LIMIT $8`,
    [...filterParams, p.limit]
  );

  // Totals over ALL matches (not just the returned page) so "how much did I
  // spend on Amazon" is answered even when matches exceed the limit.
  const { rows: aggRows } = await db.query(
    `SELECT count(*)::int AS match_count, COALESCE(SUM(amount_cents), 0)::bigint AS total_cents
     FROM v_transactions_search
     WHERE ${FILTER_SQL}`,
    filterParams
  );

  const transactions = rows.map((r: any) => ({
    transaction_id: r.transaction_id,
    date: typeof r.date === "string" ? r.date : (r.date as Date).toISOString().slice(0, 10),
    company_id: r.company_id,
    amount_cents: Number(r.amount_cents),
    description: r.description,
    vendor: r.vendor,
    category: r.category,
    account_name: r.account_name,
  }));

  return {
    transactions,
    returned: transactions.length,
    match_count: Number(aggRows[0].match_count),
    total_cents: Number(aggRows[0].total_cents),
    limit: p.limit,
    source: SOURCE_TAG,
  };
}
