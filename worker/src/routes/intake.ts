import { Hono } from "hono";
import { z } from "zod";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { runPipeline, PipelineSheetsSyncError } from "../pipeline/runPipeline";
import { buildD1PipelineRepo } from "../pipeline/repo";
import { LLMValidationError } from "../llm/groq";
import type { Env } from "../env";

const IntakeRequest = z.object({
  rawText: z.string().min(1),
  sourceMeta: z
    .object({
      url: z.string().optional(),
      publisher: z.string().optional(),
      author: z.string().optional(),
      datePublished: z.string().optional(),
    })
    .optional(),
  partialEvidence: z.boolean().optional(),
});

export const intakeRoute = new Hono<{ Bindings: Env }>();

intakeRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = IntakeRequest.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const repo = buildD1PipelineRepo(db);

  try {
    const result = await runPipeline(parsed.data, { repo, env: c.env });
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
