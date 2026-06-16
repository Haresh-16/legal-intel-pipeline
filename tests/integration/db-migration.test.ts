import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Vite's static import analysis doesn't yet recognize "node:sqlite" as a builtin
// (it's a newer experimental Node module), so it gets loaded via createRequire
// instead of a static `import`, which bypasses that resolution entirely.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationSql = readFileSync(
  join(__dirname, "../../worker/src/db/migrations/0001_init.sql"),
  "utf-8",
);

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(migrationSql);
  return db;
}

describe("0001_init.sql applied to a fresh SQLite database", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = freshDb();
  });

  it("creates all 8 tables", () => {
    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual([
      "approval_ledger",
      "claims_ledger",
      "intelligence_cards",
      "news_intake_inbox",
      "output_queue",
      "published_asset_index",
      "raw_evidence_vault",
      "source_registry",
    ]);
  });

  it("output_queue.status defaults to 'HOLD — pending approval' when not specified", () => {
    db.exec(
      `INSERT INTO intelligence_cards (card_id,title,date_created,status,primary_source_ids)
       VALUES ('CARD-1','t','2026-06-15','Draft ready','["SRC-1"]')`,
    );
    db.exec(
      `INSERT INTO output_queue (output_id,card_id,output_type,content,created_at)
       VALUES ('OUT-1','CARD-1','public_draft','{}','2026-06-15')`,
    );
    const row = db
      .prepare("SELECT status FROM output_queue WHERE output_id='OUT-1'")
      .get() as { status: string };
    expect(row.status).toBe("HOLD — pending approval");
  });

  it("rejects an output_queue status outside the controlled set", () => {
    db.exec(
      `INSERT INTO intelligence_cards (card_id,title,date_created,status,primary_source_ids)
       VALUES ('CARD-1','t','2026-06-15','Draft ready','["SRC-1"]')`,
    );
    expect(() =>
      db.exec(
        `INSERT INTO output_queue (output_id,card_id,output_type,status,content,created_at)
         VALUES ('OUT-1','CARD-1','public_draft','published','{}','2026-06-15')`,
      ),
    ).toThrow(/CHECK constraint failed/);
  });

  it("rejects an output_type outside public_draft/internal_brief", () => {
    db.exec(
      `INSERT INTO intelligence_cards (card_id,title,date_created,status,primary_source_ids)
       VALUES ('CARD-1','t','2026-06-15','Draft ready','["SRC-1"]')`,
    );
    expect(() =>
      db.exec(
        `INSERT INTO output_queue (output_id,card_id,output_type,content,created_at)
         VALUES ('OUT-1','CARD-1','published','{}','2026-06-15')`,
      ),
    ).toThrow(/CHECK constraint failed/);
  });

  it("raw_evidence_vault: insert succeeds, UPDATE is rejected by trigger", () => {
    db.exec(
      `INSERT INTO source_registry (source_id,title,date_captured,source_type,primary_secondary)
       VALUES ('SRC-1','t','2026-06-15','news','primary')`,
    );
    db.exec(
      `INSERT INTO raw_evidence_vault (evidence_id,source_id,raw_text,captured_at)
       VALUES ('EV-1','SRC-1','original text','2026-06-15')`,
    );
    expect(() =>
      db.exec(`UPDATE raw_evidence_vault SET raw_text='tampered' WHERE evidence_id='EV-1'`),
    ).toThrow(/insert-only/);
  });

  it("raw_evidence_vault: DELETE is rejected by trigger", () => {
    db.exec(
      `INSERT INTO source_registry (source_id,title,date_captured,source_type,primary_secondary)
       VALUES ('SRC-1','t','2026-06-15','news','primary')`,
    );
    db.exec(
      `INSERT INTO raw_evidence_vault (evidence_id,source_id,raw_text,captured_at)
       VALUES ('EV-1','SRC-1','original text','2026-06-15')`,
    );
    expect(() => db.exec(`DELETE FROM raw_evidence_vault WHERE evidence_id='EV-1'`)).toThrow(
      /insert-only/,
    );
  });

  it("news_intake_inbox.status defaults to 'fetched' and enforces unique url", () => {
    db.exec(
      `INSERT INTO news_intake_inbox (candidate_id,title,url,fetched_at)
       VALUES ('CAND-1','t','https://example.com/a','2026-06-15')`,
    );
    const row = db
      .prepare("SELECT status FROM news_intake_inbox WHERE candidate_id='CAND-1'")
      .get() as { status: string };
    expect(row.status).toBe("fetched");

    expect(() =>
      db.exec(
        `INSERT INTO news_intake_inbox (candidate_id,title,url,fetched_at)
         VALUES ('CAND-2','dup','https://example.com/a','2026-06-15')`,
      ),
    ).toThrow(/UNIQUE constraint failed/);
  });
});
