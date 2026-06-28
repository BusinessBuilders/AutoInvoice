---
name: autoinvoice-create-invoice
description: Create a DRAFT invoice in AutoInvoice from spoken instructions. Use when the owner asks to bill or invoice someone for work done. Triggers on "invoice", "bill", "charge {customer} for".
---

# create_invoice — exact usage

Tool: `create_invoice` (AutoInvoice MCP). Creates a DRAFT invoice. Never sends.

## Arguments
| arg | type | required | notes |
|---|---|---|---|
| `customer` | object | yes | `{ "name": "Browns" }` or `{ "customer_id": "..." }` |
| `line_items` | array | yes | `[{ "description", "quantity", "rate" }]` — `rate` in DOLLARS |
| `service_address` | string | no | the job location |
| `service_date` | string | no | `YYYY-MM-DD`, default today |
| `company_id` | string | no | default `donovan-farms`; e.g. `business-builders` |
| `confirm_create_customer` | bool | no | set `true` only after the owner approves a new customer |

## Examples

1) Existing customer, one line:
```json
{ "customer": { "name": "Browns" }, "line_items": [ { "description": "Mowing", "quantity": 3, "rate": 50 } ] }
```

2) Multi-line + job location + company override:
```json
{ "customer": { "name": "Acme" }, "company_id": "business-builders",
  "service_address": "14 Oak St",
  "line_items": [ { "description": "Website", "quantity": 1, "rate": 1200 }, { "description": "Hosting", "quantity": 12, "rate": 30 } ] }
```

3) Customer-confirmation round-trip — first call returns `{ "ok": false, "needs": "customer_confirmation", "query": "Jim Hawthorne", "candidates": [] }`. After the owner says yes, re-call:
```json
{ "customer": { "name": "Jim Hawthorne" }, "confirm_create_customer": true,
  "line_items": [ { "description": "Plowing", "quantity": 1, "rate": 75 } ] }
```

## Returns
Success: `{ "ok": true, "invoice_id", "invoice_number", "status": "DRAFT", "company_id", "customer": {id,name}, "total_cents", "line_items": [{description,quantity,rate_cents,amount_cents}] }`
Needs confirmation: `{ "ok": false, "needs": "customer_confirmation", "query", "candidates": [{id,name}] }`

## Rules
- Read the invoice back to the owner and get a "yes" before calling.
- DRAFT only — never claim it was sent.
- Speak dollars; totals come back in cents.
- Never invent a price; if a rate is missing, ask.
