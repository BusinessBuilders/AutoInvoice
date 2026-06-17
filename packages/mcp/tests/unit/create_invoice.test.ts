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
