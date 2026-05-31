export type ErrorCode =
  | "RECONCILIATION_REQUIRED"
  | "INVALID_PARAM"
  | "INVALID_DATE_RANGE"
  | "COMPANY_NOT_FOUND"
  | "INSUFFICIENT_DATA"
  | "RATE_LIMITED"
  | "CONFIG_MISSING"
  | "INTERNAL";

export class McpError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "McpError";
  }

  toMcpResponse() {
    return {
      isError: true as const,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: { code: this.code, message: this.message, details: this.details ?? {} },
          }),
        },
      ],
    };
  }
}

export function intoMcpError(e: unknown): McpError {
  if (e instanceof McpError) return e;
  if (e instanceof Error) return new McpError("INTERNAL", e.message);
  return new McpError("INTERNAL", String(e));
}
