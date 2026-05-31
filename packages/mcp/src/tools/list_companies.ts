import { z } from "zod";
import { getPool } from "../db.js";
import { McpError } from "../errors.js";
import { SOURCE_TAG } from "../constants.js";
import type pg from "pg";

export const InputSchema = z.object({
  include_inactive: z.boolean().optional().default(false),
});

export const toolSpec = {
  name: "list_companies",
  description:
    "List all companies in AutoInvoice. Returns id, name, active status.",
  inputSchema: {
    type: "object" as const,
    properties: {
      include_inactive: {
        type: "boolean",
        description: "Include inactive companies (default: false)",
      },
    },
  },
};

export async function listCompaniesHandler(
  input: unknown,
  pool?: pg.Pool
) {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    throw new McpError("INVALID_PARAM", parsed.error.message);
  }

  const db = pool ?? getPool();
  const { include_inactive } = parsed.data;

  const query = include_inactive
    ? `SELECT id, name, active FROM "Company" ORDER BY name ASC`
    : `SELECT id, name, active FROM "Company" WHERE active = true ORDER BY name ASC`;

  const { rows } = await db.query(query);

  return {
    companies: rows,
    count: rows.length,
    as_of: new Date().toISOString(),
    source: SOURCE_TAG,
  };
}
