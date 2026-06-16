import { describe, it, expect } from "vitest";
import * as schema from "../../worker/src/db/schema";
import {
  ProofGrade,
  RiskLevel,
  PublicUseStatus,
  RecordStatus,
  OutputStatus,
  InboxStatus,
  ApprovalRole,
} from "../../worker/src/db/enums";

describe("db/schema.ts", () => {
  it("exports all 8 tables", () => {
    expect(schema.sourceRegistry).toBeDefined();
    expect(schema.rawEvidenceVault).toBeDefined();
    expect(schema.intelligenceCards).toBeDefined();
    expect(schema.claimsLedger).toBeDefined();
    expect(schema.outputQueue).toBeDefined();
    expect(schema.approvalLedger).toBeDefined();
    expect(schema.publishedAssetIndex).toBeDefined();
    expect(schema.newsIntakeInbox).toBeDefined();
  });

  it("output_queue.status column defaults to HOLD — pending approval", () => {
    // drizzle stores the default on the column config
    const col = schema.outputQueue.status as unknown as { default: unknown };
    expect(col.default).toBe("HOLD — pending approval");
  });
});

describe("db/enums.ts — Zod enums match controlled values from CLAUDE.md", () => {
  it("ProofGrade", () => {
    expect(ProofGrade.options).toEqual(["A", "B", "C"]);
  });

  it("RiskLevel", () => {
    expect(RiskLevel.options).toEqual(["Low", "Medium", "High"]);
  });

  it("PublicUseStatus", () => {
    expect(PublicUseStatus.options).toEqual([
      "Public",
      "Website-safe after approval",
      "Hold pending verification",
      "Internal-only",
    ]);
  });

  it("RecordStatus", () => {
    expect(RecordStatus.options).toEqual([
      "Research lead",
      "Card drafted",
      "Draft ready",
      "Hold",
      "Approved",
      "Published",
      "Archived",
    ]);
  });

  it("OutputStatus — never includes 'published', only approved/archived/HOLD", () => {
    expect(OutputStatus.options).toEqual(["HOLD — pending approval", "approved", "archived"]);
    expect(OutputStatus.options).not.toContain("published");
  });

  it("InboxStatus", () => {
    expect(InboxStatus.options).toEqual(["fetched", "selected", "ingested", "rejected"]);
  });

  it("ApprovalRole — role names only, no personal names", () => {
    expect(ApprovalRole.options).toEqual([
      "Intelligence Desk",
      "Writer",
      "Builder",
      "Ops",
      "Legal",
      "Principal",
    ]);
  });
});
