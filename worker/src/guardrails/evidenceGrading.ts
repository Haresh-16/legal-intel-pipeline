import type { ProofGrade } from "../db/enums";

export const PARTIAL_EVIDENCE_SCOPE_NOTE = "Based on headline/snippet only; full text not yet verified.";

// Partial evidence (headline/snippet from the free-tier News API, rather than
// full article text) can never support an A or B grade, regardless of what
// the LLM suggested — this is enforced here, after Zod validation and before
// persistence, not left to prompt instructions alone.
export function capProofGradeForPartialEvidence(grade: ProofGrade, partial: boolean): ProofGrade {
  return partial ? "C" : grade;
}

export function applyPartialEvidenceScopeLimitation(scopeLimitation: string, partial: boolean): string {
  if (!partial) return scopeLimitation;
  if (scopeLimitation.includes(PARTIAL_EVIDENCE_SCOPE_NOTE)) return scopeLimitation;
  return `${scopeLimitation.trim()} ${PARTIAL_EVIDENCE_SCOPE_NOTE}`.trim();
}
