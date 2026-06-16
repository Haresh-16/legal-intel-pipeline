export class ClaimMissingSourceError extends Error {
  constructor() {
    super("Claim must reference a valid source_id");
    this.name = "ClaimMissingSourceError";
  }
}

export class PublicOutputMissingClaimReferencesError extends Error {
  constructor() {
    super("Public output must reference at least one claim_id");
    this.name = "PublicOutputMissingClaimReferencesError";
  }
}

// CLAUDE.md invariant 4: claims without source IDs are rejected.
export function assertClaimHasSourceId(sourceId: string | null | undefined): void {
  if (!sourceId) throw new ClaimMissingSourceError();
}

// CLAUDE.md invariant 5: public output without claim references is rejected.
export function assertPublicOutputHasClaimReferences(claimReferences: readonly string[] | null | undefined): void {
  if (!claimReferences || claimReferences.length === 0) throw new PublicOutputMissingClaimReferencesError();
}
