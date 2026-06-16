import { Hono } from "hono";
import type { Env } from "./env";
import { intakeRoute } from "./routes/intake";
import { newsRoute } from "./routes/news";
import { sourcesRoute } from "./routes/sources";
import { cardsRoute } from "./routes/cards";
import { outputsRoute } from "./routes/outputs";
import { approvalsRoute } from "./routes/approvals";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.json({ status: "ok", service: "legal-intel-worker" }));
app.route("/api/intake", intakeRoute);
app.route("/api/news", newsRoute);
app.route("/api/sources", sourcesRoute);
app.route("/api/cards", cardsRoute);
app.route("/api/queue", outputsRoute);
app.route("/api/approvals", approvalsRoute);

export default app;
export type { Env };
