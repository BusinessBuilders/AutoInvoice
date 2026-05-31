#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { startStdio } from "./transport/stdio.js";
import { startHttp } from "./transport/http.js";
import { disconnect } from "./db.js";
import { intoMcpError } from "./errors.js";

import { VERSION, SOURCE_TAG } from "./constants.js";
export { SOURCE_TAG };

const server = new Server(
  { name: "autoinvoice-mcp", version: VERSION },
  { capabilities: { tools: {}, resources: {} } }
);

// Tool registry — populated by Tasks 7-14
const TOOLS: Array<{ name: string; description: string; inputSchema: object }> = [];
const HANDLERS: Record<string, (input: unknown) => Promise<unknown>> = {};

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const handler = HANDLERS[req.params.name];
  if (!handler) {
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ error: { code: "INVALID_PARAM", message: `Unknown tool: ${req.params.name}` } }) }],
    };
  }
  try {
    const data = await handler(req.params.arguments ?? {});
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  } catch (e) {
    return intoMcpError(e).toMcpResponse();
  }
});

export { server, TOOLS, HANDLERS };

// Resource registrations
import { resourceSpec as pulseResourceSpec, readPulseCurrent } from "./resources/pulse_current.js";
import { resourceSpec as companiesResourceSpec, readCompanies } from "./resources/companies.js";

const RESOURCES = [pulseResourceSpec, companiesResourceSpec];

server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const uri = req.params.uri;
  let content: string;

  switch (uri) {
    case "autoinvoice://pulse/current":
      content = await readPulseCurrent();
      break;
    case "autoinvoice://companies":
      content = await readCompanies();
      break;
    default:
      throw new Error(`Unknown resource: ${uri}`);
  }

  return {
    contents: [{ uri, mimeType: "application/json", text: content }],
  };
});

// Tool registrations
import { listCompaniesHandler, toolSpec as listCompaniesSpec } from "./tools/list_companies.js";
TOOLS.push(listCompaniesSpec);
HANDLERS["list_companies"] = listCompaniesHandler;

import { getPulseHandler, toolSpec as getPulseSpec } from "./tools/get_pulse.js";
TOOLS.push(getPulseSpec);
HANDLERS["get_pulse"] = getPulseHandler;

import { getCompanyCashflowHandler, toolSpec as getCompanyCashflowSpec } from "./tools/get_company_cashflow.js";
TOOLS.push(getCompanyCashflowSpec);
HANDLERS["get_company_cashflow"] = getCompanyCashflowHandler;

import { getSuperNovaBurnHandler, toolSpec as getSuperNovaBurnSpec } from "./tools/get_super_nova_burn.js";
TOOLS.push(getSuperNovaBurnSpec);
HANDLERS["get_super_nova_burn"] = getSuperNovaBurnHandler;

import { getDsoHandler, toolSpec as getDsoSpec } from "./tools/get_dso.js";
TOOLS.push(getDsoSpec);
HANDLERS["get_dso"] = getDsoHandler;

import { projectCashHandler, toolSpec as projectCashSpec } from "./tools/project_cash.js";
TOOLS.push(projectCashSpec);
HANDLERS["project_cash"] = projectCashHandler;

import { markReconciliationHandler, toolSpec as markReconciliationSpec } from "./tools/mark_reconciliation.js";
TOOLS.push(markReconciliationSpec);
HANDLERS["mark_reconciliation"] = markReconciliationHandler;

// Transport startup
const MODE = (process.env.AUTOINVOICE_MCP_MODE ?? "stdio").toLowerCase();

async function main() {
  if (MODE === "stdio") {
    await startStdio(server);
  } else if (MODE === "http") {
    await startHttp(server);
  } else if (MODE === "both") {
    await startStdio(server);
    await startHttp(server);
  } else {
    throw new Error(`Unknown AUTOINVOICE_MCP_MODE: ${MODE}`);
  }
}

process.on("SIGINT", async () => { await disconnect(); process.exit(0); });
process.on("SIGTERM", async () => { await disconnect(); process.exit(0); });

main().catch((e) => {
  process.stderr.write(`autoinvoice-mcp fatal: ${e?.stack ?? e}\n`);
  process.exit(1);
});
