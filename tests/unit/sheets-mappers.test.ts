import { describe, it, expect } from "vitest";
import {
  sourceRegistryToRow,
  intelligenceCardToRow,
  claimsLedgerToRow,
  outputQueueToRow,
  approvalLedgerToRow,
  newsIntakeInboxToRow,
} from "../../worker/src/sheets/mappers";

describe("sheets/mappers.ts — D1 row to Sheet row", () => {
  it("sourceRegistryToRow preserves design-doc column order (17 columns)", () => {
    const row = sourceRegistryToRow({
      sourceId: "SRC-1",
      title: "T",
      publisher: "P",
      author: "A",
      datePublished: "2026-01-01",
      dateCaptured: "2026-06-15",
      url: "https://x",
      sourceType: "news",
      primarySecondary: "primary",
      publicStatus: "Public",
      proofGrade: "B",
      pagesFiguresLines: null,
      keyExtract: "extract",
      relatedClaims: '["CLM-1","CLM-2"]',
      relatedCards: null,
      approvalStatus: "Hold",
      notes: null,
    });
    expect(row).toHaveLength(17);
    expect(row[0]).toBe("SRC-1");
    expect(row[13]).toBe("CLM-1; CLM-2"); // related_claims JSON joined for readability
    expect(row[14]).toBe(""); // null related_cards -> empty cell, not "null"
  });

  it("intelligenceCardToRow joins JSON array fields and preserves column order (17 columns)", () => {
    const row = intelligenceCardToRow({
      cardId: "CARD-1",
      title: "T",
      vertical: "V",
      dateCreated: "2026-06-15",
      status: "Draft ready",
      primarySourceIds: '["SRC-1"]',
      relatedClaimIds: '["CLM-1"]',
      proofGrade: "B",
      riskLevel: "Medium",
      publicUseStatus: "Hold pending verification",
      writerStatus: null,
      builderStatus: null,
      approvalOwner: "Legal",
      monetizationPath: "content",
      outputPriority: null,
      tags: '["tag1","tag2"]',
      narrativeGapSummary: "gap",
    });
    expect(row).toHaveLength(17);
    expect(row[5]).toBe("SRC-1");
    expect(row[15]).toBe("tag1; tag2");
  });

  it("claimsLedgerToRow rejects nothing — pure mapping, source_ids joined readably", () => {
    const row = claimsLedgerToRow({
      claimId: "CLM-1",
      cardId: "CARD-1",
      exactClaim: "exact",
      shortClaim: null,
      approvedPublicVersion: "approved",
      sourceIds: '["SRC-1"]',
      proofGrade: "B",
      scopeLimitation: "scope",
      riskNotes: null,
      doNotSay: '["guaranteed outcome"]',
      approvedBy: null,
      approvalDate: null,
      whereUsed: null,
      status: "Hold",
    });
    expect(row).toHaveLength(14);
    expect(row[5]).toBe("SRC-1");
    expect(row[9]).toBe("guaranteed outcome");
  });

  it("outputQueueToRow always reflects the actual stored status (never silently rewrites it)", () => {
    const row = outputQueueToRow({
      outputId: "OUT-1",
      cardId: "CARD-1",
      outputType: "public_draft",
      status: "HOLD — pending approval",
      content: "{}",
      monetizationPathTag: null,
      createdAt: "2026-06-15",
    });
    expect(row[3]).toBe("HOLD — pending approval");
  });

  it("approvalLedgerToRow has 6 columns matching approval_ledger schema", () => {
    const row = approvalLedgerToRow({
      approvalId: "APR-1",
      outputId: "OUT-1",
      action: "approve",
      actorRole: "Legal",
      timestamp: "2026-06-15T00:00:00Z",
      notes: null,
    });
    expect(row).toEqual(["APR-1", "OUT-1", "approve", "Legal", "2026-06-15T00:00:00Z", ""]);
  });

  it("newsIntakeInboxToRow never includes raw_payload (too large for a cell)", () => {
    const row = newsIntakeInboxToRow({
      candidateId: "CAND-1",
      title: "T",
      url: "https://x",
      publisher: "P",
      publishedAt: "2026-06-14",
      snippet: "snip",
      rawPayload: '{"huge":"object"}',
      fetchedAt: "2026-06-15",
      status: "fetched",
      sourceId: null,
    });
    expect(row).not.toContain('{"huge":"object"}');
    expect(row).toHaveLength(9);
  });
});
