import { describe, it, expect } from "vitest";
import {
  assertClaimHasSourceId,
  assertPublicOutputHasClaimReferences,
  ClaimMissingSourceError,
  PublicOutputMissingClaimReferencesError,
} from "../../worker/src/guardrails/validators";

describe("guardrails/validators.ts", () => {
  it("assertClaimHasSourceId passes when a source_id is present", () => {
    expect(() => assertClaimHasSourceId("src_123")).not.toThrow();
  });

  it("assertClaimHasSourceId throws on null/undefined/empty source_id", () => {
    expect(() => assertClaimHasSourceId(null)).toThrow(ClaimMissingSourceError);
    expect(() => assertClaimHasSourceId(undefined)).toThrow(ClaimMissingSourceError);
    expect(() => assertClaimHasSourceId("")).toThrow(ClaimMissingSourceError);
  });

  it("assertPublicOutputHasClaimReferences passes for a non-empty list", () => {
    expect(() => assertPublicOutputHasClaimReferences(["claim_1"])).not.toThrow();
  });

  it("assertPublicOutputHasClaimReferences throws on empty/missing list", () => {
    expect(() => assertPublicOutputHasClaimReferences([])).toThrow(PublicOutputMissingClaimReferencesError);
    expect(() => assertPublicOutputHasClaimReferences(undefined)).toThrow(PublicOutputMissingClaimReferencesError);
    expect(() => assertPublicOutputHasClaimReferences(null)).toThrow(PublicOutputMissingClaimReferencesError);
  });
});
