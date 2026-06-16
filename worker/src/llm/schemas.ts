import { z } from "zod";
import { ProofGrade, RiskLevel, PublicUseStatus, ApprovalRole, SourceType, PrimarySecondary } from "../db/enums";

export const SourceNormalized = z.object({
  title: z.string().min(1),
  source_type: SourceType,
  primary_secondary: PrimarySecondary,
  proof_grade: ProofGrade,
  key_extract: z.string().min(1).max(200),
  suggested_vertical: z.string().min(1),
});
export type SourceNormalized = z.infer<typeof SourceNormalized>;

export const CardDraft = z.object({
  title: z.string().min(1),
  vertical: z.string().min(1),
  proof_grade: ProofGrade,
  risk_level: RiskLevel,
  public_use_status: PublicUseStatus,
  approval_owner: ApprovalRole,
  narrative_gap_summary: z.string().min(1),
  monetization_path: z.string().min(1),
});
export type CardDraft = z.infer<typeof CardDraft>;

export const ClaimDraftItem = z.object({
  exact_claim: z.string().min(1),
  approved_public_version: z.string().min(1),
  scope_limitation: z.string().min(1),
  risk_notes: z.string().min(1),
  do_not_say: z.array(z.string()),
  proof_grade: ProofGrade,
  supporting_source_spans: z.array(z.string()).min(1),
});
export type ClaimDraftItem = z.infer<typeof ClaimDraftItem>;

export const ClaimDraftList = z.array(ClaimDraftItem).min(1);
export type ClaimDraftList = z.infer<typeof ClaimDraftList>;

// Groq's json_object response mode requires a top-level JSON *object*, so the
// wire format wraps the array — draftClaims() unwraps it before returning.
export const ClaimDraftResponse = z.object({ claims: ClaimDraftList });
export type ClaimDraftResponse = z.infer<typeof ClaimDraftResponse>;

// `status` is requested from the LLM only so the contract shape matches
// CLAUDE.md's documented schema; the value is always discarded and
// overwritten with the hardcoded "HOLD — pending approval" in code
// (see prompts.ts draftPublicOutput) — never trusted from the model.
export const PublicDraftOutput = z.object({
  headline: z.string().min(1),
  body_paragraphs: z.array(z.string().min(1)).min(1),
  claim_references: z.array(z.string()).min(1),
  status: z.string().optional(),
});
export type PublicDraftOutput = z.infer<typeof PublicDraftOutput>;

// `for_internal_use_only` is likewise always overwritten to `true` in code.
export const InternalBriefOutput = z.object({
  practice_area_signal: z.string().min(1),
  targeting_opportunity: z.string().min(1),
  action_recommendation: z.string().min(1),
  risk_summary: z.string().min(1),
  for_internal_use_only: z.boolean().optional(),
});
export type InternalBriefOutput = z.infer<typeof InternalBriefOutput>;
