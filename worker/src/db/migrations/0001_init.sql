-- Legal Market Intelligence — initial schema (8 tables)
-- Controlled-value enums are enforced primarily via Zod at the API boundary;
-- CHECK constraints below are defense-in-depth, not the primary guard.

PRAGMA foreign_keys = ON;

CREATE TABLE source_registry (
  source_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  publisher TEXT,
  author TEXT,
  date_published TEXT,
  date_captured TEXT NOT NULL,
  url TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('news','regulatory','court','commentary','other')),
  primary_secondary TEXT NOT NULL CHECK (primary_secondary IN ('primary','secondary')),
  public_status TEXT,
  proof_grade TEXT CHECK (proof_grade IS NULL OR proof_grade IN ('A','B','C')),
  pages_figures_lines TEXT,
  key_extract TEXT,
  related_claims TEXT,
  related_cards TEXT,
  approval_status TEXT,
  notes TEXT
);

CREATE TABLE raw_evidence_vault (
  evidence_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES source_registry(source_id),
  raw_text TEXT NOT NULL,
  captured_at TEXT NOT NULL
);

-- Insert-only guard: any UPDATE or DELETE attempt aborts the statement.
CREATE TRIGGER prevent_evidence_update
BEFORE UPDATE ON raw_evidence_vault
BEGIN
  SELECT RAISE(ABORT, 'raw_evidence_vault is insert-only: UPDATE not allowed');
END;

CREATE TRIGGER prevent_evidence_delete
BEFORE DELETE ON raw_evidence_vault
BEGIN
  SELECT RAISE(ABORT, 'raw_evidence_vault is insert-only: DELETE not allowed');
END;

CREATE TABLE intelligence_cards (
  card_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  vertical TEXT,
  date_created TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Research lead','Card drafted','Draft ready','Hold','Approved','Published','Archived')),
  primary_source_ids TEXT NOT NULL,
  related_claim_ids TEXT,
  proof_grade TEXT CHECK (proof_grade IS NULL OR proof_grade IN ('A','B','C')),
  risk_level TEXT CHECK (risk_level IS NULL OR risk_level IN ('Low','Medium','High')),
  public_use_status TEXT CHECK (public_use_status IS NULL OR public_use_status IN ('Public','Website-safe after approval','Hold pending verification','Internal-only')),
  writer_status TEXT,
  builder_status TEXT,
  approval_owner TEXT CHECK (approval_owner IS NULL OR approval_owner IN ('Intelligence Desk','Writer','Builder','Ops','Legal','Principal')),
  monetization_path TEXT,
  output_priority TEXT,
  tags TEXT,
  narrative_gap_summary TEXT
);

CREATE TABLE claims_ledger (
  claim_id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES intelligence_cards(card_id),
  exact_claim TEXT NOT NULL,
  short_claim TEXT,
  approved_public_version TEXT NOT NULL,
  source_ids TEXT NOT NULL,
  proof_grade TEXT CHECK (proof_grade IS NULL OR proof_grade IN ('A','B','C')),
  scope_limitation TEXT,
  risk_notes TEXT,
  do_not_say TEXT,
  approved_by TEXT CHECK (approved_by IS NULL OR approved_by IN ('Intelligence Desk','Writer','Builder','Ops','Legal','Principal')),
  approval_date TEXT,
  where_used TEXT,
  status TEXT NOT NULL CHECK (status IN ('Research lead','Card drafted','Draft ready','Hold','Approved','Published','Archived'))
);

CREATE TABLE output_queue (
  output_id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES intelligence_cards(card_id),
  output_type TEXT NOT NULL CHECK (output_type IN ('public_draft','internal_brief')),
  status TEXT NOT NULL DEFAULT 'HOLD — pending approval' CHECK (status IN ('HOLD — pending approval','approved','archived')),
  content TEXT NOT NULL,
  monetization_path_tag TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE approval_ledger (
  approval_id TEXT PRIMARY KEY,
  output_id TEXT NOT NULL REFERENCES output_queue(output_id),
  action TEXT NOT NULL CHECK (action IN ('approve','archive')),
  actor_role TEXT NOT NULL CHECK (actor_role IN ('Intelligence Desk','Writer','Builder','Ops','Legal','Principal')),
  timestamp TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE published_asset_index (
  asset_id TEXT PRIMARY KEY,
  output_id TEXT NOT NULL REFERENCES output_queue(output_id),
  approval_id TEXT NOT NULL REFERENCES approval_ledger(approval_id),
  created_at TEXT NOT NULL
);

CREATE TABLE news_intake_inbox (
  candidate_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  publisher TEXT,
  published_at TEXT,
  snippet TEXT,
  raw_payload TEXT,
  fetched_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'fetched' CHECK (status IN ('fetched','selected','ingested','rejected')),
  source_id TEXT REFERENCES source_registry(source_id)
);
