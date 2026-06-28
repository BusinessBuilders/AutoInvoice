import { z } from "zod";
import crypto from "node:crypto";
import { getPool } from "../db.js";
import { McpError } from "../errors.js";
import { SOURCE_TAG } from "../constants.js";
import type pg from "pg";

/** Business OS (spec §5): agent intake — Eve creates leads through this. */

export const InputSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(7),
  email: z.string().email().optional(),
  message: z.string().optional(),
  project_type: z.string().optional(),
  source: z.string().default("eve"),
  company_id: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  landing_page: z.string().optional(),
  referrer: z.string().optional(),
});

export const toolSpec = {
  name: "create_lead",
  description:
    "Create a new sales lead (agent/Eve intake). Attribution (utm_*) is captured for first-touch CAC/ROAS. Returns the created lead id and status NEW.",
  inputSchema: {
    type: "object" as const,
    properties: {
      name: { type: "string", description: "Lead's name" },
      phone: { type: "string", description: "Phone number" },
      email: { type: "string", description: "Email address" },
      message: { type: "string", description: "Initial inquiry / context" },
      project_type: { type: "string", description: "e.g. hydroseed, website, automation" },
      source: { type: "string", description: "Intake source (default: eve)" },
      company_id: { type: "string", description: "Company the lead belongs to (e.g. business-builders)" },
      utm_source: { type: "string", description: "Attribution channel (e.g. facebook)" },
      utm_medium: { type: "string" },
      utm_campaign: { type: "string" },
      landing_page: { type: "string" },
      referrer: { type: "string" },
    },
    required: ["name", "phone"],
  },
};

export function newId(): string {
  return "c" + crypto.randomBytes(12).toString("hex");
}

export async function resolveUserId(db: pg.Pool, companyId?: string): Promise<string> {
  if (companyId) {
    const { rows } = await db.query(`SELECT "userId" FROM "Company" WHERE id = $1`, [companyId]);
    if (rows.length === 0) throw new McpError("COMPANY_NOT_FOUND", `Unknown company: ${companyId}`);
    return rows[0].userId;
  }
  const { rows } = await db.query(`SELECT id FROM "User" WHERE role = 'OWNER' AND active LIMIT 2`);
  if (rows.length !== 1) {
    throw new McpError("INVALID_PARAM", "company_id required (multiple owners exist)");
  }
  return rows[0].id;
}

export async function createLeadHandler(input: unknown, pool?: pg.Pool) {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) throw new McpError("INVALID_PARAM", parsed.error.message);
  const db = pool ?? getPool();
  const p = parsed.data;

  const userId = await resolveUserId(db, p.company_id);
  const id = newId();
  await db.query(
    `INSERT INTO "Lead" (id, "userId", name, phone, email, message, "projectType", source,
                         "companyId", "utmSource", "utmMedium", "utmCampaign", "landingPage", referrer,
                         status, priority, "followUpCount", tags, "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'NEW','MEDIUM',0,'{}',NOW(),NOW())`,
    [
      id, userId, p.name, p.phone, p.email ?? null, p.message ?? null, p.project_type ?? null,
      p.source, p.company_id ?? null, p.utm_source ?? null, p.utm_medium ?? null,
      p.utm_campaign ?? null, p.landing_page ?? null, p.referrer ?? null,
    ]
  );

  return { lead_id: id, status: "NEW", source: SOURCE_TAG };
}
