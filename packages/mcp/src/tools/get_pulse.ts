import { z } from "zod";
import { getPool } from "../db.js";
import { McpError } from "../errors.js";
import { SOURCE_TAG } from "../constants.js";
import type pg from "pg";

export const InputSchema = z.object({
  week: z.number().int().min(1).max(53).optional(),
  year: z.number().int().min(2020).max(2100).optional(),
});

export const toolSpec = {
  name: "get_pulse",
  description: "Cash pulse for an ISO week. Returns YTD actuals across all companies with data quality gaps.",
  inputSchema: {
    type: "object" as const,
    properties: {
      week: { type: "integer", minimum: 1, maximum: 53, description: "ISO week number (defaults to current)" },
      year: { type: "integer", minimum: 2020, maximum: 2100, description: "Year (defaults to current)" },
    },
  },
};

const ONE_M_CENTS = 100_000_000; // $1,000,000 in cents

function currentIsoWeek(): { year: number; week: number } {
  const d = new Date();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(((t.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return { year: t.getUTCFullYear(), week: weekNum };
}

function isoWeekToMonday(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() + (week - 1) * 7 - jan4Day);
  return monday;
}

export async function getPulseHandler(input: unknown, pool?: pg.Pool) {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) throw new McpError("INVALID_PARAM", parsed.error.message);

  const db = pool ?? getPool();
  const { year, week } = parsed.data.year && parsed.data.week
    ? { year: parsed.data.year, week: parsed.data.week }
    : currentIsoWeek();

  const weekStart = isoWeekToMonday(year, week);
  const requiredThrough = new Date(weekStart);
  requiredThrough.setUTCDate(weekStart.getUTCDate() - 7);
  const requiredThroughStr = requiredThrough.toISOString().slice(0, 10);

  // Parallel queries
  const [companiesResult, ytdResult, reconResult] = await Promise.all([
    db.query(`SELECT id, name FROM "Company" WHERE active = true ORDER BY name`),
    db.query(
      `SELECT company_id, ytd_inflow_cents, ytd_expenses_cents, ytd_supernova_cents, ytd_net_cents
       FROM v_ytd_pulse WHERE year = $1`,
      [year]
    ),
    db.query(
      `SELECT "companyId" AS company_id, MAX("throughDate")::text AS through_date
       FROM reconciliation_log GROUP BY "companyId"`
    ),
  ]);

  const companies = companiesResult.rows as Array<{ id: string; name: string }>;
  const ytdRows = ytdResult.rows as Array<{
    company_id: string;
    ytd_inflow_cents: string;
    ytd_expenses_cents: string;
    ytd_supernova_cents: string;
    ytd_net_cents: string;
  }>;
  const reconRows = reconResult.rows as Array<{ company_id: string; through_date: string | null }>;

  const ytdMap = new Map(ytdRows.map((r) => [r.company_id, r]));
  const reconMap = new Map(reconRows.map((r) => [r.company_id, r.through_date]));

  const companiesOut = companies.map((c) => {
    const y = ytdMap.get(c.id);
    return {
      id: c.id,
      name: c.name,
      gross_inflow_cents: Number(y?.ytd_inflow_cents ?? 0),
      expenses_cents: Number(y?.ytd_expenses_cents ?? 0),
      super_nova_allocation_cents: Number(y?.ytd_supernova_cents ?? 0),
      net_cash_cents: Number(y?.ytd_net_cents ?? 0),
    };
  });

  const ytdNet = companiesOut.reduce((sum, c) => sum + c.net_cash_cents, 0);
  const superNovaTotal = companiesOut.reduce((sum, c) => sum + c.super_nova_allocation_cents, 0);

  // Data quality gaps
  const gaps: Array<{ company_id: string; reason: "never_reconciled" | "stale" }> = [];
  const reconciledThrough = companies.map((c) => {
    const through = reconMap.get(c.id) ?? null;
    if (!through) {
      gaps.push({ company_id: c.id, reason: "never_reconciled" });
    } else if (through < requiredThroughStr) {
      gaps.push({ company_id: c.id, reason: "stale" });
    }
    return { company_id: c.id, through_date: through };
  });

  return {
    as_of: new Date().toISOString(),
    week,
    year,
    weeks_remaining: 52 - week,
    companies: companiesOut,
    super_nova: { total_burn_cents: superNovaTotal },
    ytd_net_cents: ytdNet,
    gap_to_1m_cents: Math.max(0, ONE_M_CENTS - ytdNet),
    data_quality: {
      reconciled_through_by_company: reconciledThrough,
      gaps,
    },
    source: SOURCE_TAG,
  };
}
