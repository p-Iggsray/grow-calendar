// Typed error so postMj can map provider failures to the right HTTP status.
export class ProviderError extends Error {
  constructor(kind) {
    super(kind);              // kind: "quota" | "upstream" | "unreachable"
    this.name = "ProviderError";
    this.kind = kind;
  }
}
