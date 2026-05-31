import { z } from "zod";
import { getPool } from "../db.js";
import { McpError } from "../errors.js";
import { SOURCE_TAG } from "../constants.js";
import type pg from "pg";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const InputSchema = z.object({
  start_date: z.string().regex(DATE_RE, "Must be YYYY-MM-DD").optional(),
  end_date: z.string().regex(DATE_RE, "Must be YYYY-MM-DD").optional(),
});

export const toolSpec = {
  name: "get_super_nova_burn",
  description:
    "Super Nova Robotics burn data — daily expenses by category. Supports optional date filtering (defaults to current year).",
  inputSchema: {
    type: "object" as const,
    properties: {
      start_date: { type: "string", description: "Start date YYYY-MM-DD (defaults to Jan 1 of current year)" },
      end_date: { type: "string", description: "End date YYYY-MM-DD (defaults to today)" },
    },
  },
};

function defaultRange(): { start_date: string; end_date: string } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const start_date = `${year}-01-01`;
  const end_date = now.toISOString().slice(0, 10);
  return { start_date, end_date };
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1);
}

export async function getSuperNovaBurnHandler(input: unknown, pool?: pg.Pool) {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) throw new McpError("INVALID_PARAM", parsed.error.message);

  const defaults = defaultRange();
  const start_date = parsed.data.start_date ?? defaults.start_date;
  const end_date = parsed.data.end_date ?? defaults.end_date;

  if (start_date > end_date) {
    throw new McpError("INVALID_DATE_RANGE", "start_date must be <= end_date");
  }

  const db = pool ?? getPool();

  const result = await db.query(
    `SELECT date::text, category, cents FROM v_super_nova_burn WHERE date >= $1 AND date <= $2 ORDER BY date DESC`,
    [start_date, end_date]
  );

  const entries = result.rows as Array<{ date: string; category: string; cents: number }>;

  const total_burn_cents = entries.reduce((sum, e) => sum + Number(e.cents), 0);
  const days = daysBetween(start_date, end_date);
  const daily_avg_cents = Math.round(total_burn_cents / days);

  return {
    start_date,
    end_date,
    entries,
    total_burn_cents,
    daily_avg_cents,
    source: SOURCE_TAG,
  };
}
