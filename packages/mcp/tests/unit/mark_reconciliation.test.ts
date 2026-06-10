import { describe, it, expect, vi } from "vitest";
import { markReconciliationHandler } from "../../src/tools/mark_reconciliation.js";
import { McpError } from "../../src/errors.js";

function makeMockPool(companyExists: boolean, upsertRow?: Record<string, unknown>) {
  const defaultRow = {
    id: "uuid-123",
    company_id: "comp1",
    through_date: "2026-05-25",
    source: "manual",
    written_by: "donovan",
    written_at: "2026-05-31T10:00:00.000Z",
    note: null,
  };

  return {
    query: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM "Company"')) {
        return { rows: companyExists ? [{ id: "comp1" }] : [] };
      }
      // upsert query
      return { rows: [upsertRow ?? defaultRow] };
    }),
  } as any;
}

describe("mark_reconciliation", () => {
  const validInput = {
    company_id: "comp1",
    through_date: "2026-05-25",
    source: "manual" as const,
    written_by: "donovan",
  };

  it("successful upsert returns correct shape", async () => {
    const pool = makeMockPool(true);
    const result = await markReconciliationHandler(validInput, pool);

    expect(result.id).toBe("uuid-123");
    expect(result.company_id).toBe("comp1");
    expect(result.through_date).toBe("2026-05-25");
    expect(result.source).toBe("manual");
    expect(result.written_by).toBe("donovan");
    expect(result.written_at).toBe("2026-05-31T10:00:00.000Z");
    expect(result.note).toBeNull();
    expect(result.upserted).toBe(true);
    expect(result.source_tag).toMatch(/^autoinvoice-mcp@/);
  });

  it("throws COMPANY_NOT_FOUND for non-existent company", async () => {
    const pool = makeMockPool(false);

    await expect(markReconciliationHandler(validInput, pool)).rejects.toThrow(
      McpError
    );

    try {
      await markReconciliationHandler(validInput, pool);
    } catch (e) {
      expect(e).toBeInstanceOf(McpError);
      expect((e as McpError).code).toBe("COMPANY_NOT_FOUND");
    }
  });

  it("throws INVALID_PARAM for invalid source value", async () => {
    const pool = makeMockPool(true);

    await expect(
      markReconciliationHandler({ ...validInput, source: "bad_source" }, pool)
    ).rejects.toThrow(McpError);

    try {
      await markReconciliationHandler({ ...validInput, source: "bad_source" }, pool);
    } catch (e) {
      expect(e).toBeInstanceOf(McpError);
      expect((e as McpError).code).toBe("INVALID_PARAM");
    }
  });

  it("validates through_date format", async () => {
    const pool = makeMockPool(true);

    await expect(
      markReconciliationHandler({ ...validInput, through_date: "05-25-2026" }, pool)
    ).rejects.toThrow(McpError);

    await expect(
      markReconciliationHandler({ ...validInput, through_date: "not-a-date" }, pool)
    ).rejects.toThrow(McpError);

    try {
      await markReconciliationHandler({ ...validInput, through_date: "2026/05/25" }, pool);
    } catch (e) {
      expect(e).toBeInstanceOf(McpError);
      expect((e as McpError).code).toBe("INVALID_PARAM");
    }
  });

  it("idempotent — second call with same company_id + through_date succeeds", async () => {
    const updatedRow = {
      id: "uuid-123",
      company_id: "comp1",
      through_date: "2026-05-25",
      source: "statement_match",
      written_by: "system",
      written_at: "2026-05-31T11:00:00.000Z",
      note: "updated note",
    };
    const pool = makeMockPool(true, updatedRow);

    // First call
    const result1 = await markReconciliationHandler(validInput, pool);
    expect(result1.upserted).toBe(true);

    // Second call with updated source/written_by
    const result2 = await markReconciliationHandler(
      { ...validInput, source: "statement_match", written_by: "system", note: "updated note" },
      pool
    );
    expect(result2.upserted).toBe(true);
    expect(result2.source).toBe("statement_match");
    expect(result2.written_by).toBe("system");
    expect(result2.note).toBe("updated note");
  });

  it("passes note through when provided", async () => {
    const rowWithNote = {
      id: "uuid-456",
      company_id: "comp1",
      through_date: "2026-05-25",
      source: "manual",
      written_by: "donovan",
      written_at: "2026-05-31T10:00:00.000Z",
      note: "month-end close",
    };
    const pool = makeMockPool(true, rowWithNote);

    const result = await markReconciliationHandler(
      { ...validInput, note: "month-end close" },
      pool
    );
    expect(result.note).toBe("month-end close");
  });
});
