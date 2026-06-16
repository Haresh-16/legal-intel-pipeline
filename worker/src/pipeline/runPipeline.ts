import { ulid } from "ulid";
import type { GroqEnv } from "../llm/groq";
import { normalizeSource, draftIntelCard, draftClaims, draftPublicOutput, draftInternalBrief } from "../llm/prompts";
import { type SheetsEnv, appendRow as defaultAppendRow } from "../sheets/client";
import {
  sourceRegistryToRow,
  intelligenceCardToRow,
  claimsLedgerToRow,
  outputQueueToRow,
  SHEET_TABS,
} from "../sheets/mappers";
import { DEFAULT_DO_NOT_SAY } from "../constants";
import { assertNoDoNotSay } from "../guardrails/doNotSay";
import { assertClaimHasSourceId, assertPublicOutputHasClaimReferences } from "../guardrails/validators";
import { capProofGradeForPartialEvidence, applyPartialEvidenceScopeLimitation } from "../guardrails/evidenceGrading";
import type { PipelineRepo } from "./repo";
import type * as schema from "../db/schema";

export interface PipelineSourceMeta {
  url?: string;
  publisher?: string;
  author?: string;
  datePublished?: string;
}

export interface PipelineInput {
  rawText: string;
  sourceMeta?: PipelineSourceMeta;
  partialEvidence?: boolean;
}

export interface PipelineEnv extends GroqEnv, SheetsEnv {}

export interface PipelineDeps {
  repo: PipelineRepo;
  env: PipelineEnv;
  appendRow?: typeof defaultAppendRow;
  now?: () => string;
}

export interface PipelineResult {
  sourceId: string;
  cardId: string;
  claimIds: string[];
  publicOutputId: string;
  internalOutputId: string;
}

// Required D1 writes and required Sheets writes must both succeed for a
// pipeline run to be considered successful (CLAUDE.md invariant 9). D1 and
// Sheets can't share one transaction, so this is a compensating-action saga,
// not a real distributed transaction: D1 writes commit first (atomically, via
// a single batch), then Sheets is synced; a Sheets failure triggers
// compensating deletes of everything just written to D1 (except the
// insert-only evidence vault).
export class PipelineSheetsSyncError extends Error {
  constructor(public readonly cause: unknown) {
    super("Pipeline failed: Google Sheets sync failed, D1 writes were rolled back");
    this.name = "PipelineSheetsSyncError";
  }
}

export async function runPipeline(input: PipelineInput, deps: PipelineDeps): Promise<PipelineResult> {
  const { repo, env } = deps;
  const appendRow = deps.appendRow ?? defaultAppendRow;
  const now = deps.now ?? (() => new Date().toISOString());
  const partial = input.partialEvidence ?? false;
  const doNotSayList = DEFAULT_DO_NOT_SAY;

  const normalized = await normalizeSource(env, input.rawText, { partialEvidence: partial });
  const sourceId = `src_${ulid()}`;
  const sourceRow: typeof schema.sourceRegistry.$inferInsert = {
    sourceId,
    title: normalized.title,
    publisher: input.sourceMeta?.publisher ?? null,
    author: input.sourceMeta?.author ?? null,
    datePublished: input.sourceMeta?.datePublished ?? null,
    dateCaptured: now(),
    url: input.sourceMeta?.url ?? null,
    sourceType: normalized.source_type,
    primarySecondary: normalized.primary_secondary,
    publicStatus: null,
    proofGrade: capProofGradeForPartialEvidence(normalized.proof_grade, partial),
    pagesFiguresLines: null,
    keyExtract: normalized.key_extract,
    relatedClaims: JSON.stringify([]),
    relatedCards: JSON.stringify([]),
    approvalStatus: null,
    notes: null,
  };

  const evidenceRow: typeof schema.rawEvidenceVault.$inferInsert = {
    evidenceId: `evd_${ulid()}`,
    sourceId,
    rawText: input.rawText,
    capturedAt: now(),
  };

  const card = await draftIntelCard(env, input.rawText, normalized, { partialEvidence: partial });
  const cardId = `card_${ulid()}`;

  const claimDrafts = await draftClaims(env, input.rawText, card, { doNotSayList, partialEvidence: partial });
  const claimIds: string[] = [];
  const claimRows: Array<typeof schema.claimsLedger.$inferInsert> = [];
  for (const claim of claimDrafts) {
    // Every claim in this pipeline traces to the single source being
    // ingested; this assertion is the code-level enforcement of "claims
    // without source IDs are rejected" (CLAUDE.md invariant 4).
    assertClaimHasSourceId(sourceId);
    const proofGrade = capProofGradeForPartialEvidence(claim.proof_grade, partial);
    const scopeLimitation = applyPartialEvidenceScopeLimitation(claim.scope_limitation, partial);
    assertNoDoNotSay(
      {
        exact_claim: claim.exact_claim,
        approved_public_version: claim.approved_public_version,
        scope_limitation: scopeLimitation,
        risk_notes: claim.risk_notes,
      },
      doNotSayList,
    );
    const claimId = `clm_${ulid()}`;
    claimIds.push(claimId);
    claimRows.push({
      claimId,
      cardId,
      exactClaim: claim.exact_claim,
      shortClaim: null,
      approvedPublicVersion: claim.approved_public_version,
      sourceIds: JSON.stringify([sourceId]),
      proofGrade,
      scopeLimitation,
      riskNotes: claim.risk_notes,
      doNotSay: JSON.stringify(claim.do_not_say),
      approvedBy: null,
      approvalDate: null,
      whereUsed: null,
      status: "Draft ready",
    });
  }

  const cardRow: typeof schema.intelligenceCards.$inferInsert = {
    cardId,
    title: card.title,
    vertical: card.vertical,
    dateCreated: now(),
    status: "Card drafted",
    primarySourceIds: JSON.stringify([sourceId]),
    relatedClaimIds: JSON.stringify(claimIds),
    proofGrade: capProofGradeForPartialEvidence(card.proof_grade, partial),
    riskLevel: card.risk_level,
    publicUseStatus: card.public_use_status,
    writerStatus: null,
    builderStatus: null,
    approvalOwner: card.approval_owner,
    monetizationPath: card.monetization_path,
    outputPriority: null,
    tags: JSON.stringify([card.vertical]),
    narrativeGapSummary: card.narrative_gap_summary,
  };

  const claimsForOutput = claimDrafts.map((claim, i) => ({ ...claim, claimId: claimIds[i] }));

  const publicDraft = await draftPublicOutput(env, card, claimsForOutput, { doNotSayList });
  // "Public output without claim references is rejected" (invariant 5).
  assertPublicOutputHasClaimReferences(publicDraft.claim_references);
  assertNoDoNotSay({ headline: publicDraft.headline, body_paragraphs: publicDraft.body_paragraphs }, doNotSayList);

  const publicOutputId = `out_${ulid()}`;
  const publicOutputRow: typeof schema.outputQueue.$inferInsert = {
    outputId: publicOutputId,
    cardId,
    outputType: "public_draft",
    status: "HOLD — pending approval",
    content: JSON.stringify({
      headline: publicDraft.headline,
      body_paragraphs: publicDraft.body_paragraphs,
      claim_references: publicDraft.claim_references,
    }),
    monetizationPathTag: card.monetization_path,
    createdAt: now(),
  };

  const internalBrief = await draftInternalBrief(env, card, claimsForOutput);
  const internalOutputId = `out_${ulid()}`;
  const internalOutputRow: typeof schema.outputQueue.$inferInsert = {
    outputId: internalOutputId,
    cardId,
    outputType: "internal_brief",
    status: "HOLD — pending approval",
    content: JSON.stringify(internalBrief),
    monetizationPathTag: null,
    createdAt: now(),
  };

  await repo.insertAll({
    source: sourceRow,
    evidence: evidenceRow,
    card: cardRow,
    claims: claimRows,
    outputs: [publicOutputRow, internalOutputRow],
  });

  try {
    await appendRow(env, SHEET_TABS.sourceRegistry, sourceRegistryToRow(sourceRow as typeof schema.sourceRegistry.$inferSelect));
    await appendRow(env, SHEET_TABS.intelligenceCards, intelligenceCardToRow(cardRow as typeof schema.intelligenceCards.$inferSelect));
    for (const claimRow of claimRows) {
      await appendRow(env, SHEET_TABS.claimsLedger, claimsLedgerToRow(claimRow as typeof schema.claimsLedger.$inferSelect));
    }
    await appendRow(env, SHEET_TABS.outputQueue, outputQueueToRow(publicOutputRow as typeof schema.outputQueue.$inferSelect));
    await appendRow(env, SHEET_TABS.outputQueue, outputQueueToRow(internalOutputRow as typeof schema.outputQueue.$inferSelect));
  } catch (err) {
    try {
      await repo.rollback({ sourceId, cardId, claimIds, outputIds: [publicOutputId, internalOutputId] });
    } catch (rollbackErr) {
      // Rollback failure is logged but not re-thrown — the original Sheets sync
      // error is the failure the caller needs to know about.
      console.error("[pipeline] D1 rollback failed after Sheets sync error:", rollbackErr);
    }
    throw new PipelineSheetsSyncError(err);
  }

  return { sourceId, cardId, claimIds, publicOutputId, internalOutputId };
}
