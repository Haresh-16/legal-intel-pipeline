// Canonical do-not-say list — enforced in code (guardrails/doNotSay.ts), and
// also surfaced to the LLM as a prompt instruction (belt-and-suspenders, not
// the actual enforcement mechanism).
export const DEFAULT_DO_NOT_SAY: readonly string[] = [
  "guaranteed outcome",
  "all courts agree",
  "definitive",
  "proven fact",
];
