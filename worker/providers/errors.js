// Typed error so postMj can map provider failures to the right HTTP status.
export class ProviderError extends Error {
  constructor(kind, detail) {
    super(kind);              // kind: "quota" | "upstream" | "unreachable"
    this.name = "ProviderError";
    this.kind = kind;
    this.detail = detail;     // optional: status + short body, for admin diagnostics
  }
}
