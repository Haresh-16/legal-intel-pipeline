import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import type { Env } from "../env";

export const cardsRoute = new Hono<{ Bindings: Env }>();

cardsRoute.get("/:id", async (c) => {
  const cardId = c.req.param("id");
  const db = drizzle(c.env.DB, { schema });

  const card = await db.select().from(schema.intelligenceCards).where(eq(schema.intelligenceCards.cardId, cardId)).get();
  if (!card) return c.json({ error: "card_not_found" }, 404);

  const claims = await db.select().from(schema.claimsLedger).where(eq(schema.claimsLedger.cardId, cardId)).all();
  const sourceIds: string[] = card.primarySourceIds ? JSON.parse(card.primarySourceIds) : [];

  return c.json({ card, claims, sourceIds });
});
