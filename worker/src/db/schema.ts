import { sqliteTable, text } from "drizzle-orm/sqlite-core";

// Controlled-value enums (ProofGrade, RiskLevel, etc.) are enforced primarily via
// Zod (see ./enums.ts) at the API boundary. The matching SQL migration also adds
// CHECK constraints as defense-in-depth — kept in sync by hand, not generated here.

export const sourceRegistry = sqliteTable("source_registry", {
  sourceId: text("source_id").primaryKey(),
  title: text("title").notNull(),
  publisher: text("publisher"),
  author: text("author"),
  datePublished: text("date_published"),
  dateCaptured: text("date_captured").notNull(),
  url: text("url"),
  sourceType: text("source_type").notNull(),
  primarySecondary: text("primary_secondary").notNull(),
  publicStatus: text("public_status"),
  proofGrade: text("proof_grade"),
  pagesFiguresLines: text("pages_figures_lines"),
  keyExtract: text("key_extract"),
  relatedClaims: text("related_claims"), // JSON array
  relatedCards: text("related_cards"), // JSON array
  approvalStatus: text("approval_status"),
  notes: text("notes"),
});

export const rawEvidenceVault = sqliteTable("raw_evidence_vault", {
  evidenceId: text("evidence_id").primaryKey(),
  // FK intentionally omitted — raw_evidence_vault is insert-only by trigger,
  // so rollback can never delete these rows. A DB-level FK on source_id would
  // block compensating deletes of source_registry rows during pipeline rollback.
  // The pipeline always inserts source_registry before raw_evidence_vault,
  // so source_id is always valid at insert time without needing a FK guard.
  sourceId: text("source_id").notNull(),
  rawText: text("raw_text").notNull(),
  capturedAt: text("captured_at").notNull(),
});

export const intelligenceCards = sqliteTable("intelligence_cards", {
  cardId: text("card_id").primaryKey(),
  title: text("title").notNull(),
  vertical: text("vertical"),
  dateCreated: text("date_created").notNull(),
  status: text("status").notNull(),
  primarySourceIds: text("primary_source_ids").notNull(), // JSON array, length >= 1
  relatedClaimIds: text("related_claim_ids"), // JSON array
  proofGrade: text("proof_grade"),
  riskLevel: text("risk_level"),
  publicUseStatus: text("public_use_status"),
  writerStatus: text("writer_status"),
  builderStatus: text("builder_status"),
  approvalOwner: text("approval_owner"),
  monetizationPath: text("monetization_path"),
  outputPriority: text("output_priority"),
  tags: text("tags"), // JSON array
  narrativeGapSummary: text("narrative_gap_summary"),
});

export const claimsLedger = sqliteTable("claims_ledger", {
  claimId: text("claim_id").primaryKey(),
  cardId: text("card_id")
    .notNull()
    .references(() => intelligenceCards.cardId),
  exactClaim: text("exact_claim").notNull(),
  shortClaim: text("short_claim"),
  approvedPublicVersion: text("approved_public_version").notNull(),
  sourceIds: text("source_ids").notNull(), // JSON array, length >= 1 enforced in code
  proofGrade: text("proof_grade"),
  scopeLimitation: text("scope_limitation"),
  riskNotes: text("risk_notes"),
  doNotSay: text("do_not_say"), // JSON array
  approvedBy: text("approved_by"),
  approvalDate: text("approval_date"),
  whereUsed: text("where_used"),
  status: text("status").notNull(),
});

export const outputQueue = sqliteTable("output_queue", {
  outputId: text("output_id").primaryKey(),
  cardId: text("card_id")
    .notNull()
    .references(() => intelligenceCards.cardId),
  outputType: text("output_type").notNull(), // public_draft | internal_brief
  status: text("status").notNull().default("HOLD — pending approval"),
  content: text("content").notNull(), // JSON
  monetizationPathTag: text("monetization_path_tag"),
  createdAt: text("created_at").notNull(),
});

export const approvalLedger = sqliteTable("approval_ledger", {
  approvalId: text("approval_id").primaryKey(),
  outputId: text("output_id")
    .notNull()
    .references(() => outputQueue.outputId),
  action: text("action").notNull(),
  actorRole: text("actor_role").notNull(),
  timestamp: text("timestamp").notNull(),
  notes: text("notes"),
});

export const publishedAssetIndex = sqliteTable("published_asset_index", {
  assetId: text("asset_id").primaryKey(),
  outputId: text("output_id")
    .notNull()
    .references(() => outputQueue.outputId),
  approvalId: text("approval_id")
    .notNull()
    .references(() => approvalLedger.approvalId),
  createdAt: text("created_at").notNull(),
});

export const newsIntakeInbox = sqliteTable("news_intake_inbox", {
  candidateId: text("candidate_id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull().unique(),
  publisher: text("publisher"),
  publishedAt: text("published_at"),
  snippet: text("snippet"),
  rawPayload: text("raw_payload"), // JSON, full API response
  fetchedAt: text("fetched_at").notNull(),
  status: text("status").notNull().default("fetched"),
  sourceId: text("source_id"), // nullable until ingested
});
