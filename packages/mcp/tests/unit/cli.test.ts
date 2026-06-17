import { describe, it, expect } from "vitest";
import { resolveCommand, parseFlags, coerceInput, ALIASES, CliError } from "../../src/cli.js";
import { TOOLS, HANDLERS } from "../../src/registry.js";

describe("cli — command resolution", () => {
  it("resolves exact tool names, hyphenated forms, and aliases", () => {
    expect(resolveCommand("search_transactions")).toBe("search_transactions");
    expect(resolveCommand("search-transactions")).toBe("search_transactions");
    expect(resolveCommand("transactions")).toBe("search_transactions");
    expect(resolveCommand("customer")).toBe("get_customer_360");
    expect(resolveCommand("nope")).toBeNull();
  });

  it("every alias targets a registered handler; all 18 tools registered", () => {
    for (const target of Object.values(ALIASES)) {
      expect(HANDLERS[target], `alias target ${target}`).toBeTypeOf("function");
    }
    expect(TOOLS).toHaveLength(19);
    expect(Object.keys(HANDLERS)).toHaveLength(19);
  });
});

describe("cli — flag parsing", () => {
  it("parses --flag value, --flag=value, and --json", () => {
    const { flags, json } = parseFlags(["--text", "AMZN", "--limit=5", "--json"]);
    expect(flags).toEqual({ text: "AMZN", limit: "5" });
    expect(json).toBe(true);
  });

  it("accepts a leading JSON blob with flag overrides", () => {
    const { base, flags } = parseFlags(['{"text":"AMZN","limit":2}', "--limit", "9"]);
    expect(base).toEqual({ text: "AMZN", limit: 2 });
    expect(flags).toEqual({ limit: "9" });
  });

  it("rejects bad JSON, non-object JSON, dangling flags, and stray args", () => {
    expect(() => parseFlags(["{not json"])).toThrow(CliError);
    expect(() => parseFlags(["[1,2]"])).toThrow(CliError);
    expect(() => parseFlags(["--text"])).toThrow(/needs a value/);
    expect(() => parseFlags(["--text", "--json"])).toThrow(/needs a value/);
    expect(() => parseFlags(["--a", "1", "stray"])).toThrow(/Unexpected argument/);
  });
});

describe("cli — schema-driven coercion", () => {
  const schema = {
    properties: {
      text: { type: "string" },
      limit: { type: "number" },
      week: { type: "integer" },
      include_inactive: { type: "boolean" },
    },
  };

  it("coerces numbers, integers, and booleans; kebab flags map to snake keys", () => {
    const input = coerceInput(schema, {}, {
      text: "AMZN",
      limit: "5",
      week: "23",
      "include-inactive": "true",
    });
    expect(input).toEqual({ text: "AMZN", limit: 5, week: 23, include_inactive: true });
  });

  it("flags override the JSON base; undeclared keys stay strings", () => {
    const input = coerceInput(schema, { limit: 2, extra: 1 }, { limit: "9", mystery: "x" });
    expect(input).toEqual({ limit: 9, extra: 1, mystery: "x" });
  });

  it("rejects non-numeric numbers and non-boolean booleans", () => {
    expect(() => coerceInput(schema, {}, { limit: "abc" })).toThrow(/must be a number/);
    expect(() => coerceInput(schema, {}, { "include-inactive": "yes" })).toThrow(/true or false/);
  });

  it("transactions example coerces against the real search_transactions schema", () => {
    const spec = TOOLS.find((t) => t.name === "search_transactions")!;
    const input = coerceInput(spec.inputSchema, {}, { text: "AMZN", limit: "5", "min-amount-cents": "-100000" });
    expect(input).toEqual({ text: "AMZN", limit: 5, min_amount_cents: -100000 });
  });
});
