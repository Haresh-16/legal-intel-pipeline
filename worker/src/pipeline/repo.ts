import { eq, inArray } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";

export interface InsertAllInput {
  source: typeof schema.sourceRegistry.$inferInsert;
  evidence: typeof schema.rawEvidenceVault.$inferInsert;
  card: typeof schema.intelligenceCards.$inferInsert;
  claims: Array<typeof schema.claimsLedger.$inferInsert>;
  outputs: Array<typeof schema.outputQueue.$inferInsert>;
}

export interface RollbackInput {
  sourceId: string;
  cardId: string;
  claimIds: string[];
  outputIds: string[];
}

export interface PipelineRepo {
  insertAll(input: InsertAllInput): Promise<void>;
  rollback(input: RollbackInput): Promise<void>;
}

export function buildD1PipelineRepo(db: DrizzleD1Database<typeof schema>): PipelineRepo {
  return {
    async insertAll(input) {
      const statements: unknown[] = [
        db.insert(schema.sourceRegistry).values(input.source),
        db.insert(schema.rawEvidenceVault).values(input.evidence),
        db.insert(schema.intelligenceCards).values(input.card),
      ];
      if (input.claims.length > 0) statements.push(db.insert(schema.claimsLedger).values(input.claims));
      if (input.outputs.length > 0) statements.push(db.insert(schema.outputQueue).values(input.outputs));
      // A single D1 batch() is atomic — this is the one half of the dual-write
      // that can use a real transaction; Sheets cannot share it (separate API).
      await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
    },
    async rollback(input) {
      // raw_evidence_vault is deliberately never touched here: it is
      // insert-only (a DB trigger rejects DELETE), and captured evidence must
      // survive even a pipeline run that fails downstream.
      if (input.outputIds.length > 0) {
        await db.delete(schema.outputQueue).where(inArray(schema.outputQueue.outputId, input.outputIds));
      }
      if (input.claimIds.length > 0) {
        await db.delete(schema.claimsLedger).where(inArray(schema.claimsLedger.claimId, input.claimIds));
      }
      await db.delete(schema.intelligenceCards).where(eq(schema.intelligenceCards.cardId, input.cardId));
      await db.delete(schema.sourceRegistry).where(eq(schema.sourceRegistry.sourceId, input.sourceId));
    },
  };
}
