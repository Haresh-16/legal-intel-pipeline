import { DEFAULT_DO_NOT_SAY } from "../constants";
import { callStructured, type GroqEnv } from "./groq";
import {
  SourceNormalized,
  CardDraft,
  ClaimDraftItem,
  ClaimDraftList,
  ClaimDraftResponse,
  PublicDraftOutput,
  InternalBriefOutput,
} from "./schemas";

const CONSERVATIVE_STYLE_RULES = `
Write in a conservative, legal-affairs newsroom style. Never overstate what the source supports.
Never assert a legal outcome, holding, or guarantee beyond what is explicitly stated.
If the underlying evidence is partial (a headline or snippet rather than full text), explicitly
acknowledge that uncertainty rather than implying full verification.`.trim();

function doNotSayInstruction(list: readonly string[]): string {
  return `Never include any of these phrases (case-insensitive) in any field you return: ${list
    .map((p) => `"${p}"`)
    .join(", ")}.`;
}

export async function normalizeSource(
  env: GroqEnv,
  rawText: string,
  options?: { partialEvidence?: boolean },
): Promise<SourceNormalized> {
  const systemPrompt = `You are a legal-market intelligence analyst normalizing a raw source into structured metadata.
${CONSERVATIVE_STYLE_RULES}
Respond with a single JSON object matching this exact shape:
{"title": string, "source_type": "news"|"regulatory"|"court"|"commentary"|"other", "primary_secondary": "primary"|"secondary", "proof_grade": "A"|"B"|"C", "key_extract": string (verbatim excerpt, max 200 chars), "suggested_vertical": string}
${options?.partialEvidence ? "The provided text is a partial excerpt (headline/snippet only) — proof_grade must not exceed C." : ""}`;

  const userPrompt = `Raw source text:\n"""\n${rawText}\n"""`;

  return callStructured(env, systemPrompt, userPrompt, SourceNormalized);
}

export async function draftIntelCard(
  env: GroqEnv,
  rawText: string,
  normalized: SourceNormalized,
  options?: { partialEvidence?: boolean },
): Promise<CardDraft> {
  const systemPrompt = `You are a legal-market intelligence analyst drafting an Intelligence Card from a normalized source.
${CONSERVATIVE_STYLE_RULES}
Use role names only for approval_owner (one of: Intelligence Desk, Writer, Builder, Ops, Legal, Principal) — never personal names.
Respond with a single JSON object matching this exact shape:
{"title": string, "vertical": string, "proof_grade": "A"|"B"|"C", "risk_level": "Low"|"Medium"|"High", "public_use_status": "Public"|"Website-safe after approval"|"Hold pending verification"|"Internal-only", "approval_owner": string, "narrative_gap_summary": string, "monetization_path": string}
narrative_gap_summary must describe the gap between how the market/public narrative reads this item and what is actually provable from the source.
${options?.partialEvidence ? "The underlying evidence is partial (headline/snippet only) — proof_grade must not exceed C, and public_use_status should be 'Hold pending verification' unless clearly Internal-only." : ""}`;

  const userPrompt = `Raw source text:\n"""\n${rawText}\n"""\n\nNormalized source metadata:\n${JSON.stringify(normalized)}`;

  return callStructured(env, systemPrompt, userPrompt, CardDraft);
}

export async function draftClaims(
  env: GroqEnv,
  rawText: string,
  card: CardDraft,
  options?: { doNotSayList?: readonly string[]; partialEvidence?: boolean },
): Promise<ClaimDraftList> {
  const doNotSayList = options?.doNotSayList ?? DEFAULT_DO_NOT_SAY;

  const systemPrompt = `You are a legal-market intelligence analyst extracting claims from a source for a Claims Ledger.
${CONSERVATIVE_STYLE_RULES}
${doNotSayInstruction(doNotSayList)}
Every claim must be directly supported by verbatim text from the source (supporting_source_spans) — never invent a claim the source does not support.
approved_public_version must be a conservative, scoped rewrite of exact_claim suitable for public use — strip out anything not directly provable.
Respond with a single JSON object: {"claims": [ {"exact_claim": string, "approved_public_version": string, "scope_limitation": string, "risk_notes": string, "do_not_say": string[], "proof_grade": "A"|"B"|"C", "supporting_source_spans": string[]} ] }
Return at least one claim.
${options?.partialEvidence ? "The source text is partial (headline/snippet only) — proof_grade must not exceed C, and scope_limitation must say the full text has not yet been verified." : ""}`;

  const userPrompt = `Raw source text:\n"""\n${rawText}\n"""\n\nIntelligence card:\n${JSON.stringify(card)}`;

  const result = await callStructured(env, systemPrompt, userPrompt, ClaimDraftResponse);
  return result.claims;
}

export async function draftPublicOutput(
  env: GroqEnv,
  card: CardDraft,
  claims: Array<ClaimDraftItem & { claimId: string }>,
  options?: { doNotSayList?: readonly string[] },
): Promise<PublicDraftOutput> {
  const doNotSayList = options?.doNotSayList ?? DEFAULT_DO_NOT_SAY;

  const systemPrompt = `You are a legal-affairs writer drafting a public news article DRAFT for human review (it will not publish automatically).
${CONSERVATIVE_STYLE_RULES}
${doNotSayInstruction(doNotSayList)}
You may only use the provided claim IDs and their approved_public_version language — never introduce a claim not in the list, and never use exact_claim language (only approved_public_version) in body text.
Every paragraph in body_paragraphs must be backed by at least one claim_id from claim_references.
Respond with a single JSON object: {"headline": string, "body_paragraphs": string[], "claim_references": string[] (claim IDs used)}`;

  const userPrompt = `Intelligence card:\n${JSON.stringify(card)}\n\nAvailable claims (use only approved_public_version text, referencing by claimId):\n${JSON.stringify(
    claims.map((c) => ({
      claimId: c.claimId,
      approved_public_version: c.approved_public_version,
      proof_grade: c.proof_grade,
    })),
  )}`;

  const validated = await callStructured(env, systemPrompt, userPrompt, PublicDraftOutput);
  // status is never trusted from the model — always hardcoded here.
  return { ...validated, status: "HOLD — pending approval" };
}

export async function draftInternalBrief(
  env: GroqEnv,
  card: CardDraft,
  claims: Array<ClaimDraftItem & { claimId: string }>,
): Promise<InternalBriefOutput> {
  const systemPrompt = `You are a legal-market intelligence analyst drafting an INTERNAL-ONLY brief for the firm's business-development team. This is never shown publicly.
Identify the practice-area signal and targeting opportunity implied by this item, and a concrete next action.
Respond with a single JSON object: {"practice_area_signal": string, "targeting_opportunity": string, "action_recommendation": string, "risk_summary": string}`;

  const userPrompt = `Intelligence card:\n${JSON.stringify(card)}\n\nClaims:\n${JSON.stringify(
    claims.map((c) => ({ claimId: c.claimId, exact_claim: c.exact_claim, risk_notes: c.risk_notes })),
  )}`;

  const validated = await callStructured(env, systemPrompt, userPrompt, InternalBriefOutput);
  // for_internal_use_only is never trusted from the model — always hardcoded here.
  return { ...validated, for_internal_use_only: true };
}
