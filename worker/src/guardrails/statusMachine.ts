import type { OutputStatus, InboxStatus, ApprovalAction } from "../db/enums";

export class InvalidStatusTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid status transition: "${from}" -> "${to}"`);
    this.name = "InvalidStatusTransitionError";
  }
}

// HOLD — pending approval is the only non-terminal state. There is no
// transition to "published" anywhere in this map — no /publish route exists
// (CLAUDE.md invariants 1-3).
const OUTPUT_TRANSITIONS: Record<OutputStatus, readonly OutputStatus[]> = {
  "HOLD — pending approval": ["approved", "archived"],
  approved: [],
  archived: [],
};

export function canTransitionOutputStatus(from: OutputStatus, to: OutputStatus): boolean {
  return OUTPUT_TRANSITIONS[from].includes(to);
}

export function assertOutputStatusTransition(from: OutputStatus, to: OutputStatus): void {
  if (!canTransitionOutputStatus(from, to)) throw new InvalidStatusTransitionError(from, to);
}

export function applyApprovalAction(currentStatus: OutputStatus, action: ApprovalAction): OutputStatus {
  const next: OutputStatus = action === "approve" ? "approved" : "archived";
  assertOutputStatusTransition(currentStatus, next);
  return next;
}

// fetched -> selected -> ingested, or fetched -> rejected. Selection alone
// never reaches "ingested" — only the explicit ingest route does that
// (CLAUDE.md invariant 10).
const INBOX_TRANSITIONS: Record<InboxStatus, readonly InboxStatus[]> = {
  fetched: ["selected", "rejected"],
  selected: ["ingested"],
  ingested: [],
  rejected: [],
};

export function canTransitionInboxStatus(from: InboxStatus, to: InboxStatus): boolean {
  return INBOX_TRANSITIONS[from].includes(to);
}

export function assertInboxStatusTransition(from: InboxStatus, to: InboxStatus): void {
  if (!canTransitionInboxStatus(from, to)) throw new InvalidStatusTransitionError(from, to);
}
