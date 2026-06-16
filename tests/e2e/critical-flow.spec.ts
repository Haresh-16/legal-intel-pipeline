import { test, expect, type Page } from "@playwright/test";

// All API calls are intercepted at the network layer — no live Groq, Sheets,
// or The News API calls happen in this suite (CLAUDE.md / plan §9: CI runs
// with no live network calls).

function jsonRoute(page: Page, pattern: string | RegExp, body: unknown, status = 200) {
  return page.route(pattern, (route) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }),
  );
}

const CARD = {
  card: {
    cardId: "card_1",
    title: "Narrow ruling on filing deadline",
    vertical: "Litigation",
    status: "Card drafted",
    proofGrade: "B",
    riskLevel: "Low",
    publicUseStatus: "Hold pending verification",
    approvalOwner: "Intelligence Desk",
    monetizationPath: "Newsletter",
    narrativeGapSummary: "Coverage implies a broad rule; the order is narrow.",
  },
  claims: [
    {
      claimId: "clm_1",
      cardId: "card_1",
      exactClaim: "Exact claim.",
      approvedPublicVersion: "Approved public version.",
      proofGrade: "B",
      scopeLimitation: "Limited to named parties.",
      riskNotes: "Do not generalize.",
      doNotSay: "[]",
      status: "Draft ready",
    },
  ],
  sourceIds: ["src_1"],
};

const SOURCE = {
  source: {
    sourceId: "src_1",
    title: "Test Source",
    publisher: "Example Wire",
    author: null,
    datePublished: "2026-06-01",
    dateCaptured: "2026-06-02T00:00:00.000Z",
    url: "https://example.com/a",
    sourceType: "news",
    primarySecondary: "secondary",
    proofGrade: "B",
    keyExtract: "Key extract text.",
  },
};

function queueWithStatus(status: string) {
  return {
    public_drafts: [
      {
        outputId: "out_public_1",
        cardId: "card_1",
        outputType: "public_draft",
        status,
        content: JSON.stringify({
          headline: "Court narrows filing deadline",
          body_paragraphs: ["A court ruled the deadline applies only to named parties."],
          claim_references: ["clm_1"],
        }),
        monetizationPathTag: "Newsletter",
        createdAt: "2026-06-02T00:00:00.000Z",
      },
    ],
    internal_briefs: [
      {
        outputId: "out_internal_1",
        cardId: "card_1",
        outputType: "internal_brief",
        status: "HOLD — pending approval",
        content: JSON.stringify({ practice_area_signal: "Litigation deadline disputes" }),
        monetizationPathTag: null,
        createdAt: "2026-06-02T00:00:00.000Z",
      },
    ],
  };
}

test("manual intake submits and lands on the resulting item detail page", async ({ page }) => {
  await jsonRoute(page, "**/api/intake", {
    sourceId: "src_1",
    cardId: "card_1",
    claimIds: ["clm_1"],
    publicOutputId: "out_public_1",
    internalOutputId: "out_internal_1",
  });
  await jsonRoute(page, "**/api/cards/card_1", CARD);
  await jsonRoute(page, "**/api/sources/src_1", SOURCE);
  await jsonRoute(page, "**/api/queue", queueWithStatus("HOLD — pending approval"));

  await page.goto("/");
  await page.getByPlaceholder("Paste source text here...").fill("A court issued a narrow ruling on filing deadlines.");
  await page.getByRole("button", { name: "Run Intake Pipeline" }).click();

  await expect(page).toHaveURL(/\/item\/card_1$/);
  await expect(page.getByRole("heading", { name: "Narrow ruling on filing deadline" })).toBeVisible();
});

test("news inbox: fetch shows a candidate, and ingest lands on item detail", async ({ page }) => {
  let fetched = false;

  await page.route("**/api/news/inbox", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        candidates: fetched
          ? [
              {
                candidateId: "cnd_1",
                title: "Regulator proposes new disclosure rule",
                url: "https://example.com/regulator",
                publisher: "Reuters Legal",
                publishedAt: "2026-06-13T00:00:00.000Z",
                snippet: "A regulator proposed a new disclosure rule.",
                status: "fetched",
                sourceId: null,
              },
            ]
          : [],
      }),
    });
  });
  await page.route("**/api/news/fetch", (route) => {
    fetched = true;
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ fetched: 1, inserted: 1, candidateIds: ["cnd_1"] }) });
  });
  await jsonRoute(page, "**/api/news/ingest/cnd_1", {
    sourceId: "src_1",
    cardId: "card_1",
    claimIds: ["clm_1"],
    publicOutputId: "out_public_1",
    internalOutputId: "out_internal_1",
  });
  await jsonRoute(page, "**/api/cards/card_1", CARD);
  await jsonRoute(page, "**/api/sources/src_1", SOURCE);
  await jsonRoute(page, "**/api/queue", queueWithStatus("HOLD — pending approval"));

  await page.goto("/news");
  await expect(page.getByText("No candidates yet")).toBeVisible();

  await page.getByRole("button", { name: "Fetch candidates" }).click();
  await expect(page.getByText("Regulator proposes new disclosure rule")).toBeVisible();

  await page.getByRole("button", { name: "Ingest" }).click();
  await expect(page).toHaveURL(/\/item\/card_1$/);
});

test("review queue shows separated sections, a HOLD badge, and approving flips it", async ({ page }) => {
  let approved = false;

  await page.route("**/api/queue", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(queueWithStatus(approved ? "approved" : "HOLD — pending approval")),
    }),
  );
  await page.route("**/api/approvals/out_public_1", (route) => {
    approved = true;
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ approvalId: "apr_1", outputId: "out_public_1", status: "approved", assetId: "ast_1" }),
    });
  });

  await page.goto("/queue");
  await expect(page.getByRole("heading", { name: "Public Drafts" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Internal Briefs" })).toBeVisible();
  await expect(page.getByText("HOLD — pending approval").first()).toBeVisible();

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("approved", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
});

test("no page anywhere exposes a publish action or the word 'publish'", async ({ page }) => {
  await jsonRoute(page, "**/api/news/inbox", { candidates: [] });
  await jsonRoute(page, "**/api/queue", queueWithStatus("HOLD — pending approval"));
  await jsonRoute(page, "**/api/approvals", { approvals: [] });

  for (const path of ["/", "/news", "/queue", "/approvals"]) {
    await page.goto(path);
    const bodyText = (await page.textContent("body"))?.toLowerCase() ?? "";
    expect(bodyText).not.toContain("publish");
  }
});
