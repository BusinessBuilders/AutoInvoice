import { z } from "zod";
import crypto from "node:crypto";
import { getPool } from "../db.js";
import { McpError } from "../errors.js";
import { SOURCE_TAG } from "../constants.js";
import type pg from "pg";

/**
 * Business OS (spec §3.6/§5): ingest an order through the backend webhook so
 * ALL business logic (customer matching, stock, invoice, revenue event) has
 * exactly one implementation. The tool looks up the ingest source's HMAC
 * secret and signs the request. Requires AUTOINVOICE_API_URL (default
 * http://127.0.0.1:4000).
 */

export const InputSchema = z.object({
  source_key: z.string().min(1),
  event: z.enum(["order.created", "order.paid", "order.fulfilled", "order.refunded", "order.cancelled"]),
  order: z.object({}).passthrough(),
});

export const toolSpec = {
  name: "ingest_order",
  description:
    "Ingest an order (created/paid/fulfilled/refunded/cancelled) for a registered store via the normalized order contract. Idempotent on external_id. The order object follows the v1 payload: external_id, placed_at, customer{email,name,phone}, items[{sku,name,quantity,unit_price}], totals{subtotal,tax,shipping,discount,total}, attribution{utm_*}, refund{id,amount} for refunds.",
  inputSchema: {
    type: "object" as const,
    properties: {
      source_key: { type: "string", description: "Registered ingest source key (see order.createIngestSource)" },
      event: {
        type: "string",
        enum: ["order.created", "order.paid", "order.fulfilled", "order.refunded", "order.cancelled"],
      },
      order: { type: "object", description: "Normalized v1 order payload" },
    },
    required: ["source_key", "event", "order"],
  },
};

export async function ingestOrderHandler(input: unknown, pool?: pg.Pool) {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) throw new McpError("INVALID_PARAM", parsed.error.message);
  const db = pool ?? getPool();
  const p = parsed.data;

  const { rows } = await db.query(
    `SELECT secret, active FROM "IngestSource" WHERE key = $1`,
    [p.source_key]
  );
  if (rows.length === 0 || !rows[0].active) {
    throw new McpError("INVALID_PARAM", `Unknown or inactive ingest source: ${p.source_key}`);
  }

  const apiUrl = process.env.AUTOINVOICE_API_URL ?? "http://127.0.0.1:4000";
  const body = JSON.stringify({ version: "1", event: p.event, order: p.order });
  const signature =
    "sha256=" + crypto.createHmac("sha256", rows[0].secret).update(body).digest("hex");

  let res: Response;
  try {
    res = await fetch(`${apiUrl}/webhook/orders/${p.source_key}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-autoinvoice-timestamp": new Date().toISOString(),
        "x-autoinvoice-signature": signature,
      },
      body,
    });
  } catch (e) {
    throw new McpError(
      "CONFIG_MISSING",
      `Backend unreachable at ${apiUrl} — set AUTOINVOICE_API_URL or start the backend. (${e instanceof Error ? e.message : e})`
    );
  }

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new McpError("INTERNAL", `Ingestion failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return { ...json, source: SOURCE_TAG };
}
