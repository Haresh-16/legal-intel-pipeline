import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import type { Env } from "../env";

export const outputsRoute = new Hono<{ Bindings: Env }>();

// Public drafts and internal briefs are always returned as separate arrays —
// never one flat list — so a UI consuming this can't accidentally render an
// internal brief next to public-facing content (CLAUDE.md invariant 6).
outputsRoute.get("/", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const rows = await db.select().from(schema.outputQueue).all();

  return c.json({
    public_drafts: rows.filter((row) => row.outputType === "public_draft"),
    internal_briefs: rows.filter((row) => row.outputType === "internal_brief"),
  });
});

outputsRoute.get("/:id", async (c) => {
  const outputId = c.req.param("id");
  const db = drizzle(c.env.DB, { schema });

  const output = await db.select().from(schema.outputQueue).where(eq(schema.outputQueue.outputId, outputId)).get();
  if (!output) return c.json({ error: "output_not_found" }, 404);

  return c.json({ output });
});
