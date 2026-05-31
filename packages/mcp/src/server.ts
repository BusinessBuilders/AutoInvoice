#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
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

// Tool registrations
import { listCompaniesHandler, toolSpec as listCompaniesSpec } from "./tools/list_companies.js";
TOOLS.push(listCompaniesSpec);
HANDLERS["list_companies"] = listCompaniesHandler;

import { getPulseHandler, toolSpec as getPulseSpec } from "./tools/get_pulse.js";
TOOLS.push(getPulseSpec);
HANDLERS["get_pulse"] = getPulseHandler;

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
