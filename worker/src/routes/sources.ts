import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import type { Env } from "../env";

export const sourcesRoute = new Hono<{ Bindings: Env }>();

sourcesRoute.get("/:id", async (c) => {
  const sourceId = c.req.param("id");
  const db = drizzle(c.env.DB, { schema });

  const source = await db.select().from(schema.sourceRegistry).where(eq(schema.sourceRegistry.sourceId, sourceId)).get();
  if (!source) return c.json({ error: "source_not_found" }, 404);

  return c.json({ source });
});
