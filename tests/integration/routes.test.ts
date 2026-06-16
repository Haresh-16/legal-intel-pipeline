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

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function buildFetchMock(opts?: { sheetsAppendFails?: boolean }) {
  return vi.fn(async (url: string | URL) => {
    const u = url.toString();
    if (u.includes("oauth2.googleapis.com/token")) return jsonRes({ access_token: "fake-token", expires_in: 3600 });
    if (u.includes("sheets.googleapis.com")) {
      if (opts?.sheetsAppendFails) return new Response("server error", { status: 500 });
      return jsonRes({});
    }
    throw new Error(`unexpected fetch in test: ${u}`);
  });
}

type TestEnv = {
  DB: D1Database;
  GROQ_API_KEY: string;
  THE_NEWS_API_TOKEN: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_SHEETS_SPREADSHEET_ID: string;
};

async function exec(db: D1Database, sql: string, params: unknown[] = []) {
  await db.prepare(sql).bind(...params).run();
}

describe("routes/sources.ts, cards.ts, outputs.ts, approvals.ts", () => {
  let env: TestEnv;

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

    await exec(
      env.DB,
      `INSERT INTO source_registry (source_id, title, publisher, author, date_published, date_captured, url, source_type, primary_secondary, public_status, proof_grade, pages_figures_lines, key_extract, related_claims, related_cards, approval_status, notes)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, NULL, NULL)`,
      [
        "src_1",
        "Test Source",
        "Example Wire",
        "2026-06-01",
        "2026-06-02T00:00:00.000Z",
        "https://example.com/a",
        "news",
        "secondary",
        "B",
        "Key extract text.",
        JSON.stringify(["clm_1"]),
        JSON.stringify(["card_1"]),
      ],
    );

    await exec(
      env.DB,
      `INSERT INTO intelligence_cards (card_id, title, vertical, date_created, status, primary_source_ids, related_claim_ids, proof_grade, risk_level, public_use_status, writer_status, builder_status, approval_owner, monetization_path, output_priority, tags, narrative_gap_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, ?, ?)`,
      [
        "card_1",
        "Test Card",
        "Litigation",
        "2026-06-02T00:00:00.000Z",
        "Card drafted",
        JSON.stringify(["src_1"]),
        JSON.stringify(["clm_1"]),
        "B",
        "Low",
        "Hold pending verification",
        "Intelligence Desk",
        "Newsletter",
        JSON.stringify(["Litigation"]),
        "Gap summary.",
      ],
    );

    await exec(
      env.DB,
      `INSERT INTO claims_ledger (claim_id, card_id, exact_claim, short_claim, approved_public_version, source_ids, proof_grade, scope_limitation, risk_notes, do_not_say, approved_by, approval_date, where_used, status)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`,
      [
        "clm_1",
        "card_1",
        "Exact claim text.",
        "Approved public version.",
        JSON.stringify(["src_1"]),
        "B",
        "Scope limitation text.",
        "Risk notes.",
        JSON.stringify([]),
        "Draft ready",
      ],
    );

    await exec(
      env.DB,
      `INSERT INTO output_queue (output_id, card_id, output_type, status, content, monetization_path_tag, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        "out_public_1",
        "card_1",
        "public_draft",
        "HOLD — pending approval",
        JSON.stringify({ headline: "Headline", body_paragraphs: ["Body."], claim_references: ["clm_1"] }),
        "Newsletter",
        "2026-06-02T00:00:00.000Z",
      ],
    );

    await exec(
      env.DB,
      `INSERT INTO output_queue (output_id, card_id, output_type, status, content, monetization_path_tag, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`,
      [
        "out_internal_1",
        "card_1",
        "internal_brief",
        "HOLD — pending approval",
        JSON.stringify({ practice_area_signal: "Signal" }),
        "2026-06-02T00:00:00.000Z",
      ],
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("GET /api/sources/:id", () => {
    it("returns the source row", async () => {
      const res = await app.request("/api/sources/src_1", {}, env);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.source.title).toBe("Test Source");
    });

    it("returns 404 for an unknown source", async () => {
      const res = await app.request("/api/sources/does-not-exist", {}, env);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/cards/:id", () => {
    it("returns the card with its claims and source ids", async () => {
      const res = await app.request("/api/cards/card_1", {}, env);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.card.title).toBe("Test Card");
      expect(body.claims).toHaveLength(1);
      expect(body.claims[0].claimId).toBe("clm_1");
      expect(body.sourceIds).toEqual(["src_1"]);
    });

    it("returns 404 for an unknown card", async () => {
      const res = await app.request("/api/cards/does-not-exist", {}, env);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/queue", () => {
    it("splits public drafts and internal briefs into separate arrays", async () => {
      const res = await app.request("/api/queue", {}, env);
      const body = await res.json();
      expect(body.public_drafts).toHaveLength(1);
      expect(body.internal_briefs).toHaveLength(1);
      expect(body.public_drafts[0].outputId).toBe("out_public_1");
      expect(body.internal_briefs[0].outputId).toBe("out_internal_1");
    });
  });

  describe("GET /api/queue/:id", () => {
    it("returns a single output row", async () => {
      const res = await app.request("/api/queue/out_public_1", {}, env);
      const body = await res.json();
      expect(body.output.outputId).toBe("out_public_1");
    });

    it("returns 404 for an unknown output", async () => {
      const res = await app.request("/api/queue/does-not-exist", {}, env);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/approvals/:output_id", () => {
    it("approves a HOLD output, writes the ledger + published asset, and dual-writes to Sheets", async () => {
      vi.stubGlobal("fetch", buildFetchMock());

      const res = await app.request(
        "/api/approvals/out_public_1",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ actor_role: "Principal", action: "approve" }),
        },
        env,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe("approved");
      expect(body.assetId).toMatch(/^ast_/);

      const queueRes = await app.request("/api/queue/out_public_1", {}, env);
      const queueBody = await queueRes.json();
      expect(queueBody.output.status).toBe("approved");

      const approvalsRes = await app.request("/api/approvals", {}, env);
      const approvalsBody = await approvalsRes.json();
      expect(approvalsBody.approvals).toHaveLength(1);
    });

    it("archives a HOLD output without creating a published asset id", async () => {
      vi.stubGlobal("fetch", buildFetchMock());

      const res = await app.request(
        "/api/approvals/out_internal_1",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ actor_role: "Ops", action: "archive" }),
        },
        env,
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe("archived");
      expect(body.assetId).toBeNull();
    });

    it("rejects approving an already-terminal output with 409", async () => {
      vi.stubGlobal("fetch", buildFetchMock());

      await app.request(
        "/api/approvals/out_public_1",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actor_role: "Principal", action: "approve" }) },
        env,
      );
      const second = await app.request(
        "/api/approvals/out_public_1",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actor_role: "Principal", action: "approve" }) },
        env,
      );
      expect(second.status).toBe(409);
    });

    it("returns 404 for an unknown output", async () => {
      vi.stubGlobal("fetch", buildFetchMock());
      const res = await app.request(
        "/api/approvals/does-not-exist",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actor_role: "Principal", action: "approve" }) },
        env,
      );
      expect(res.status).toBe(404);
    });

    it("rolls back the status change and ledger row when the Sheets append fails", async () => {
      vi.stubGlobal("fetch", buildFetchMock({ sheetsAppendFails: true }));

      const res = await app.request(
        "/api/approvals/out_public_1",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actor_role: "Principal", action: "approve" }) },
        env,
      );
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toBe("sheets_sync_failed");

      const queueRes = await app.request("/api/queue/out_public_1", {}, env);
      const queueBody = await queueRes.json();
      expect(queueBody.output.status).toBe("HOLD — pending approval");

      const approvalsRes = await app.request("/api/approvals", {}, env);
      const approvalsBody = await approvalsRes.json();
      expect(approvalsBody.approvals).toHaveLength(0);
    });
  });

  describe("GET /api/approvals", () => {
    it("lists approval ledger entries", async () => {
      vi.stubGlobal("fetch", buildFetchMock());
      await app.request(
        "/api/approvals/out_public_1",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actor_role: "Principal", action: "approve" }) },
        env,
      );

      const res = await app.request("/api/approvals", {}, env);
      const body = await res.json();
      expect(body.approvals).toHaveLength(1);
      expect(body.approvals[0].outputId).toBe("out_public_1");
    });
  });
});
