import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import app from "../../worker/src/index";
import { resetSheetsTokenCache } from "../../worker/src/sheets/auth";
import { createTestD1Database } from "../helpers/d1Shim";

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
  return pem.replace(/\n/g, "\\n");
}

const NORMALIZED = {
  title: "Court issues narrow ruling on filing deadline",
  source_type: "news",
  primary_secondary: "secondary",
  proof_grade: "B",
  key_extract: "The court held the deadline applies only to the named parties.",
  suggested_vertical: "Litigation",
};
const CARD = {
  title: "Narrow ruling on filing deadline",
  vertical: "Litigation",
  proof_grade: "B",
  risk_level: "Low",
  public_use_status: "Hold pending verification",
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
      proof_grade: "B",
      supporting_source_spans: ["The court held the deadline applies only to the named parties."],
    },
  ],
};
const PUBLIC_DRAFT = {
  headline: "Court narrows filing deadline to named parties",
  body_paragraphs: ["A court ruled the deadline applies only to the parties named in the order."],
  claim_references: ["claim-1"],
};
const INTERNAL_BRIEF = {
  practice_area_signal: "Litigation deadline disputes",
  targeting_opportunity: "Outreach to parties facing similar deadline disputes",
  action_recommendation: "Flag to litigation practice lead for follow-up",
  risk_summary: "Low risk; based on partial evidence, not yet fully verified.",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function groqJson(content: unknown) {
  return jsonRes({ choices: [{ message: { content: JSON.stringify(content) } }] });
}

function buildFetchMock(opts?: { newsApiFails?: boolean; newsArticles?: unknown[] }) {
  let groqCallIndex = 0;
  const defaultArticles = [
    {
      uuid: "uuid-1",
      title: "Court issues narrow ruling on filing deadline",
      snippet: "A short snippet about the ruling.",
      url: "https://news.example.com/article-1",
      published_at: "2026-06-10T00:00:00.000000Z",
      source: "news.example.com",
    },
  ];

  return vi.fn(async (url: string | URL) => {
    const u = url.toString();

    if (u.includes("api.thenewsapi.com")) {
      if (opts?.newsApiFails) return new Response("rate limited", { status: 429 });
      return jsonRes({ data: opts?.newsArticles ?? defaultArticles });
    }
    if (u.includes("oauth2.googleapis.com/token")) {
      return jsonRes({ access_token: "fake-token", expires_in: 3600 });
    }
    if (u.includes("sheets.googleapis.com")) {
      return jsonRes({});
    }
    if (u.includes("api.groq.com")) {
      groqCallIndex++;
      const sequence = [NORMALIZED, CARD, CLAIMS_RESPONSE, PUBLIC_DRAFT, INTERNAL_BRIEF];
      return groqJson(sequence[groqCallIndex - 1]);
    }
    throw new Error(`unexpected fetch in test: ${u}`);
  });
}

describe("routes/news.ts — inbox flow", () => {
  let env: {
    DB: D1Database;
    GROQ_API_KEY: string;
    THE_NEWS_API_TOKEN: string;
    GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
    GOOGLE_PRIVATE_KEY: string;
    GOOGLE_SHEETS_SPREADSHEET_ID: string;
  };

  beforeEach(async () => {
    resetSheetsTokenCache();
    env = {
      DB: createTestD1Database(),
      GROQ_API_KEY: "test-groq-key",
      THE_NEWS_API_TOKEN: "test-news-token",
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "svc@example.iam.gserviceaccount.com",
      GOOGLE_PRIVATE_KEY: await generateTestPrivateKeyEnvValue(),
      GOOGLE_SHEETS_SPREADSHEET_ID: "sheet-123",
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches candidates into the inbox and skips already-known URLs on a repeat fetch", async () => {
    vi.stubGlobal("fetch", buildFetchMock());

    const first = await app.request("/api/news/fetch", { method: "POST" }, env);
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.inserted).toBe(1);

    const second = await app.request("/api/news/fetch", { method: "POST" }, env);
    const secondBody = await second.json();
    expect(secondBody.inserted).toBe(0);

    const inboxRes = await app.request("/api/news/inbox", {}, env);
    const inboxBody = await inboxRes.json();
    expect(inboxBody.candidates).toHaveLength(1);
    expect(inboxBody.candidates[0].status).toBe("fetched");
  });

  it("returns a typed error from /fetch when The News API fails, without touching manual intake", async () => {
    vi.stubGlobal("fetch", buildFetchMock({ newsApiFails: true }));

    const res = await app.request("/api/news/fetch", { method: "POST" }, env);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("news_api_failed");
  });

  it("ingesting a candidate runs the full pipeline and flips inbox status to ingested with a linked source_id", async () => {
    vi.stubGlobal("fetch", buildFetchMock());

    const fetchRes = await app.request("/api/news/fetch", { method: "POST" }, env);
    const { candidateIds } = await fetchRes.json();
    const candidateId = candidateIds[0];

    const ingestRes = await app.request(`/api/news/ingest/${candidateId}`, { method: "POST" }, env);
    expect(ingestRes.status).toBe(201);
    const result = await ingestRes.json();
    expect(result.sourceId).toMatch(/^src_/);

    const inboxRes = await app.request("/api/news/inbox", {}, env);
    const { candidates } = await inboxRes.json();
    const candidate = candidates.find((c: { candidateId: string }) => c.candidateId === candidateId);
    expect(candidate.status).toBe("ingested");
    expect(candidate.sourceId).toBe(result.sourceId);
  });

  it("rejects ingesting the same candidate twice with 409", async () => {
    vi.stubGlobal("fetch", buildFetchMock());

    const fetchRes = await app.request("/api/news/fetch", { method: "POST" }, env);
    const { candidateIds } = await fetchRes.json();
    const candidateId = candidateIds[0];

    await app.request(`/api/news/ingest/${candidateId}`, { method: "POST" }, env);
    const secondIngest = await app.request(`/api/news/ingest/${candidateId}`, { method: "POST" }, env);
    expect(secondIngest.status).toBe(409);
  });

  it("returns 404 when ingesting an unknown candidate id", async () => {
    vi.stubGlobal("fetch", buildFetchMock());
    const res = await app.request("/api/news/ingest/does-not-exist", { method: "POST" }, env);
    expect(res.status).toBe(404);
  });
});
