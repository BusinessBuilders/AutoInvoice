import { z } from "zod";
import crypto from "node:crypto";
import { getPool } from "../db.js";
import { McpError } from "../errors.js";
import { SOURCE_TAG } from "../constants.js";
import type pg from "pg";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const InputSchema = z.object({
  company_id: z.string().min(1, "company_id is required"),
  through_date: z
    .string()
    .regex(DATE_RE, "through_date must be YYYY-MM-DD"),
  source: z.enum(["manual", "statement_match"]),
  written_by: z.string().min(1, "written_by is required"),
  note: z.string().optional(),
});

export const toolSpec = {
  name: "mark_reconciliation",
  description:
    "Mark a company as reconciled through a given date. Idempotent — calling again with the same company_id + through_date updates the existing record.",
  inputSchema: {
    type: "object" as const,
    properties: {
      company_id: {
        type: "string",
        description: "Company ID to mark as reconciled",
      },
      through_date: {
        type: "string",
        description: "Date reconciled through (YYYY-MM-DD)",
      },
      source: {
        type: "string",
        enum: ["manual", "statement_match"],
        description: "How the reconciliation was performed",
      },
      written_by: {
        type: "string",
        description: "Who or what performed the reconciliation",
      },
      note: {
        type: "string",
        description: "Optional note about the reconciliation",
      },
    },
    required: ["company_id", "through_date", "source", "written_by"],
  },
};

export async function markReconciliationHandler(
  input: unknown,
  pool?: pg.Pool
) {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    throw new McpError("INVALID_PARAM", parsed.error.message);
  }

  const db = pool ?? getPool();
  const { company_id, through_date, source, written_by, note } = parsed.data;

  // Verify company exists
  const companyResult = await db.query(
    `SELECT id FROM "Company" WHERE id = $1`,
    [company_id]
  );
  if (companyResult.rows.length === 0) {
    throw new McpError("COMPANY_NOT_FOUND", `Company not found: ${company_id}`);
  }

  // Generate ID for new inserts
  const id = crypto.randomUUID();

  // Idempotent upsert
  const { rows } = await db.query(
    `INSERT INTO reconciliation_log (id, "companyId", "throughDate", source, "writtenBy", note)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT ("companyId", "throughDate")
     DO UPDATE SET source = EXCLUDED.source, "writtenBy" = EXCLUDED."writtenBy", note = EXCLUDED.note, "writtenAt" = NOW()
     RETURNING id, "companyId" AS company_id, "throughDate"::text AS through_date, source, "writtenBy" AS written_by, "writtenAt" AS written_at, note`,
    [id, company_id, through_date, source, written_by, note ?? null]
  );

  const row = rows[0];

  return {
    id: row.id,
    company_id: row.company_id,
    through_date: row.through_date,
    source: row.source,
    written_by: row.written_by,
    written_at: row.written_at,
    note: row.note,
    upserted: true,
    source_tag: SOURCE_TAG,
  };
}
