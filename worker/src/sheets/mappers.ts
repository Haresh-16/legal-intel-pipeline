import type * as schema from "../db/schema";

type SourceRegistryRow = typeof schema.sourceRegistry.$inferSelect;
type IntelligenceCardRow = typeof schema.intelligenceCards.$inferSelect;
type ClaimsLedgerRow = typeof schema.claimsLedger.$inferSelect;
type OutputQueueRow = typeof schema.outputQueue.$inferSelect;
type ApprovalLedgerRow = typeof schema.approvalLedger.$inferSelect;
type NewsIntakeInboxRow = typeof schema.newsIntakeInbox.$inferSelect;

const SHEET_TABS = {
  sourceRegistry: "Source Registry",
  intelligenceCards: "Intelligence Cards",
  claimsLedger: "Claims Ledger",
  outputQueue: "Output Queue",
  approvalLedger: "Approval Ledger",
  newsIntakeInbox: "News Intake Inbox",
} as const;

function formatJsonArray(value: string | null): string {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.join("; ") : String(parsed);
  } catch {
    return value;
  }
}

function cell(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

export function sourceRegistryToRow(row: SourceRegistryRow): string[] {
  return [
    row.sourceId,
    row.title,
    cell(row.publisher),
    cell(row.author),
    cell(row.datePublished),
    row.dateCaptured,
    cell(row.url),
    row.sourceType,
    row.primarySecondary,
    cell(row.publicStatus),
    cell(row.proofGrade),
    cell(row.pagesFiguresLines),
    cell(row.keyExtract),
    formatJsonArray(row.relatedClaims),
    formatJsonArray(row.relatedCards),
    cell(row.approvalStatus),
    cell(row.notes),
  ];
}

export function intelligenceCardToRow(row: IntelligenceCardRow): string[] {
  return [
    row.cardId,
    row.title,
    cell(row.vertical),
    row.dateCreated,
    row.status,
    formatJsonArray(row.primarySourceIds),
    formatJsonArray(row.relatedClaimIds),
    cell(row.proofGrade),
    cell(row.riskLevel),
    cell(row.publicUseStatus),
    cell(row.writerStatus),
    cell(row.builderStatus),
    cell(row.approvalOwner),
    cell(row.monetizationPath),
    cell(row.outputPriority),
    formatJsonArray(row.tags),
    cell(row.narrativeGapSummary),
  ];
}

export function claimsLedgerToRow(row: ClaimsLedgerRow): string[] {
  return [
    row.claimId,
    row.cardId,
    row.exactClaim,
    cell(row.shortClaim),
    row.approvedPublicVersion,
    formatJsonArray(row.sourceIds),
    cell(row.proofGrade),
    cell(row.scopeLimitation),
    cell(row.riskNotes),
    formatJsonArray(row.doNotSay),
    cell(row.approvedBy),
    cell(row.approvalDate),
    cell(row.whereUsed),
    row.status,
  ];
}

export function outputQueueToRow(row: OutputQueueRow): string[] {
  return [
    row.outputId,
    row.cardId,
    row.outputType,
    row.status,
    row.content,
    cell(row.monetizationPathTag),
    row.createdAt,
  ];
}

export function approvalLedgerToRow(row: ApprovalLedgerRow): string[] {
  return [row.approvalId, row.outputId, row.action, row.actorRole, row.timestamp, cell(row.notes)];
}

export function newsIntakeInboxToRow(row: NewsIntakeInboxRow): string[] {
  return [
    row.candidateId,
    row.title,
    row.url,
    cell(row.publisher),
    cell(row.publishedAt),
    cell(row.snippet),
    row.fetchedAt,
    row.status,
    cell(row.sourceId),
  ];
}

export { SHEET_TABS };
