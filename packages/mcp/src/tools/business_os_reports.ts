import { z } from "zod";
import { getPool } from "../db.js";
import { McpError } from "../errors.js";
import { SOURCE_TAG } from "../constants.js";
import type pg from "pg";

/** Business OS read tools (spec §5) backed by the v_* holding-company views
 * and operational queries. One file: list_aging_quotes, get_attribution_report,
 * get_mrr, get_pipeline, list_jobs_today, get_revenue_summary. */

const companyInput = {
  company_id: { type: "string", description: "Filter to one company (optional)" },
};

// ---- list_aging_quotes ----

export const agingQuotesSpec = {
  name: "list_aging_quotes",
  description:
    "Open quotes (SENT/VIEWED) awaiting a decision, oldest first, with age in days — the follow-up list.",
  inputSchema: {
    type: "object" as const,
    properties: { ...companyInput, min_age_days: { type: "number", description: "Only quotes at least this old (default 0)" } },
  },
};

export async function listAgingQuotesHandler(input: unknown, pool?: pg.Pool) {
  const parsed = z
    .object({ company_id: z.string().optional(), min_age_days: z.number().min(0).default(0) })
    .safeParse(input);
  if (!parsed.success) throw new McpError("INVALID_PARAM", parsed.error.message);
  const db = pool ?? getPool();
  const { rows } = await db.query(
    `SELECT q.id, q."quoteNumber", q.status, q.total, q."companyId",
            COALESCE(c.name, l.name) AS who,
            COALESCE(q."sentAt", q."createdAt") AS sent_at,
            FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(q."sentAt", q."createdAt"))) / 86400)::int AS age_days
     FROM "Quote" q
     LEFT JOIN "Customer" c ON c.id = q."customerId"
     LEFT JOIN "Lead" l ON l.id = q."leadId"
     WHERE q.status IN ('SENT','VIEWED')
       AND ($1::text IS NULL OR q."companyId" = $1)
       AND COALESCE(q."sentAt", q."createdAt") <= NOW() - ($2 || ' days')::interval
     ORDER BY sent_at ASC`,
    [parsed.data.company_id ?? null, String(parsed.data.min_age_days)]
  );
  return { quotes: rows, count: rows.length, source: SOURCE_TAG };
}

// ---- get_attribution_report ----

export const attributionSpec = {
  name: "get_attribution_report",
  description:
    "Marketing attribution (first-touch): monthly spend, new customers, CAC, attributed revenue and ROAS per channel per company. Tells you which ads build the money and which burn it.",
  inputSchema: {
    type: "object" as const,
    properties: { ...companyInput, months: { type: "number", description: "Look-back window in months (default 6)" } },
  },
};

export async function getAttributionReportHandler(input: unknown, pool?: pg.Pool) {
  const parsed = z
    .object({ company_id: z.string().optional(), months: z.number().int().min(1).max(36).default(6) })
    .safeParse(input);
  if (!parsed.success) throw new McpError("INVALID_PARAM", parsed.error.message);
  const db = pool ?? getPool();
  const { rows } = await db.query(
    `SELECT * FROM v_attribution_cac_ltv
     WHERE ($1::text IS NULL OR company_id = $1)
       AND month >= to_char(NOW() - ($2 || ' months')::interval, 'YYYY-MM')
     ORDER BY month, company_id, channel`,
    [parsed.data.company_id ?? null, String(parsed.data.months)]
  );
  return { rows, source: SOURCE_TAG };
}

// ---- get_mrr ----

export const mrrSpec = {
  name: "get_mrr",
  description: "Monthly recurring revenue rollup per company: MRR (cents), active/past-due/churn-risk subscription counts.",
  inputSchema: { type: "object" as const, properties: { ...companyInput } },
};

export async function getMrrHandler(input: unknown, pool?: pg.Pool) {
  const parsed = z.object({ company_id: z.string().optional() }).safeParse(input);
  if (!parsed.success) throw new McpError("INVALID_PARAM", parsed.error.message);
  const db = pool ?? getPool();
  const { rows } = await db.query(
    `SELECT * FROM v_crm_mrr WHERE ($1::text IS NULL OR company_id = $1) ORDER BY company_id`,
    [parsed.data.company_id ?? null]
  );
  return { rows, source: SOURCE_TAG };
}

// ---- get_pipeline ----

export const pipelineSpec = {
  name: "get_pipeline",
  description: "Open sales pipeline per company: lead and quote counts + value (cents) by stage.",
  inputSchema: { type: "object" as const, properties: { ...companyInput } },
};

export async function getPipelineHandler(input: unknown, pool?: pg.Pool) {
  const parsed = z.object({ company_id: z.string().optional() }).safeParse(input);
  if (!parsed.success) throw new McpError("INVALID_PARAM", parsed.error.message);
  const db = pool ?? getPool();
  const { rows } = await db.query(
    `SELECT * FROM v_crm_pipeline_value WHERE ($1::text IS NULL OR company_id = $1)
     ORDER BY company_id, record_type, stage`,
    [parsed.data.company_id ?? null]
  );
  return { rows, source: SOURCE_TAG };
}

// ---- list_jobs_today ----

export const jobsTodaySpec = {
  name: "list_jobs_today",
  description:
    "The crew packet: jobs scheduled for a given day (default today), route-ordered, with customer, location and crew.",
  inputSchema: {
    type: "object" as const,
    properties: { ...companyInput, date: { type: "string", description: "YYYY-MM-DD (default today)" } },
  },
};

export async function listJobsTodayHandler(input: unknown, pool?: pg.Pool) {
  const parsed = z
    .object({ company_id: z.string().optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
    .safeParse(input);
  if (!parsed.success) throw new McpError("INVALID_PARAM", parsed.error.message);
  const db = pool ?? getPool();
  const { rows } = await db.query(
    `SELECT j.id, j."jobNumber", j.title, j.status, j."scheduledStart", j."routeOrder", j."companyId",
            c.name AS customer, c.phone AS customer_phone,
            loc."addressLine1" AS address, loc.city, loc.coordinates,
            COALESCE(json_agg(json_build_object('name', u.name, 'role', ja.role))
                     FILTER (WHERE u.id IS NOT NULL), '[]') AS crew
     FROM "Job" j
     JOIN "Customer" c ON c.id = j."customerId"
     LEFT JOIN "Location" loc ON loc.id = j."locationId"
     LEFT JOIN "JobAssignment" ja ON ja."jobId" = j.id
     LEFT JOIN "User" u ON u.id = ja."userId"
     WHERE j."scheduledStart" >= COALESCE($2::date, CURRENT_DATE)
       AND j."scheduledStart" < COALESCE($2::date, CURRENT_DATE) + 1
       AND j.status IN ('SCHEDULED','IN_PROGRESS','COMPLETED')
       AND ($1::text IS NULL OR j."companyId" = $1)
     GROUP BY j.id, c.name, c.phone, loc."addressLine1", loc.city, loc.coordinates
     ORDER BY j."routeOrder" NULLS LAST, j."scheduledStart"`,
    [parsed.data.company_id ?? null, parsed.data.date ?? null]
  );
  return { date: parsed.data.date ?? new Date().toISOString().slice(0, 10), jobs: rows, source: SOURCE_TAG };
}

// ---- get_revenue_summary ----

export const revenueSummarySpec = {
  name: "get_revenue_summary",
  description:
    "Revenue by engine (field service / subscription / commerce / services) per company over a window — the normalized Revenue Event spine. Amounts in cents.",
  inputSchema: {
    type: "object" as const,
    properties: { ...companyInput, days: { type: "number", description: "Look-back window in days (default 30)" } },
  },
};

export async function getRevenueSummaryHandler(input: unknown, pool?: pg.Pool) {
  const parsed = z
    .object({ company_id: z.string().optional(), days: z.number().int().min(1).max(3650).default(30) })
    .safeParse(input);
  if (!parsed.success) throw new McpError("INVALID_PARAM", parsed.error.message);
  const db = pool ?? getPool();
  const { rows } = await db.query(
    `SELECT company_id, engine,
            SUM(gross_cents)::bigint AS gross_cents,
            SUM(refund_cents)::bigint AS refund_cents,
            SUM(net_cents)::bigint AS net_cents,
            SUM(event_count)::int AS events
     FROM v_revenue_events_daily
     WHERE date >= CURRENT_DATE - $2::int
       AND ($1::text IS NULL OR company_id = $1)
     GROUP BY 1, 2
     ORDER BY 1, 2`,
    [parsed.data.company_id ?? null, parsed.data.days]
  );
  const total = rows.reduce((s, r) => s + Number(r.net_cents), 0);
  return { window_days: parsed.data.days, by_engine: rows, total_net_cents: total, source: SOURCE_TAG };
}
