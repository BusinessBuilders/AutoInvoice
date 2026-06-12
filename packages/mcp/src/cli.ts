#!/usr/bin/env node
/** autoinvoice — one-shot agent CLI over the MCP tool registry.
 *
 * Same handlers as the MCP server (registry.ts), so CLI and MCP share one
 * query path per tool — no SQL drift. Built for small-model (Qwen) driving:
 * terse flags, --json for machine output, exact errors on stderr, exit 1.
 *
 *   autoinvoice tools                 # list all tools + flags
 *   autoinvoice transactions --text AMZN --json
 *   autoinvoice customer --name Browns
 *   autoinvoice search_transactions '{"text":"AMZN","limit":5}' --json
 */
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS, HANDLERS } from "./registry.js";
import { disconnect } from "./db.js";

export const ALIASES: Record<string, string> = {
  transactions: "search_transactions",
  companies: "list_companies",
  pulse: "get_pulse",
  cashflow: "get_company_cashflow",
  burn: "get_super_nova_burn",
  dso: "get_dso",
  "project-cash": "project_cash",
  reconcile: "mark_reconciliation",
  lead: "create_lead",
  activity: "log_activity",
  customer: "get_customer_360",
  order: "ingest_order",
  "aging-quotes": "list_aging_quotes",
  attribution: "get_attribution_report",
  mrr: "get_mrr",
  pipeline: "get_pipeline",
  "jobs-today": "list_jobs_today",
  revenue: "get_revenue_summary",
};

export function resolveCommand(cmd: string): string | null {
  const snake = cmd.replace(/-/g, "_");
  if (HANDLERS[snake]) return snake;
  if (ALIASES[cmd]) return ALIASES[cmd];
  return null;
}

/** Parse argv after the command: optional leading JSON blob, then --flag value
 * / --flag=value pairs. --json is reserved for output mode. */
export function parseFlags(argv: string[]): { base: Record<string, unknown>; flags: Record<string, string>; json: boolean } {
  const flags: Record<string, string> = {};
  let base: Record<string, unknown> = {};
  let json = false;
  let i = 0;

  if (argv[0] && !argv[0].startsWith("--")) {
    try {
      base = JSON.parse(argv[0]);
    } catch {
      throw new CliError(`Positional argument must be a JSON object, got: ${argv[0]}`);
    }
    if (typeof base !== "object" || base === null || Array.isArray(base)) {
      throw new CliError("Positional JSON argument must be an object");
    }
    i = 1;
  }

  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new CliError(`Unexpected argument: ${arg}`);
    const eq = arg.indexOf("=");
    let key: string, value: string | undefined;
    if (eq !== -1) {
      key = arg.slice(2, eq);
      value = arg.slice(eq + 1);
    } else {
      key = arg.slice(2);
      value = undefined;
    }
    if (key === "json" && value === undefined) {
      json = true;
      continue;
    }
    if (value === undefined) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new CliError(`Flag --${key} needs a value (use --${key} <value> or --${key}=<value>)`);
      }
      value = next;
      i++;
    }
    flags[key] = value;
  }
  return { base, flags, json };
}

/** Coerce string flags to the types declared in the tool's inputSchema. */
export function coerceInput(
  inputSchema: { properties?: Record<string, { type?: string }> },
  base: Record<string, unknown>,
  flags: Record<string, string>
): Record<string, unknown> {
  const input: Record<string, unknown> = { ...base };
  for (const [rawKey, rawValue] of Object.entries(flags)) {
    const key = rawKey.replace(/-/g, "_");
    const declared = inputSchema.properties?.[key]?.type;
    let value: unknown = rawValue;
    if (declared === "number" || declared === "integer") {
      value = Number(rawValue);
      if (!Number.isFinite(value)) throw new CliError(`--${rawKey} must be a number, got: ${rawValue}`);
    } else if (declared === "boolean") {
      if (rawValue !== "true" && rawValue !== "false") {
        throw new CliError(`--${rawKey} must be true or false, got: ${rawValue}`);
      }
      value = rawValue === "true";
    }
    input[key] = value;
  }
  return input;
}

export class CliError extends Error {}

function loadDatabaseUrl(): void {
  if (process.env.AUTOINVOICE_DATABASE_URL || process.env.DATABASE_URL) return;
  // One-shot convenience: pull DATABASE_URL from the backend .env in this repo.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(here, "../../../apps/backend/.env");
  try {
    const line = readFileSync(envPath, "utf-8")
      .split("\n")
      .find((l) => l.startsWith("DATABASE_URL="));
    if (line) process.env.DATABASE_URL = line.slice("DATABASE_URL=".length).trim();
  } catch {
    // fall through; db.ts will throw a clear error if still unset
  }
}

function toolUsage(spec: { name: string; description: string; inputSchema: any }): string {
  const alias = Object.entries(ALIASES).find(([, t]) => t === spec.name)?.[0];
  const props: Record<string, { type?: string; description?: string }> = spec.inputSchema?.properties ?? {};
  const required: string[] = spec.inputSchema?.required ?? [];
  const flagLines = Object.entries(props).map(([key, p]) => {
    const req = required.includes(key) ? " (required)" : "";
    return `      --${key.replace(/_/g, "-")} <${p.type ?? "string"}>${req}  ${p.description ?? ""}`;
  });
  const header = alias ? `${alias}  (${spec.name})` : spec.name;
  return [`  ${header}`, `      ${spec.description}`, ...flagLines].join("\n");
}

function printTools(asJson: boolean): void {
  if (asJson) {
    process.stdout.write(JSON.stringify(TOOLS.map((t) => ({ ...t, alias: Object.entries(ALIASES).find(([, n]) => n === t.name)?.[0] ?? null }))) + "\n");
    return;
  }
  process.stdout.write(
    `autoinvoice — Business OS agent CLI (${TOOLS.length} tools; amounts in CENTS)\n\n` +
      `Usage: autoinvoice <command> [--flag value ...] [--json]\n` +
      `       autoinvoice <command> '<json-input>' [--json]\n\n` +
      TOOLS.map(toolUsage).join("\n\n") +
      "\n"
  );
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === "tools" || cmd === "list" || cmd === "--help" || cmd === "-h" || cmd === "help") {
    printTools(argv.includes("--json"));
    return 0;
  }

  const toolName = resolveCommand(cmd);
  if (!toolName) {
    process.stderr.write(JSON.stringify({ error: { code: "UNKNOWN_COMMAND", message: `Unknown command: ${cmd}. Run 'autoinvoice tools' for the list.` } }) + "\n");
    return 1;
  }

  const spec = TOOLS.find((t) => t.name === toolName)!;
  const { base, flags, json } = parseFlags(argv.slice(1));
  const input = coerceInput(spec.inputSchema ?? {}, base, flags);

  loadDatabaseUrl();
  const result = await HANDLERS[toolName](input);
  process.stdout.write((json ? JSON.stringify(result) : JSON.stringify(result, null, 2)) + "\n");
  return 0;
}

// Only run when invoked as a binary, not when imported by tests.
// realpathSync: npm/bin and ~/.local/bin invoke this file through a symlink.
const isDirectRun = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isDirectRun) {
  main()
    .then(async (code) => {
      await disconnect();
      process.exit(code);
    })
    .catch(async (e: any) => {
      const code = e?.code ?? (e instanceof CliError ? "USAGE" : "ERROR");
      process.stderr.write(JSON.stringify({ error: { code, message: e?.message ?? String(e) } }) + "\n");
      await disconnect().catch(() => {});
      process.exit(1);
    });
}
