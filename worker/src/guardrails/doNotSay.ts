export class DoNotSayViolationError extends Error {
  constructor(
    public readonly field: string,
    public readonly phrase: string,
  ) {
    super(`Forbidden phrase "${phrase}" found in field "${field}"`);
    this.name = "DoNotSayViolationError";
  }
}

export function findDoNotSayPhrase(text: string, doNotSayList: readonly string[]): string | null {
  const lower = text.toLowerCase();
  for (const phrase of doNotSayList) {
    if (lower.includes(phrase.toLowerCase())) return phrase;
  }
  return null;
}

/**
 * Scans every field's text (or each element, for array fields) for forbidden
 * phrases and throws on the first hit. This is the actual enforcement point —
 * the do-not-say list also appears in LLM system prompts, but that's guidance
 * only; this function is what blocks persistence (CLAUDE.md rule 8).
 */
export function assertNoDoNotSay(
  fields: Record<string, string | readonly string[]>,
  doNotSayList: readonly string[],
): void {
  for (const [field, value] of Object.entries(fields)) {
    const texts = Array.isArray(value) ? value : [value];
    for (const text of texts) {
      const hit = findDoNotSayPhrase(text, doNotSayList);
      if (hit) throw new DoNotSayViolationError(field, hit);
    }
  }
}
