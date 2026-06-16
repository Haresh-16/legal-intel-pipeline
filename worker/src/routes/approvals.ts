import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { ulid } from "ulid";
import * as schema from "../db/schema";
import { ApprovalRole, ApprovalAction, type OutputStatus } from "../db/enums";
import { applyApprovalAction, InvalidStatusTransitionError } from "../guardrails/statusMachine";
import { appendRow } from "../sheets/client";
import { approvalLedgerToRow, SHEET_TABS } from "../sheets/mappers";
import type { Env } from "../env";

const ApprovalRequest = z.object({
  actor_role: ApprovalRole,
  action: ApprovalAction,
  notes: z.string().optional(),
});

export const approvalsRoute = new Hono<{ Bindings: Env }>();

approvalsRoute.get("/", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const approvals = await db.select().from(schema.approvalLedger).all();
  return c.json({ approvals });
});

// The only route in this codebase that can move an output out of "HOLD —
// pending approval" (CLAUDE.md invariant 2: exactly one human approval gate).
// There is deliberately no /publish route — "approved" is a terminal status,
// not a trigger for anything downstream.
approvalsRoute.post("/:output_id", async (c) => {
  const outputId = c.req.param("output_id");
  const body = await c.req.json().catch(() => null);
  const parsed = ApprovalRequest.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400);

  const db = drizzle(c.env.DB, { schema });
  const output = await db.select().from(schema.outputQueue).where(eq(schema.outputQueue.outputId, outputId)).get();
  if (!output) return c.json({ error: "output_not_found" }, 404);

  let nextStatus: OutputStatus;
  try {
    nextStatus = applyApprovalAction(output.status as OutputStatus, parsed.data.action);
  } catch (err) {
    if (err instanceof InvalidStatusTransitionError) {
      return c.json({ error: "invalid_output_status", message: err.message }, 409);
    }
    throw err;
  }

  const now = new Date().toISOString();
  const approvalId = `apr_${ulid()}`;
  const approvalRow: typeof schema.approvalLedger.$inferInsert = {
    approvalId,
    outputId,
    action: parsed.data.action,
    actorRole: parsed.data.actor_role,
    timestamp: now,
    notes: parsed.data.notes ?? null,
  };

  const assetId = parsed.data.action === "approve" ? `ast_${ulid()}` : null;
  const assetRow: typeof schema.publishedAssetIndex.$inferInsert | null = assetId
    ? { assetId, outputId, approvalId, createdAt: now }
    : null;

  const statements: unknown[] = [
    db.update(schema.outputQueue).set({ status: nextStatus }).where(eq(schema.outputQueue.outputId, outputId)),
    db.insert(schema.approvalLedger).values(approvalRow),
  ];
  if (assetRow) statements.push(db.insert(schema.publishedAssetIndex).values(assetRow));
  await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);

  try {
    await appendRow(
      c.env,
      SHEET_TABS.approvalLedger,
      approvalLedgerToRow(approvalRow as typeof schema.approvalLedger.$inferSelect),
    );
  } catch (err) {
    // Same compensating-action saga as the intake pipeline (CLAUDE.md
    // invariant 9): D1 and Sheets approval records must both succeed or
    // neither persists, so a Sheets failure reverts the status change too.
    // published_asset_index.approval_id references approval_ledger, so the
    // asset row must be deleted before the ledger row it points to.
    const rollbackStatements: unknown[] = [];
    if (assetId) {
      rollbackStatements.push(db.delete(schema.publishedAssetIndex).where(eq(schema.publishedAssetIndex.assetId, assetId)));
    }
    rollbackStatements.push(
      db.delete(schema.approvalLedger).where(eq(schema.approvalLedger.approvalId, approvalId)),
      db.update(schema.outputQueue).set({ status: output.status }).where(eq(schema.outputQueue.outputId, outputId)),
    );
    await db.batch(rollbackStatements as unknown as Parameters<typeof db.batch>[0]);
    return c.json({ error: "sheets_sync_failed", rolled_back: true }, 502);
  }

  return c.json({ approvalId, outputId, status: nextStatus, assetId }, 201);
});
