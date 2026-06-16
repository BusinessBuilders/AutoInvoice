# Eve Invoicing — Design Spec

**Date:** 2026-06-16 · **Branch:** feat/business-os · **Status:** Approved design, pending spec review
**Goal:** Let Eve (the intake agent) create invoices from spoken instruction, via a new MCP tool that reuses the existing invoice service. Owner dictates → Eve gathers fields → reads back → creates a DRAFT invoice.

## Decisions (locked in brainstorming)

| Decision | Choice |
|---|---|
| Deliverable | Full capability: `create_invoice` MCP tool + backend endpoint + Eve prompt |
| Architecture | **Approach A** — MCP tool → backend API → existing invoice service (one write path, like `ingest_order`) |
| Input shape | **Structured fields** — Eve extracts customer + line items + price herself, reads back, then submits explicit fields (no second server-side AI parse) |
| Invoice status | **Always DRAFT** — Eve never emails customers; owner reviews/sends from dashboard |
| Company | Default `donovan-farms`, overridable per invoice |
| Customer matching | Fuzzy-match existing; if no confident match, return a confirmation signal — Eve asks owner before creating a new customer |
| Service address | = the job location (`Invoice.serviceAddress`) |

## Scope

**In scope (this spec):**
1. `POST /invoices/structured` backend endpoint (auth-protected).
2. `create_invoice` MCP tool wrapping that endpoint.
3. Eve's invoicing **prompt** (behavioral instruction block — *what* to do and the conversational rules).
4. Eve's **SKILL.md** (tool-usage reference — *exactly how* to call the tool: arg schema, one example per scenario, return shapes). Distinct from the prompt: the prompt governs behavior, the SKILL.md is the precise how-to-call manual.
5. Tests for the endpoint and the tool.

**Out of scope (explicit dependency / separate follow-up):**
- Standing up the MCP **HTTP transport** as a running service and exposing it to Eve's remote VPS (bearer token, WireGuard/nginx). The tool is unreachable by a remote Eve until this is done. Tracked as a follow-up so it doesn't disturb the running Wealth OS / services. **The feature is not end-to-end usable by Eve until this follow-up ships** — but the tool works locally (stdio) and is fully testable before then.

## Architecture

```
Owner (speech) → Eve (LLM)
   → extracts {customer, line_items[], service_address?, service_date?, company_id?}
   → reads back, waits for "yes"
   → create_invoice MCP tool (packages/mcp)
       → POST {AUTOINVOICE_API_URL}/invoices/structured   (Bearer/service auth)
           → backend invoice service (apps/backend)
               → resolve customer (fuzzy match | confirm-create)
               → build line items, compute totals
               → create Invoice status=DRAFT, source="eve", companyId
           → returns created invoice
       → returns {invoice_id, invoice_number, status, total_cents, view_url} | {needs:"customer_confirmation"}
```

Rationale: the backend already owns invoice numbering, customer fuzzy-match (`/quick`), per-customer pricing, company tagging, and any revenue-event linkage. The MCP tool stays a thin transport so there is exactly one write path — no SQL/logic drift (same principle as `search_transactions` sharing the query path).

## Component 1 — Backend endpoint `POST /invoices/structured`

Auth-protected (existing protected route mechanism; for Eve, a service token — see deployment follow-up). Lives alongside the invoice router/service in `apps/backend`.

**Request body:**
```jsonc
{
  "customer": { "name": "Browns" },        // OR { "customer_id": "..." }
  "line_items": [
    { "description": "Mowing", "quantity": 3, "rate": 50 }
  ],
  "service_address": "14 Oak St",          // optional — job location
  "service_date": "2026-06-16",            // optional — default today
  "company_id": "donovan-farms",           // optional — default donovan-farms
  "confirm_create_customer": false          // optional — true only after owner OKs a new customer
}
```

**Behavior:**
1. Resolve `company_id` (default `donovan-farms`); 400 if an explicit one is unknown/inactive.
2. Resolve customer:
   - `customer_id` given → load it (404 if missing).
   - `name` given → fuzzy-match (reuse `/quick`'s matcher). Confident match → use it. No/ambiguous match **and** `confirm_create_customer=false` → return `{ needs: "customer_confirmation", query, candidates: [{id,name}] }` and **write nothing**. `confirm_create_customer=true` → create the customer, then proceed.
3. Build line items: each `{ description, quantity, rate, amount = quantity*rate }`. Apply per-customer pricing override if one exists for a matched service (parity with `/quick`); otherwise use the supplied rate.
4. Compute `subtotal`/`total`. Generate invoice number (existing scheme). Create Invoice: `status=DRAFT`, `source="eve"`, `companyId`, `serviceAddress`, `serviceDate`, 30-day due.
5. Respond with the created invoice (id, number, status, totals, line items, customer, a dashboard `view_url`).

Validation: at least one line item; each item needs description + quantity>0 + rate≥0; reject negative totals.

## Component 2 — `create_invoice` MCP tool (`packages/mcp/src/tools/create_invoice.ts`)

Registered in `registry.ts` (so both the MCP server and the `autoinvoice` CLI expose it — 19th tool). Pattern mirrors `ingest_order`: validates input with zod, POSTs to `{AUTOINVOICE_API_URL}/invoices/structured`, returns the JSON. No direct DB writes.

**inputSchema:** `customer` (object: `name` or `customer_id`), `line_items` (array of `{description, quantity, rate}`), `service_address?`, `service_date?`, `company_id?`, `confirm_create_customer?`.

**Returns:** the endpoint's success object, or the `needs: "customer_confirmation"` object verbatim so Eve can act on it. Errors map to the typed MCP error shape (`INVALID_PARAM`, upstream/backend errors).

## Component 3 — Eve's prompt

A concise instruction block Eve loads (delivered as a doc, e.g. `docs/EVE_INVOICING_PROMPT.md`, for the user to paste into Eve's config):

> **You can create invoices with the `create_invoice` tool.** From the user's speech, gather:
> - **Customer** — who is billed.
> - **Line items** — for each: description (what was done), quantity, rate (price each).
> - **Service address** — the job location (where the work happened). Optional.
> - **Date** — when; default today.
> - **Business** — default Donovan Farms unless told otherwise (e.g. "bill this under Business Builders").
>
> **Always read the invoice back before creating it** — customer, each line with qty×rate, the line total, address, date, business — and wait for a clear "yes."
> If the tool returns `needs: customer_confirmation`, tell the user the customer wasn't found, share any candidates, and ask before retrying with `confirm_create_customer: true`.
> Invoices are created as **DRAFT**. Tell the user it's a draft to review and send from the dashboard. **Never say it was sent** — you cannot send.
> Amounts are dollars in your speech; the tool stores cents. Don't invent prices — if a rate is missing, ask.

## Component 4 — Eve's `SKILL.md`

A terse, agent-facing skill file (delivered as `docs/EVE_INVOICING_SKILL.md` for the user to install into Eve) that documents *exactly* how to call the tool. Structured like the existing `autoinvoice-cli` SKILL.md: frontmatter (name + trigger description), then exact usage. Contents:

- **Tool:** `create_invoice` (via the AutoInvoice MCP).
- **When to use:** owner asks to bill/invoice someone for work done.
- **Arguments** (table): `customer` `{name|customer_id}` (required), `line_items[]` `{description, quantity, rate}` (required), `service_address` (optional, = job location), `service_date` (optional, default today), `company_id` (optional, default `donovan-farms`), `confirm_create_customer` (optional bool).
- **Exactly one example per scenario:**
  1. Happy path — existing customer, one line.
  2. Multi-line + service address + company override.
  3. Customer-confirmation round-trip — first call returns `needs: customer_confirmation`; second call adds `confirm_create_customer: true`.
- **Return shapes:** success object (`invoice_id`, `invoice_number`, `status: DRAFT`, `total_cents`, `view_url`) and the `needs` object.
- **Hard rules:** read back before calling; DRAFT only (never claim sent); dollars in → cents stored; never invent a price.

Terse enough to feed a small model. The **prompt** (Component 3) and the **SKILL.md** ship together: the prompt sets behavior, the SKILL.md is the exact call reference.

## Error handling

| Situation | Behavior |
|---|---|
| Missing/invalid fields | Tool returns `INVALID_PARAM` with the reason; Eve relays and asks for the missing piece |
| No customer match (unconfirmed) | `needs: customer_confirmation` (no write); Eve confirms with owner |
| Unknown/inactive company | 400; Eve relays |
| Backend unreachable | Tool returns an upstream error; Eve says she couldn't reach the books — nothing was created |
| Partial failure | Endpoint writes in one transaction — invoice + line items succeed together or not at all |

## Testing

**Backend endpoint (jest + testcontainers, in `apps/backend`):**
- matched customer → DRAFT invoice, `source="eve"`, correct totals
- no match + `confirm_create_customer=false` → `needs` signal, **no invoice written**
- no match + `confirm_create_customer=true` → customer created + invoice
- multi-line totals; company override; default company; serviceAddress/serviceDate persisted
- validation: empty line items, negative rate rejected
- auth required

**MCP tool (vitest, in `packages/mcp`):**
- input validation (zod), happy path (mocked HTTP), confirmation round-trip passthrough, error mapping
- registry has the tool; CLI exposes `autoinvoice create-invoice`

## Out-of-scope follow-up (deployment, separate spec)
Run MCP `AUTOINVOICE_MCP_MODE=http` as a pm2 service with a bearer token; expose to Eve's Contabo VPS via the existing VPS/WireGuard/nginx; put URL+token in Eve's config; resolve the `~/AutoInvoice` vs `~/AutoInvoice-wealth-os` checkout so Eve runs current code. Until then, the tool is testable/usable locally over stdio but not reachable by remote Eve.
