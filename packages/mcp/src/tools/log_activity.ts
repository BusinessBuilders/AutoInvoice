import { z } from "zod";
import { getPool } from "../db.js";
import { McpError } from "../errors.js";
import { SOURCE_TAG } from "../constants.js";
import { newId, resolveUserId } from "./create_lead.js";
import type pg from "pg";

/** Business OS (spec §5): log calls/emails/texts/visits/notes against
 * customer or lead records — nothing lives only in someone's head. */

export const InputSchema = z
  .object({
    type: z.enum(["CALL", "EMAIL", "SMS", "MEETING", "SITE_VISIT", "NOTE", "SYSTEM"]),
    body: z.string().min(1),
    subject: z.string().optional(),
    direction: z.enum(["INBOUND", "OUTBOUND"]).optional(),
    customer_id: z.string().optional(),
    lead_id: z.string().optional(),
    company_id: z.string().optional(),
    occurred_at: z.string().datetime().optional(),
    source: z.string().default("api"),
  })
  .refine((v) => v.customer_id || v.lead_id, {
    message: "customer_id or lead_id required",
  });

export const toolSpec = {
  name: "log_activity",
  description:
    "Log a communication/activity (call, email, SMS, meeting, site visit, note) against a customer or lead. Appears on the Customer 360 timeline.",
  inputSchema: {
    type: "object" as const,
    properties: {
      type: { type: "string", enum: ["CALL", "EMAIL", "SMS", "MEETING", "SITE_VISIT", "NOTE", "SYSTEM"] },
      body: { type: "string", description: "What happened / was said" },
      subject: { type: "string" },
      direction: { type: "string", enum: ["INBOUND", "OUTBOUND"] },
      customer_id: { type: "string" },
      lead_id: { type: "string" },
      company_id: { type: "string" },
      occurred_at: { type: "string", description: "ISO timestamp (default now)" },
      source: { type: "string", description: "default: api (use 'eve' for Eve)" },
    },
    required: ["type", "body"],
  },
};

export async function logActivityHandler(input: unknown, pool?: pg.Pool) {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) throw new McpError("INVALID_PARAM", parsed.error.message);
  const db = pool ?? getPool();
  const p = parsed.data;

  // ownership/linkage validation
  let userId: string | null = null;
  if (p.customer_id) {
    const { rows } = await db.query(`SELECT "userId" FROM "Customer" WHERE id = $1`, [p.customer_id]);
    if (rows.length === 0) throw new McpError("INVALID_PARAM", `Unknown customer: ${p.customer_id}`);
    userId = rows[0].userId;
  }
  if (p.lead_id) {
    const { rows } = await db.query(`SELECT "userId" FROM "Lead" WHERE id = $1`, [p.lead_id]);
    if (rows.length === 0) throw new McpError("INVALID_PARAM", `Unknown lead: ${p.lead_id}`);
    userId = userId ?? rows[0].userId;
  }
  if (!userId) userId = await resolveUserId(db, p.company_id);

  const id = newId();
  await db.query(
    `INSERT INTO "Activity" (id, "userId", "companyId", "customerId", "leadId", type, direction,
                             subject, body, "occurredAt", source, "createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::timestamptz, NOW()),$11,NOW())`,
    [
      id, userId, p.company_id ?? null, p.customer_id ?? null, p.lead_id ?? null,
      p.type, p.direction ?? null, p.subject ?? null, p.body, p.occurred_at ?? null, p.source,
    ]
  );
  return { activity_id: id, source: SOURCE_TAG };
}
