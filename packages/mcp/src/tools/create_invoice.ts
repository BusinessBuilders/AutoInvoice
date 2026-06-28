import { z } from "zod";
import { McpError } from "../errors.js";
import { SOURCE_TAG } from "../constants.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const InputSchema = z.object({
  customer: z.object({ name: z.string().min(1).optional(), customer_id: z.string().min(1).optional() })
    .refine((c) => !!c.name || !!c.customer_id, "customer needs name or customer_id"),
  line_items: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().positive(),
    rate: z.number().min(0), // dollars
  })).min(1),
  service_address: z.string().optional(),
  service_date: z.string().regex(DATE_RE, "Must be YYYY-MM-DD").optional(),
  company_id: z.string().optional(),
  confirm_create_customer: z.boolean().optional(),
});

export const toolSpec = {
  name: "create_invoice",
  description:
    "Create a DRAFT invoice from structured fields (agent/Eve). Provide a customer (name or customer_id), line_items [{description, quantity, rate}] with rate in DOLLARS, optional service_address (job location), service_date (YYYY-MM-DD, default today), and company_id (default donovan-farms). If the customer name has no match, returns {needs:'customer_confirmation'} and writes nothing — re-call with confirm_create_customer:true after the user agrees. Invoices are DRAFT and are never sent. Totals returned in cents.",
  inputSchema: {
    type: "object" as const,
    properties: {
      customer: { type: "object", description: "{ name } or { customer_id }" },
      line_items: { type: "array", description: "[{ description, quantity, rate }] — rate in dollars" },
      service_address: { type: "string", description: "Job location (optional)" },
      service_date: { type: "string", description: "YYYY-MM-DD (default today)" },
      company_id: { type: "string", description: "Business (default donovan-farms)" },
      confirm_create_customer: { type: "boolean", description: "Set true to create a new customer after the user agrees" },
    },
    required: ["customer", "line_items"],
  },
};

export async function createInvoiceHandler(input: unknown) {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) throw new McpError("INVALID_PARAM", parsed.error.message);

  const apiUrl = process.env.AUTOINVOICE_API_URL ?? "http://127.0.0.1:4000";
  const token = process.env.AUTOINVOICE_SERVICE_TOKEN;
  if (!token) throw new McpError("INVALID_PARAM", "AUTOINVOICE_SERVICE_TOKEN is not set");

  let res: Response;
  try {
    res = await fetch(`${apiUrl}/invoices/structured`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(parsed.data),
    });
  } catch (e) {
    throw new McpError("INTERNAL", `Backend unreachable at ${apiUrl} — set AUTOINVOICE_API_URL or start the backend. (${e instanceof Error ? e.message : e})`);
  }

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new McpError("INTERNAL", data?.error ?? `Backend returned ${res.status}`);
  return { ...data, source: SOURCE_TAG };
}
