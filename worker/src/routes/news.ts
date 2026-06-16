import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { ulid } from "ulid";
import * as schema from "../db/schema";
import type { InboxStatus } from "../db/enums";
import { fetchTopNews, NewsApiError } from "../news/client";
import { runPipeline, PipelineSheetsSyncError } from "../pipeline/runPipeline";
import { buildD1PipelineRepo } from "../pipeline/repo";
import { assertInboxStatusTransition, InvalidStatusTransitionError } from "../guardrails/statusMachine";
import { LLMValidationError } from "../llm/groq";
import type { Env } from "../env";

export const newsRoute = new Hono<{ Bindings: Env }>();

newsRoute.get("/inbox", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const candidates = await db.select().from(schema.newsIntakeInbox).all();
  return c.json({ candidates });
});

// Discovery only — this never runs the pipeline. It stages candidates in the
// inbox; ingestion still requires the explicit POST /ingest/:candidate_id
// action below (CLAUDE.md invariant 10).
newsRoute.post("/fetch", async (c) => {
  let articles;
  try {
    articles = await fetchTopNews(c.env);
  } catch (err) {
    if (err instanceof NewsApiError) {
      return c.json({ error: "news_api_failed", message: err.message }, 502);
    }
    throw err;
  }

  const db = drizzle(c.env.DB, { schema });
  const insertedCandidateIds: string[] = [];

  for (const article of articles) {
    const existing = await db
      .select({ candidateId: schema.newsIntakeInbox.candidateId })
      .from(schema.newsIntakeInbox)
      .where(eq(schema.newsIntakeInbox.url, article.url))
      .get();
    if (existing) continue;

    const candidateId = `cnd_${ulid()}`;
    await db.insert(schema.newsIntakeInbox).values({
      candidateId,
      title: article.title,
      url: article.url,
      publisher: article.source ?? null,
      publishedAt: article.published_at,
      snippet: article.snippet ?? article.description ?? null,
      rawPayload: JSON.stringify(article),
      fetchedAt: new Date().toISOString(),
      status: "fetched",
      sourceId: null,
    });
    insertedCandidateIds.push(candidateId);
  }

  return c.json({ fetched: articles.length, inserted: insertedCandidateIds.length, candidateIds: insertedCandidateIds }, 201);
});

newsRoute.post("/ingest/:candidate_id", async (c) => {
  const candidateId = c.req.param("candidate_id");
  const db = drizzle(c.env.DB, { schema });

  const candidate = await db
    .select()
    .from(schema.newsIntakeInbox)
    .where(eq(schema.newsIntakeInbox.candidateId, candidateId))
    .get();

  if (!candidate) return c.json({ error: "candidate_not_found" }, 404);

  try {
    assertInboxStatusTransition(candidate.status as InboxStatus, "selected");
  } catch (err) {
    if (err instanceof InvalidStatusTransitionError) {
      return c.json({ error: "invalid_candidate_status", message: err.message }, 409);
    }
    throw err;
  }

  await db.update(schema.newsIntakeInbox).set({ status: "selected" }).where(eq(schema.newsIntakeInbox.candidateId, candidateId));

  const repo = buildD1PipelineRepo(db);
  const rawText = [candidate.title, candidate.snippet].filter(Boolean).join("\n\n");

  try {
    const result = await runPipeline(
      {
        rawText,
        sourceMeta: {
          url: candidate.url,
          publisher: candidate.publisher ?? undefined,
          datePublished: candidate.publishedAt ?? undefined,
        },
        // Free-tier News API responses are headline + snippet, never full
        // article text — proof grading and scope language must reflect that.
        partialEvidence: true,
      },
      { repo, env: c.env },
    );

    await db
      .update(schema.newsIntakeInbox)
      .set({ status: "ingested", sourceId: result.sourceId })
      .where(eq(schema.newsIntakeInbox.candidateId, candidateId));

    return c.json(result, 201);
  } catch (err) {
    if (err instanceof PipelineSheetsSyncError) {
      return c.json({ error: "sheets_sync_failed", rolled_back: true }, 502);
    }
    if (err instanceof LLMValidationError) {
      return c.json({ error: "llm_validation_failed", message: err.message }, 422);
    }
    throw err;
  }
});
