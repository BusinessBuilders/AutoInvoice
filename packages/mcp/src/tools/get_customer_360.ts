import { z } from "zod";
import { getPool } from "../db.js";
import { McpError } from "../errors.js";
import { SOURCE_TAG } from "../constants.js";
import type pg from "pg";

/** Business OS (spec §5): one customer, every engine — invoices, quotes,
 * jobs, orders, subscriptions, activities, revenue events, LTV. */

export const InputSchema = z
  .object({
    customer_id: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    name: z.string().optional(),
    limit_per_section: z.number().int().min(1).max(50).default(10),
  })
  .refine((v) => v.customer_id || v.email || v.phone || v.name, {
    message: "one of customer_id, email, phone, name is required",
  });

export const toolSpec = {
  name: "get_customer_360",
  description:
    "Full Customer 360: profile, lifetime value, and recent invoices, quotes, jobs, orders, subscriptions, activities and revenue events across all companies. Look up by id, email, phone, or name.",
  inputSchema: {
    type: "object" as const,
    properties: {
      customer_id: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      name: { type: "string", description: "Fuzzy name match (ILIKE)" },
      limit_per_section: { type: "number", description: "Rows per section (default 10)" },
    },
  },
};

export async function getCustomer360Handler(input: unknown, pool?: pg.Pool) {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) throw new McpError("INVALID_PARAM", parsed.error.message);
  const db = pool ?? getPool();
  const p = parsed.data;

  const lookup = await db.query(
    `SELECT id, name, email, phone, company, "primaryCompanyId",
            "acquisitionSource", "acquisitionCampaign", "firstTouchAt", tags, "createdAt"
     FROM "Customer"
     WHERE ($1::text IS NOT NULL AND id = $1)
        OR ($1::text IS NULL AND $2::text IS NOT NULL AND lower(email) = lower($2))
        OR ($1::text IS NULL AND $2::text IS NULL AND $3::text IS NOT NULL AND phone = $3)
        OR ($1::text IS NULL AND $2::text IS NULL AND $3::text IS NULL AND name ILIKE '%' || $4 || '%')
     LIMIT 5`,
    [p.customer_id ?? null, p.email ?? null, p.phone ?? null, p.name ?? null]
  );
  if (lookup.rows.length === 0) throw new McpError("INVALID_PARAM", "Customer not found");
  if (lookup.rows.length > 1) {
    return {
      ambiguous: true,
      matches: lookup.rows.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone })),
      source: SOURCE_TAG,
    };
  }
  const customer = lookup.rows[0];
  const n = p.limit_per_section;

  const [ltv, invoices, quotes, jobs, orders, subscriptions, activities, events] = await Promise.all([
    db.query(
      `SELECT COALESCE(SUM(amount),0) AS ltv, COUNT(*)::int AS events FROM "RevenueEvent" WHERE "customerId" = $1`,
      [customer.id]
    ),
    db.query(
      `SELECT id, "invoiceNumber", status, total, "issueDate", "paidDate", "companyId"
       FROM "Invoice" WHERE "customerId" = $1 ORDER BY "issueDate" DESC LIMIT $2`,
      [customer.id, n]
    ),
    db.query(
      `SELECT id, "quoteNumber", status, total, "createdAt", "companyId"
       FROM "Quote" WHERE "customerId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
      [customer.id, n]
    ),
    db.query(
      `SELECT id, "jobNumber", title, status, "scheduledStart", "companyId"
       FROM "Job" WHERE "customerId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
      [customer.id, n]
    ),
    db.query(
      `SELECT id, source, "externalId", status, total, "refundedAmount", "placedAt", "companyId"
       FROM "Order" WHERE "customerId" = $1 ORDER BY "placedAt" DESC LIMIT $2`,
      [customer.id, n]
    ),
    db.query(
      `SELECT id, name, status, interval, amount, "currentPeriodEnd", "churnRisk", "dunningStage", "companyId"
       FROM "Subscription" WHERE "customerId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
      [customer.id, n]
    ),
    db.query(
      `SELECT id, type, direction, subject, body, "occurredAt", source, "companyId"
       FROM "Activity" WHERE "customerId" = $1 ORDER BY "occurredAt" DESC LIMIT $2`,
      [customer.id, n]
    ),
    db.query(
      `SELECT id, engine, "eventType", amount, "occurredAt", description, "companyId"
       FROM "RevenueEvent" WHERE "customerId" = $1 ORDER BY "occurredAt" DESC LIMIT $2`,
      [customer.id, n]
    ),
  ]);

  return {
    customer,
    lifetime_value: Number(ltv.rows[0].ltv),
    revenue_event_count: ltv.rows[0].events,
    invoices: invoices.rows,
    quotes: quotes.rows,
    jobs: jobs.rows,
    orders: orders.rows,
    subscriptions: subscriptions.rows,
    activities: activities.rows,
    revenue_events: events.rows,
    as_of: new Date().toISOString(),
    source: SOURCE_TAG,
  };
}
