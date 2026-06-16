# Eve Invoicing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Eve create DRAFT invoices from spoken instruction via a new `create_invoice` MCP tool that calls a backend endpoint reusing the existing invoice/customer logic.

**Architecture:** Approach A — `create_invoice` MCP tool → `POST /invoices/structured` (Express, service-token auth) → `eve-invoice` service → DRAFT Invoice. One write path; no logic drift. Customer fuzzy-match reuses `findCustomer`; `Invoice.userId` comes from `Company.userId`. Eve speaks dollars; the tool reports `total_cents`.

**Tech Stack:** Node + TypeScript, Express, Prisma/Postgres (backend, jest + testcontainers); MCP SDK + pg + zod (packages/mcp, vitest).

**Spec:** `docs/superpowers/specs/2026-06-16-eve-invoicing-design.md`

**Design note (supersedes spec's optional pricing-override mention):** line items use the rate Eve supplies (the owner confirmed it aloud). The server does NOT override with a stored price. `serviceId` is null (orphan line items, already supported by the schema).

---

## File Structure

- Modify `apps/backend/src/services/smart-templates.ts` — export `findCustomer` for reuse.
- Create `apps/backend/src/services/eve-invoice.ts` — `createStructuredInvoice()` (the whole write logic).
- Modify `apps/backend/src/server.ts` — add `POST /invoices/structured` route (service-token auth, thin wrapper).
- Create `apps/backend/src/__tests__/business-os/eve-invoice.test.ts` — service tests (testcontainers).
- Create `packages/mcp/src/tools/create_invoice.ts` — MCP tool (POSTs to backend).
- Modify `packages/mcp/src/registry.ts` — register `create_invoice` (19th tool).
- Modify `packages/mcp/src/cli.ts` — add `create-invoice` alias.
- Create `packages/mcp/tests/unit/create_invoice.test.ts` — tool tests (mocked fetch).
- Create `docs/EVE_INVOICING_PROMPT.md` — Eve behavioral prompt.
- Create `docs/EVE_INVOICING_SKILL.md` — Eve SKILL.md (exact tool usage).

Run all backend commands from `apps/backend`, all MCP commands from `packages/mcp`. Use absolute `cd` in every command (cwd drifts between calls).

---

## Task 1: Export `findCustomer` for reuse

**Files:**
- Modify: `apps/backend/src/services/smart-templates.ts` (the `async function findCustomer` declaration, ~line 308)

- [ ] **Step 1: Make `findCustomer` exported**

Change the declaration from:
```ts
async function findCustomer(nameQuery: string, userId?: string): Promise<any> {
```
to:
```ts
export async function findCustomer(nameQuery: string, userId?: string): Promise<any> {
```

- [ ] **Step 2: Verify it still compiles**

Run: `cd /home/magiccat/AutoInvoice/apps/backend && npx tsc --noEmit`
Expected: exit 0 (ignore ExperimentalWarning lines).

- [ ] **Step 3: Commit**

```bash
cd /home/magiccat/AutoInvoice && git add apps/backend/src/services/smart-templates.ts
git commit -m "refactor(invoice): export findCustomer for reuse by eve-invoice service"
```

---

## Task 2: `eve-invoice` service — validation + customer-confirmation signal

**Files:**
- Create: `apps/backend/src/services/eve-invoice.ts`
- Test: `apps/backend/src/__tests__/business-os/eve-invoice.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/__tests__/business-os/eve-invoice.test.ts`:
```ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { createStructuredInvoice, StructuredInvoiceError } from '../../services/eve-invoice';

const prisma = new PrismaClient();

describe('eve-invoice: createStructuredInvoice', () => {
  let ownerId: string;
  let companyId: string;

  beforeEach(async () => {
    const owner = await prisma.user.create({
      data: { email: 'eve-owner@test.com', password: 'x', name: 'Owner', role: 'OWNER' },
    });
    ownerId = owner.id;
    companyId = (await prisma.company.create({ data: { id: 'donovan-farms', userId: ownerId, name: 'Donovan Farms' } })).id;
  });

  it('rejects empty line items', async () => {
    await expect(
      createStructuredInvoice({ customer: { name: 'X' }, lineItems: [] })
    ).rejects.toThrow(StructuredInvoiceError);
  });

  it('rejects a line item with non-positive quantity or negative rate', async () => {
    await expect(
      createStructuredInvoice({ customer: { name: 'X' }, lineItems: [{ description: 'Mow', quantity: 0, rate: 50 }] })
    ).rejects.toThrow(/quantity/i);
    await expect(
      createStructuredInvoice({ customer: { name: 'X' }, lineItems: [{ description: 'Mow', quantity: 1, rate: -5 }] })
    ).rejects.toThrow(/rate/i);
  });

  it('returns a customer_confirmation signal (no invoice written) when the name has no match', async () => {
    const res = await createStructuredInvoice({
      customer: { name: 'Nobody McGhost' },
      lineItems: [{ description: 'Mowing', quantity: 1, rate: 50 }],
    });
    expect(res.ok).toBe(false);
    if (res.ok === false) {
      expect(res.needs).toBe('customer_confirmation');
      expect(res.query).toBe('Nobody McGhost');
    }
    expect(await prisma.invoice.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/magiccat/AutoInvoice/apps/backend && npx jest business-os/eve-invoice -t "customer_confirmation" -i`
Expected: FAIL — cannot find module `../../services/eve-invoice`.

- [ ] **Step 3: Write the minimal service**

Create `apps/backend/src/services/eve-invoice.ts`:
```ts
import { prisma } from '../utils/db';
import { findCustomer } from './smart-templates';

const DEFAULT_COMPANY_ID = 'donovan-farms';

export class StructuredInvoiceError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
  }
}

export interface StructuredLineItem {
  description: string;
  quantity: number;
  rate: number; // dollars
}

export interface StructuredInvoiceInput {
  customer: { name?: string; customer_id?: string };
  lineItems: StructuredLineItem[];
  serviceAddress?: string;
  serviceDate?: string; // YYYY-MM-DD
  companyId?: string;
  confirmCreateCustomer?: boolean;
}

export type StructuredInvoiceResult =
  | { ok: true; invoice: any }
  | { ok: false; needs: 'customer_confirmation'; query: string; candidates: { id: string; name: string }[] };

function validate(input: StructuredInvoiceInput): void {
  if (!input.lineItems || input.lineItems.length === 0) {
    throw new StructuredInvoiceError('At least one line item is required');
  }
  for (const li of input.lineItems) {
    if (!li.description || !li.description.trim()) throw new StructuredInvoiceError('Each line item needs a description');
    if (!(li.quantity > 0)) throw new StructuredInvoiceError('Each line item needs a quantity greater than 0');
    if (li.rate < 0) throw new StructuredInvoiceError('Line item rate cannot be negative');
  }
  if (!input.customer?.name && !input.customer?.customer_id) {
    throw new StructuredInvoiceError('A customer name or customer_id is required');
  }
}

export async function createStructuredInvoice(input: StructuredInvoiceInput): Promise<StructuredInvoiceResult> {
  validate(input);

  const companyId = input.companyId ?? DEFAULT_COMPANY_ID;
  const company = await prisma.company.findFirst({ where: { id: companyId, active: true }, select: { id: true, userId: true } });
  if (!company) throw new StructuredInvoiceError(`Unknown or inactive company: ${companyId}`);
  const ownerUserId = company.userId;

  // Resolve customer
  let customer: { id: string; name: string } | null = null;
  if (input.customer.customer_id) {
    const c = await prisma.customer.findFirst({ where: { id: input.customer.customer_id, userId: ownerUserId }, select: { id: true, name: true } });
    if (!c) throw new StructuredInvoiceError(`Customer not found: ${input.customer.customer_id}`, 404);
    customer = c;
  } else {
    const name = input.customer.name!;
    const matched = await findCustomer(name, ownerUserId);
    if (matched) {
      customer = { id: matched.id, name: matched.name };
    } else if (input.confirmCreateCustomer) {
      customer = await prisma.customer.create({ data: { userId: ownerUserId, name }, select: { id: true, name: true } });
    } else {
      return { ok: false, needs: 'customer_confirmation', query: name, candidates: [] };
    }
  }

  // Build line items (Eve-confirmed rates; orphan line items, no serviceId)
  const lineItems = input.lineItems.map((li, index) => {
    const amount = Math.round(li.quantity * li.rate * 100) / 100;
    return { serviceId: null as string | null, description: li.description.trim(), quantity: li.quantity, unit: null as string | null, rate: li.rate, amount, order: index };
  });
  const subtotal = Math.round(lineItems.reduce((s, li) => s + li.amount, 0) * 100) / 100;

  // Invoice number (same scheme as createQuickInvoice)
  const lastInvoice = await prisma.invoice.findFirst({ orderBy: { createdAt: 'desc' }, select: { invoiceNumber: true } });
  const lastNumber = lastInvoice ? parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '')) || 0 : 0;
  const invoiceNumber = `INV-${String(lastNumber + 1).padStart(6, '0')}`;

  const serviceDate = input.serviceDate ? new Date(input.serviceDate) : new Date();

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      userId: ownerUserId,
      companyId: company.id,
      customerId: customer.id,
      serviceDate,
      serviceAddress: input.serviceAddress,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal,
      total: subtotal,
      status: 'DRAFT',
      source: 'eve',
      lineItems: { create: lineItems },
    },
    include: { customer: true, lineItems: true },
  });

  return { ok: true, invoice };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/magiccat/AutoInvoice/apps/backend && npx jest business-os/eve-invoice -i`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/magiccat/AutoInvoice && git add apps/backend/src/services/eve-invoice.ts apps/backend/src/__tests__/business-os/eve-invoice.test.ts
git commit -m "feat(invoice): eve-invoice service — validation + customer-confirmation signal"
```

---

## Task 3: `eve-invoice` service — happy path, totals, company default, confirm-create

**Files:**
- Test: `apps/backend/src/__tests__/business-os/eve-invoice.test.ts` (add cases)

- [ ] **Step 1: Add the failing tests**

Append inside the `describe` block:
```ts
  it('creates a DRAFT invoice for a matched customer with correct totals and source=eve', async () => {
    await prisma.customer.create({ data: { userId: ownerId, name: 'Brown Family' } });
    const res = await createStructuredInvoice({
      customer: { name: 'Brown Family' },
      lineItems: [
        { description: 'Mowing', quantity: 3, rate: 50 },
        { description: 'Edging', quantity: 1, rate: 20 },
      ],
      serviceAddress: '14 Oak St',
      serviceDate: '2026-06-15',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.invoice.status).toBe('DRAFT');
      expect(res.invoice.source).toBe('eve');
      expect(res.invoice.companyId).toBe('donovan-farms');
      expect(res.invoice.serviceAddress).toBe('14 Oak St');
      expect(Number(res.invoice.subtotal)).toBe(170);
      expect(Number(res.invoice.total)).toBe(170);
      expect(res.invoice.lineItems).toHaveLength(2);
      expect(res.invoice.userId).toBe(ownerId);
    }
  });

  it('creates the customer when confirmCreateCustomer is true', async () => {
    const res = await createStructuredInvoice({
      customer: { name: 'Jim Hawthorne' },
      lineItems: [{ description: 'Plowing', quantity: 1, rate: 75 }],
      confirmCreateCustomer: true,
    });
    expect(res.ok).toBe(true);
    const created = await prisma.customer.findFirst({ where: { name: 'Jim Hawthorne', userId: ownerId } });
    expect(created).not.toBeNull();
  });

  it('defaults to donovan-farms and rejects an unknown company', async () => {
    await prisma.customer.create({ data: { userId: ownerId, name: 'Default Co Cust' } });
    const ok = await createStructuredInvoice({ customer: { name: 'Default Co Cust' }, lineItems: [{ description: 'X', quantity: 1, rate: 10 }] });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.invoice.companyId).toBe('donovan-farms');

    await expect(
      createStructuredInvoice({ customer: { name: 'Default Co Cust' }, lineItems: [{ description: 'X', quantity: 1, rate: 10 }], companyId: 'no-such-co' })
    ).rejects.toThrow(/Unknown or inactive company/);
  });
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd /home/magiccat/AutoInvoice/apps/backend && npx jest business-os/eve-invoice -i`
Expected: PASS (6 tests). The service from Task 2 already implements this — no new code expected. If any fail, fix the service.

- [ ] **Step 3: Commit**

```bash
cd /home/magiccat/AutoInvoice && git add apps/backend/src/__tests__/business-os/eve-invoice.test.ts
git commit -m "test(invoice): eve-invoice happy path, totals, company default, confirm-create"
```

---

## Task 4: Express route `POST /invoices/structured` (service-token auth)

**Files:**
- Modify: `apps/backend/src/server.ts` (add route near the other `app.post('/webhook/...')` routes, before the tRPC `app.use` middleware mount)

- [ ] **Step 1: Add the route**

Insert after the `/webhook/orders/:sourceKey` route block in `apps/backend/src/server.ts`:
```ts
// Eve / agent invoicing — structured DRAFT invoice creation. Service-token auth.
app.post('/invoices/structured', async (req, res) => {
  const expected = process.env.AUTOINVOICE_SERVICE_TOKEN;
  if (!expected) return res.status(503).json({ error: 'Agent invoicing not enabled (AUTOINVOICE_SERVICE_TOKEN unset)' });
  if (req.headers.authorization !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { createStructuredInvoice, StructuredInvoiceError } = await import('./services/eve-invoice');
  try {
    const b = req.body ?? {};
    const result = await createStructuredInvoice({
      customer: b.customer ?? {},
      lineItems: b.line_items ?? [],
      serviceAddress: b.service_address,
      serviceDate: b.service_date,
      companyId: b.company_id,
      confirmCreateCustomer: b.confirm_create_customer === true,
    });
    if (!result.ok) return res.status(200).json(result); // customer_confirmation signal
    const inv = result.invoice;
    return res.status(201).json({
      ok: true,
      invoice_id: inv.id,
      invoice_number: inv.invoiceNumber,
      status: inv.status,
      company_id: inv.companyId,
      customer: { id: inv.customer.id, name: inv.customer.name },
      total_cents: Math.round(Number(inv.total) * 100),
      line_items: inv.lineItems.map((li: any) => ({ description: li.description, quantity: Number(li.quantity), rate_cents: Math.round(Number(li.rate) * 100), amount_cents: Math.round(Number(li.amount) * 100) })),
    });
  } catch (e: any) {
    const status = e instanceof StructuredInvoiceError ? e.status : 500;
    return res.status(status).json({ error: e?.message ?? 'Failed to create invoice' });
  }
});
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /home/magiccat/AutoInvoice/apps/backend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Manual smoke (requires backend running + AUTOINVOICE_SERVICE_TOKEN set)**

Run (after `export AUTOINVOICE_SERVICE_TOKEN=test-secret` and starting the dev backend):
```bash
curl -s -X POST http://localhost:4000/invoices/structured \
  -H "Authorization: Bearer test-secret" -H "content-type: application/json" \
  -d '{"customer":{"name":"Brown"},"line_items":[{"description":"Mowing","quantity":3,"rate":50}]}' | head
```
Expected: a JSON `customer_confirmation` signal (no "Brown" yet) or a `201` with `total_cents:15000` if a Brown exists. A missing/blank token → 401/503.

- [ ] **Step 4: Commit**

```bash
cd /home/magiccat/AutoInvoice && git add apps/backend/src/server.ts
git commit -m "feat(invoice): POST /invoices/structured — agent invoicing endpoint (service-token auth)"
```

---

## Task 5: `create_invoice` MCP tool

**Files:**
- Create: `packages/mcp/src/tools/create_invoice.ts`
- Modify: `packages/mcp/src/registry.ts`
- Test: `packages/mcp/tests/unit/create_invoice.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/mcp/tests/unit/create_invoice.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createInvoiceHandler } from "../../src/tools/create_invoice.js";

const OK = {
  ok: true, invoice_id: "inv1", invoice_number: "INV-000001", status: "DRAFT",
  company_id: "donovan-farms", customer: { id: "c1", name: "Brown" },
  total_cents: 15000, line_items: [{ description: "Mowing", quantity: 3, rate_cents: 5000, amount_cents: 15000 }],
};

beforeEach(() => { process.env.AUTOINVOICE_API_URL = "http://test"; process.env.AUTOINVOICE_SERVICE_TOKEN = "tok"; });
afterEach(() => { vi.restoreAllMocks(); });

describe("create_invoice", () => {
  it("posts structured fields and returns the backend success object", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => OK });
    vi.stubGlobal("fetch", fetchMock);
    const res = await createInvoiceHandler({
      customer: { name: "Brown" },
      line_items: [{ description: "Mowing", quantity: 3, rate: 50 }],
    });
    expect(res.total_cents).toBe(15000);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test/invoices/structured");
    expect(opts.headers.authorization).toBe("Bearer tok");
    expect(JSON.parse(opts.body).line_items[0].rate).toBe(50);
  });

  it("passes through a customer_confirmation signal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: false, needs: "customer_confirmation", query: "Ghost", candidates: [] }) }));
    const res = await createInvoiceHandler({ customer: { name: "Ghost" }, line_items: [{ description: "X", quantity: 1, rate: 1 }] });
    expect(res.needs).toBe("customer_confirmation");
  });

  it("rejects invalid input before calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createInvoiceHandler({ customer: {}, line_items: [] })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/magiccat/AutoInvoice/packages/mcp && npx vitest run create_invoice`
Expected: FAIL — cannot find `../../src/tools/create_invoice.js`.

- [ ] **Step 3: Write the tool**

Create `packages/mcp/src/tools/create_invoice.ts`:
```ts
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
```

(`McpError` codes confirmed in `packages/mcp/src/errors.ts`: `INVALID_PARAM` and `INTERNAL` are both valid — used as above.)

- [ ] **Step 4: Register the tool**

In `packages/mcp/src/registry.ts`, append after the `search_transactions` registration:
```ts
import { createInvoiceHandler, toolSpec as createInvoiceSpec } from "./tools/create_invoice.js";
TOOLS.push(createInvoiceSpec);
HANDLERS["create_invoice"] = createInvoiceHandler;
```

- [ ] **Step 5: Run tests + typecheck**

Run: `cd /home/magiccat/AutoInvoice/packages/mcp && npx tsc --noEmit && npx vitest run create_invoice`
Expected: tsc exit 0; 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/magiccat/AutoInvoice && git add packages/mcp/src/tools/create_invoice.ts packages/mcp/src/registry.ts packages/mcp/tests/unit/create_invoice.test.ts
git commit -m "feat(mcp): create_invoice tool (19th) — structured DRAFT invoices via backend endpoint"
```

---

## Task 6: CLI alias + full MCP suite

**Files:**
- Modify: `packages/mcp/src/cli.ts` (the `ALIASES` map)

- [ ] **Step 1: Add the alias**

In the `ALIASES` object in `packages/mcp/src/cli.ts`, add:
```ts
  "create-invoice": "create_invoice",
```

- [ ] **Step 2: Update the registered-tool count test**

In `packages/mcp/tests/unit/cli.test.ts`, update the two assertions that expect 18 tools to expect 19:
```ts
    expect(TOOLS).toHaveLength(19);
    expect(Object.keys(HANDLERS)).toHaveLength(19);
```

- [ ] **Step 3: Run the full MCP suite + build**

Run: `cd /home/magiccat/AutoInvoice/packages/mcp && npx tsc --noEmit && npx vitest run && npm run build`
Expected: all tests PASS; build exits 0.

- [ ] **Step 4: Commit**

```bash
cd /home/magiccat/AutoInvoice && git add packages/mcp/src/cli.ts packages/mcp/tests/unit/cli.test.ts
git commit -m "feat(cli): create-invoice alias; 19 tools"
```

---

## Task 7: Eve behavioral prompt

**Files:**
- Create: `docs/EVE_INVOICING_PROMPT.md`

- [ ] **Step 1: Write the prompt**

Create `docs/EVE_INVOICING_PROMPT.md`:
```markdown
# Eve — Invoicing Behavior

You can create invoices with the `create_invoice` tool. From the user's speech, gather:
- **Customer** — who is billed.
- **Line items** — for each: description (what was done), quantity, and rate (price each, in dollars).
- **Service address** — the job location (where the work happened). Optional.
- **Date** — when; default today.
- **Business** — default Donovan Farms unless told otherwise (e.g. "bill this under Business Builders").

Rules:
1. **Read the invoice back before creating it** — customer, each line as qty × rate, the line total, the address, the date, and the business — then wait for a clear "yes."
2. If the tool returns `needs: "customer_confirmation"`, the customer wasn't found. Tell the user, share any candidates, and ask before re-calling with `confirm_create_customer: true`.
3. Invoices are created as **DRAFT**. Say it's a draft to review and send from the dashboard. **Never say it was sent** — you cannot send.
4. The user speaks dollars; the tool reports totals in cents. Never invent a price — if a rate is missing, ask.
```

- [ ] **Step 2: Commit**

```bash
cd /home/magiccat/AutoInvoice && git add docs/EVE_INVOICING_PROMPT.md
git commit -m "docs(eve): invoicing behavioral prompt"
```

---

## Task 8: Eve SKILL.md

**Files:**
- Create: `docs/EVE_INVOICING_SKILL.md`

- [ ] **Step 1: Write the SKILL.md**

Create `docs/EVE_INVOICING_SKILL.md`:
```markdown
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
```

- [ ] **Step 2: Commit**

```bash
cd /home/magiccat/AutoInvoice && git add docs/EVE_INVOICING_SKILL.md
git commit -m "docs(eve): create_invoice SKILL.md — exact tool usage for Eve"
```

---

## Task 9: Final verification

- [ ] **Step 1: Backend suite green**

Run: `cd /home/magiccat/AutoInvoice/apps/backend && npm test 2>&1 | grep -E "Tests:|Test Suites:"`
Expected: all tests pass (prior 132 + new eve-invoice tests). Note: the runner may exit 1 on harmless post-test Prisma teardown logs — judge by the "Tests: N passed" line.

- [ ] **Step 2: MCP suite green + contract unchanged**

Run:
```bash
cd /home/magiccat/AutoInvoice/packages/mcp && npx vitest run 2>&1 | grep -E "Test Files|Tests"
cd /home/magiccat/AutoInvoice && DBURL=$(grep -E '^DATABASE_URL' apps/backend/.env | cut -d= -f2-) && { psql "$DBURL" -c '\d v_company_cash_daily' -c '\d v_ytd_pulse' -c '\d v_super_nova_burn' -c "SELECT proname, pg_get_function_result(oid) FROM pg_proc WHERE proname='f_project_cash';"; } | diff docs/wealth-os-contract/contract-baseline.txt - && echo "CONTRACT BYTE-IDENTICAL"
```
Expected: MCP all pass; "CONTRACT BYTE-IDENTICAL". (No DB schema change in this feature, so the contract must be untouched.)

- [ ] **Step 2.5: Backup before any DB use in Step 2**

Before running the psql diff in Step 2, take a backup (read-only, but house rule):
```bash
DBURL=$(grep -E '^DATABASE_URL' /home/magiccat/AutoInvoice/apps/backend/.env | cut -d= -f2-)
pg_dump "$DBURL" -Fc -f /home/magiccat/db-backups/autoinvoice-$(date +%Y%m%d-%H%M%S)-pre-eve-verify.dump
```

- [ ] **Step 3: Document the new env var (do not commit secrets)**

Add to `apps/backend/.env` (local only, gitignored) and note in the deployment follow-up:
```
AUTOINVOICE_SERVICE_TOKEN=<generate: openssl rand -hex 16>
```
The MCP process that Eve uses must have the same `AUTOINVOICE_SERVICE_TOKEN` and an `AUTOINVOICE_API_URL` pointing at the backend.

- [ ] **Step 4: Final commit if anything outstanding**

```bash
cd /home/magiccat/AutoInvoice && git status --short
```
Expected: clean (all work already committed task-by-task).

---

## Out of scope — deployment follow-up (separate plan)
Standing up the MCP HTTP transport as a pm2 service with a bearer token, exposing it to Eve's Contabo VPS (WireGuard/nginx), wiring `AUTOINVOICE_API_URL` + `AUTOINVOICE_SERVICE_TOKEN` into the MCP service env, and resolving the `~/AutoInvoice` vs `~/AutoInvoice-wealth-os` checkout so Eve runs current code. Until then, `create_invoice` is testable/usable locally over stdio but not reachable by remote Eve.
```
