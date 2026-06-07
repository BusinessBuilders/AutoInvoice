import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import http from "node:http";

const HOST = process.env.AUTOINVOICE_MCP_HOST ?? "127.0.0.1";
const PORT = Number(process.env.AUTOINVOICE_MCP_PORT ?? "7892");
const EXPECTED_TOKEN = process.env.AUTOINVOICE_MCP_TOKEN;

export async function startHttp(server: Server): Promise<http.Server> {
  let activeTransport: SSEServerTransport | null = null;

  const httpServer = http.createServer(async (req, res) => {
    if (EXPECTED_TOKEN) {
      const auth = req.headers.authorization;
      if (!auth || auth !== `Bearer ${EXPECTED_TOKEN}`) {
        res.writeHead(401, { "Content-Type": "text/plain" }).end("Unauthorized");
        return;
      }
    }

    if (req.method === "GET" && req.url === "/sse") {
      activeTransport = new SSEServerTransport("/messages", res);
      await server.connect(activeTransport);
      return;
    }
    if (req.method === "POST" && req.url?.startsWith("/messages")) {
      if (!activeTransport) {
        res.writeHead(503).end("SSE not connected");
        return;
      }
      await activeTransport.handlePostMessage(req, res);
      return;
    }
    res.writeHead(404).end("not found");
  });

  return new Promise((resolve) => {
    httpServer.listen(PORT, HOST, () => {
      process.stderr.write(`autoinvoice-mcp: http transport on http://${HOST}:${PORT}/sse\n`);
      resolve(httpServer);
    });
  });
}
