import { describe, it, expect } from "vitest";
import {
  capProofGradeForPartialEvidence,
  applyPartialEvidenceScopeLimitation,
  PARTIAL_EVIDENCE_SCOPE_NOTE,
} from "../../worker/src/guardrails/evidenceGrading";

describe("guardrails/evidenceGrading.ts", () => {
  it("leaves the grade untouched when evidence is not partial", () => {
    expect(capProofGradeForPartialEvidence("A", false)).toBe("A");
    expect(capProofGradeForPartialEvidence("B", false)).toBe("B");
    expect(capProofGradeForPartialEvidence("C", false)).toBe("C");
  });

  it("caps A and B down to C when evidence is partial", () => {
    expect(capProofGradeForPartialEvidence("A", true)).toBe("C");
    expect(capProofGradeForPartialEvidence("B", true)).toBe("C");
  });

  it("leaves C as C when evidence is partial", () => {
    expect(capProofGradeForPartialEvidence("C", true)).toBe("C");
  });

  it("leaves scope_limitation untouched when evidence is not partial", () => {
    expect(applyPartialEvidenceScopeLimitation("Limited to the filed motion.", false)).toBe(
      "Limited to the filed motion.",
    );
  });

  it("appends the partial-evidence note when evidence is partial", () => {
    const result = applyPartialEvidenceScopeLimitation("Limited to the filed motion.", true);
    expect(result).toContain("Limited to the filed motion.");
    expect(result).toContain(PARTIAL_EVIDENCE_SCOPE_NOTE);
  });

  it("does not duplicate the note if already present", () => {
    const alreadyTagged = `Limited scope. ${PARTIAL_EVIDENCE_SCOPE_NOTE}`;
    const result = applyPartialEvidenceScopeLimitation(alreadyTagged, true);
    expect(result.split(PARTIAL_EVIDENCE_SCOPE_NOTE).length - 1).toBe(1);
  });
});
