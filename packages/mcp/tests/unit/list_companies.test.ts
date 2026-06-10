import { describe, it, expect, vi } from "vitest";
import { listCompaniesHandler } from "../../src/tools/list_companies.js";

describe("list_companies", () => {
  it("returns active companies by default", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { id: "comp1", name: "Business Builders", active: true },
          { id: "comp2", name: "Donovan Farms", active: true },
        ],
      }),
    } as any;

    const result = await listCompaniesHandler({}, mockPool);
    expect(result.companies).toHaveLength(2);
    expect(result.companies[0].name).toBe("Business Builders");
    expect(result.count).toBe(2);
    expect(result.as_of).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.source).toMatch(/^autoinvoice-mcp@/);

    // Verify the query filters active
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE active = true")
    );
  });

  it("includes inactive when requested", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { id: "comp1", name: "Active Co", active: true },
          { id: "comp3", name: "Dead Co", active: false },
        ],
      }),
    } as any;

    const result = await listCompaniesHandler(
      { include_inactive: true },
      mockPool
    );
    expect(result.companies).toHaveLength(2);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.not.stringContaining("WHERE active")
    );
  });

  it("throws McpError on invalid input", async () => {
    const mockPool = { query: vi.fn() } as any;
    await expect(
      listCompaniesHandler({ include_inactive: "not_a_boolean" }, mockPool)
    ).rejects.toThrow();
  });
});
