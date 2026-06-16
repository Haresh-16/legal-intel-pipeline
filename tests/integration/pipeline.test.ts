import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runPipeline, PipelineSheetsSyncError } from "../../worker/src/pipeline/runPipeline";
import { resetSheetsTokenCache } from "../../worker/src/sheets/auth";
import { DoNotSayViolationError } from "../../worker/src/guardrails/doNotSay";
import type { PipelineRepo, InsertAllInput, RollbackInput } from "../../worker/src/pipeline/repo";

async function generateTestPrivateKeyEnvValue(): Promise<string> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const base64 = Buffer.from(pkcs8).toString("base64");
  const pemLines = base64.match(/.{1,64}/g)!.join("\n");
  const pem = `-----BEGIN PRIVATE KEY-----\n${pemLines}\n-----END PRIVATE KEY-----\n`;
  // Mimic how Wrangler secrets actually arrive: literal "\n" escapes, not real newlines.
  return pem.replace(/\n/g, "\\n");
}

let ENV: {
  GROQ_API_KEY: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_SHEETS_SPREADSHEET_ID: string;
};

function groqJson(content: unknown) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const NORMALIZED = {
  title: "Court issues narrow ruling on filing deadline",
  source_type: "court",
  primary_secondary: "primary",
  proof_grade: "A",
  key_extract: "The court held the deadline applies only to the named parties.",
  suggested_vertical: "Litigation",
};

const CARD = {
  title: "Narrow ruling on filing deadline",
  vertical: "Litigation",
  proof_grade: "A",
  risk_level: "Low",
  public_use_status: "Website-safe after approval",
  approval_owner: "Intelligence Desk",
  narrative_gap_summary: "Coverage implies a broad rule; the order is narrow and party-specific.",
  monetization_path: "Litigation tracking newsletter",
};

const CLAIMS_RESPONSE = {
  claims: [
    {
      exact_claim: "The court held the deadline applies only to the named parties.",
      approved_public_version: "A court ruled the deadline applies only to the parties named in the order.",
      scope_limitation: "Limited to the named parties in this filing.",
      risk_notes: "Do not generalize beyond the named parties.",
      do_not_say: [],
      proof_grade: "A",
      supporting_source_spans: ["The court held the deadline applies only to the named parties."],
    },
  ],
};

const PUBLIC_DRAFT = {
  headline: "Court narrows filing deadline to named parties",
  body_paragraphs: ["A court ruled the deadline applies only to the parties named in the order."],
  claim_references: ["__CLAIM_ID__"],
};

const INTERNAL_BRIEF = {
  practice_area_signal: "Litigation deadline disputes",
  targeting_opportunity: "Outreach to parties facing similar deadline disputes",
  action_recommendation: "Flag to litigation practice lead for follow-up",
  risk_summary: "Low risk; ruling is narrow and verified against primary source.",
};

function buildFetchMock(overrides?: { claims?: unknown; publicDraft?: unknown; failSheetsOnCall?: number }) {
  let groqCallIndex = 0;
  let sheetsCallIndex = 0;
  const sheetsCalls: string[] = [];

  const claims = overrides?.claims ?? CLAIMS_RESPONSE;
  const publicDraft = overrides?.publicDraft ?? PUBLIC_DRAFT;

  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = url.toString();

    if (u.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "fake-access-token", expires_in: 3600 }), { status: 200 });
    }

    if (u.includes("sheets.googleapis.com")) {
      sheetsCallIndex++;
      const tabMatch = decodeURIComponent(u).match(/values\/([^!]+)!/);
      sheetsCalls.push(tabMatch ? tabMatch[1] : "unknown");
      if (overrides?.failSheetsOnCall === sheetsCallIndex) {
        return new Response("sheets unavailable", { status: 500 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }

    if (u.includes("api.groq.com")) {
      groqCallIndex++;
      const sequence = [NORMALIZED, CARD, claims, publicDraft, INTERNAL_BRIEF];
      const content = sequence[groqCallIndex - 1];
      return groqJson(content);
    }

    throw new Error(`unexpected fetch in test: ${u}`);
  });

  return { fetchMock, sheetsCalls };
}

function buildFakeRepo() {
  const inserted: InsertAllInput[] = [];
  const rolledBack: RollbackInput[] = [];
  const repo: PipelineRepo = {
    async insertAll(input) {
      inserted.push(input);
    },
    async rollback(input) {
      rolledBack.push(input);
    },
  };
  return { repo, inserted, rolledBack };
}

describe("pipeline/runPipeline.ts", () => {
  beforeEach(async () => {
    resetSheetsTokenCache();
    ENV = {
      GROQ_API_KEY: "test-groq-key",
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "svc@example.iam.gserviceaccount.com",
      GOOGLE_PRIVATE_KEY: await generateTestPrivateKeyEnvValue(),
      GOOGLE_SHEETS_SPREADSHEET_ID: "sheet-123",
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs the full pipeline and dual-writes to D1 and every mirrored Sheets tab", async () => {
    const { fetchMock, sheetsCalls } = buildFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const { repo, inserted } = buildFakeRepo();

    const result = await runPipeline({ rawText: "Sample raw source text." }, { repo, env: ENV });

    expect(result.sourceId).toMatch(/^src_/);
    expect(result.cardId).toMatch(/^card_/);
    expect(result.claimIds).toHaveLength(1);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].source.sourceId).toBe(result.sourceId);
    expect(inserted[0].claims).toHaveLength(1);
    expect(inserted[0].outputs).toHaveLength(2);

    expect(sheetsCalls).toEqual([
      "Source Registry",
      "Intelligence Cards",
      "Claims Ledger",
      "Output Queue",
      "Output Queue",
    ]);
  });

  it("rolls back D1 writes and throws PipelineSheetsSyncError when a Sheets append fails", async () => {
    const { fetchMock } = buildFetchMock({ failSheetsOnCall: 3 }); // Claims Ledger append fails
    vi.stubGlobal("fetch", fetchMock);
    const { repo, inserted, rolledBack } = buildFakeRepo();

    await expect(runPipeline({ rawText: "Sample raw source text." }, { repo, env: ENV })).rejects.toBeInstanceOf(
      PipelineSheetsSyncError,
    );

    expect(inserted).toHaveLength(1);
    expect(rolledBack).toHaveLength(1);
    expect(rolledBack[0].sourceId).toBe(inserted[0].source.sourceId);
    expect(rolledBack[0].cardId).toBe(inserted[0].card.cardId);
    expect(rolledBack[0].claimIds).toHaveLength(1);
    expect(rolledBack[0].outputIds).toHaveLength(2);
  });

  it("caps proof grade to C and appends the partial-evidence note when partialEvidence is true", async () => {
    const { fetchMock } = buildFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    const { repo, inserted } = buildFakeRepo();

    await runPipeline({ rawText: "Headline only.", partialEvidence: true }, { repo, env: ENV });

    expect(inserted[0].source.proofGrade).toBe("C");
    expect(inserted[0].card.proofGrade).toBe("C");
    expect(inserted[0].claims[0].proofGrade).toBe("C");
    expect(inserted[0].claims[0].scopeLimitation).toContain("full text not yet verified");
  });

  it("blocks persistence and never calls insertAll when a claim contains a do-not-say phrase", async () => {
    const dirtyClaims = {
      claims: [
        {
          ...CLAIMS_RESPONSE.claims[0],
          approved_public_version: "This is a guaranteed outcome for the named parties.",
        },
      ],
    };
    const { fetchMock } = buildFetchMock({ claims: dirtyClaims });
    vi.stubGlobal("fetch", fetchMock);
    const { repo, inserted } = buildFakeRepo();

    await expect(runPipeline({ rawText: "Sample raw source text." }, { repo, env: ENV })).rejects.toBeInstanceOf(
      DoNotSayViolationError,
    );
    expect(inserted).toHaveLength(0);
  });
});
