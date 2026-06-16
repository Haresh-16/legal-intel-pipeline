-- Remove the FOREIGN KEY from raw_evidence_vault.source_id.
-- SQLite does not support DROP CONSTRAINT, so we recreate the table.
--
-- The FK provided no protection: the pipeline always inserts source_registry
-- before raw_evidence_vault, so a bad source_id reference can't arise at
-- insert time. What it DID do is block rollback deletes of source_registry
-- rows (raw_evidence_vault is insert-only by trigger, so it can never be
-- cleaned up), causing the compensating saga to fail with a FK constraint
-- error when Google Sheets sync fails and rollback is attempted.

CREATE TABLE raw_evidence_vault_new (
  evidence_id TEXT PRIMARY KEY,
  source_id   TEXT NOT NULL,
  raw_text    TEXT NOT NULL,
  captured_at TEXT NOT NULL
);

INSERT INTO raw_evidence_vault_new
  SELECT evidence_id, source_id, raw_text, captured_at
  FROM raw_evidence_vault;

DROP TABLE raw_evidence_vault;

ALTER TABLE raw_evidence_vault_new RENAME TO raw_evidence_vault;

-- Re-create the insert-only guards on the renamed table.
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
