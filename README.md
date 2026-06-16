# Legal Market Intelligence — Automated Intake Pipeline

A vertical slice of an automated legal-market intelligence operation: raw sources (pasted text, or
discovered automatically via a news API) go in, and a structured, source-linked, claim-scoped,
proof-graded **draft** comes out — held for a single human approval gate before anything is
considered usable. **Nothing publishes automatically.**

## Project overview

The pipeline mirrors the layered structure of a real intelligence desk:

1. **Source Registry** — every source gets a unique ID + metadata.
2. **Raw Evidence Vault** — the original text, stored insert-only, never overwritten.
3. **Intelligence Card** — one structured packet per item (vertical, status, risk, proof grade, narrative gap).
4. **Claims Ledger** — every public sentence is claim-scoped, source-linked, proof-graded, and carries a do-not-say list.
5. **Output Queue** — two drafted outputs per card: a public news-draft (`HOLD — pending approval`) and an internal-only practice-area brief. These are never shown to the same audience and are visually/structurally separated everywhere (schema, API, UI).
6. **Approval Ledger** — the single gate. A named **role** (not a person) approves or archives a public draft. Approving is the only thing that produces a `published_asset_index` row — there is no `/publish` route anywhere in this codebase.

Two intake paths feed the same pipeline:

- **Manual intake** — paste raw source text in, run end to end immediately.
- **Automatic discovery** — `POST /api/news/fetch` pulls candidate articles from The News API into an **Intake Inbox**. Discovery is automatic; running the pipeline on a candidate is not — a human must click **Ingest** on a specific candidate before any drafting happens. Fetching never bypasses review.

Every successful pipeline run dual-writes to **Cloudflare D1** (the transactional store the API/UI read from) and to a **Google Sheet** (a required, evaluator-visible mirror — not optional/best-effort). If the Sheets write fails after D1 already committed, the route rolls back the D1 rows it just wrote (a compensating-action saga, since D1 and Sheets can't share one transaction) and returns `502 { error: "sheets_sync_failed", rolled_back: true }`. Raw evidence is the one table never rolled back or mirrored — captured text is immutable by design.

### Architecture diagram

```
                    ┌─────────────────────┐
                    │   The News API       │  (free tier; discovery only)
                    └──────────┬───────────┘
                               │ POST /api/news/fetch
                               ▼
 ┌──────────────┐      ┌───────────────────┐        ┌─────────────────────┐
 │   Frontend    │ HTTP │   Cloudflare       │  HTTP  │   Groq LLM API       │
 │ React + Vite  │◄────►│   Worker (Hono)    │◄──────►│ llama-3.3-70b-versatile│
 │ (5 screens)   │      │                    │        │ (Zod-validated output)│
 └──────────────┘      │  intake / news /    │        └─────────────────────┘
                        │  sources / cards /  │
                        │  queue / approvals  │
                        └─────┬──────────┬────┘
                              │          │
                     batched  │          │  appendRow (required;
                     writes   │          │  rollback D1 on failure)
                              ▼          ▼
                     ┌────────────┐  ┌──────────────────┐
                     │ Cloudflare  │  │  Google Sheets    │
                     │ D1 (SQLite) │  │  (evaluator-visible│
                     │ + Drizzle   │  │  backing store)    │
                     └────────────┘  └──────────────────┘
```

Human approval gate sits entirely inside the Worker/D1+Sheets boundary: `POST /api/approvals/:output_id` is the only route that can move a public draft out of `HOLD`, and it is only ever called from the Review Queue screen by a person picking a role from a dropdown.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite |
| Backend | Cloudflare Workers + Hono |
| App DB | Cloudflare D1 + Drizzle ORM |
| Required backing store | Google Sheets (dual-write, mandatory) |
| Source discovery | The News API (free tier) |
| LLM | Groq free API, `llama-3.3-70b-versatile` (fallback `llama3-8b-8192` on 429) |
| Validation | Zod (all LLM output and all external API responses are untrusted until validated) |
| Tests | Vitest (unit + integration), Playwright (E2E) |
| Deploy | Cloudflare Pages (frontend) + Workers (backend), free tier only |

## Repo layout

```
worker/src/
├── routes/        intake, news, sources, cards, outputs (queue), approvals
├── pipeline/       runPipeline.ts — shared by manual intake AND news-ingest
├── llm/            Groq client + 5 prompt contracts (Zod schemas)
├── guardrails/     do-not-say filter, status machine, evidence grading
├── sheets/         Web Crypto JWT auth, append client, D1-row → Sheet-row mappers
├── news/           The News API client + response schema
└── db/             Drizzle schema + migrations (8 tables)
frontend/src/pages/  Intake ("/"), NewsInbox ("/news"), ItemDetail ("/item/:card_id"),
                     ReviewQueue ("/queue"), ApprovalLedger ("/approvals")
tests/
├── unit/           contracts, guardrails, mappers
├── integration/     routes exercised end-to-end via Hono's app.request()
└── e2e/             Playwright, network-intercepted (no live secrets needed)
```

## API routes

| Method | Route | Notes |
|---|---|---|
| POST | `/api/intake` | Manual intake → pipeline → D1 + Sheets dual-write |
| POST | `/api/news/fetch` | Pull candidates from The News API into the inbox (discovery only) |
| GET | `/api/news/inbox` | List inbox candidates |
| POST | `/api/news/ingest/:candidate_id` | Explicit human action → runs the same pipeline as manual intake |
| GET | `/api/sources/:id` | Source registry row |
| GET | `/api/cards/:id` | Card + claims + source IDs |
| GET | `/api/queue` | `{ public_drafts: [...], internal_briefs: [...] }` — always split |
| GET | `/api/queue/:id` | Single output row |
| POST | `/api/approvals/:output_id` | `{ actor_role, action, notes? }` → HOLD → approved/archived only |
| GET | `/api/approvals` | Approval ledger |

There is no `/publish` route. There never will be one in this codebase — publishing is a human action that happens outside this system, after a person reads an `approved` draft.

## Local development

Prerequisites: Node 20+, npm. No Cloudflare account is required for local dev — `wrangler dev --local` emulates D1 on disk.

```bash
npm ci

# one-time: apply D1 migrations to the local emulated DB
npm run db:migrate:local --workspace=worker

# copy the env template and fill in real values (see "Setup" below)
cp .env.example worker/.dev.vars

# terminal 1
npm run dev:worker      # wrangler dev, http://localhost:8787

# terminal 2
npm run dev:frontend     # vite, http://localhost:5173, proxies /api -> :8787
```

Open `http://localhost:5173`. Manual intake works immediately. The News Inbox and Sheets mirroring require the credentials below.

### Running tests

```bash
npm run test:worker     # Vitest — unit + integration, fully mocked, no live network calls
npm run build:frontend   # tsc -b + vite build
npx playwright install --with-deps chromium   # first time only
npm run test:e2e         # Playwright — network-intercepted, no live worker/secrets needed
```

## Setup: credentials

All five secrets below live in `worker/.dev.vars` for local dev (gitignored) and as GitHub Actions
secrets for CI/deploy. `.env.example` at the repo root documents the names; nothing in it is a real
credential.

### Groq (LLM)

1. Create a free account at [console.groq.com](https://console.groq.com).
2. Create an API key → set `GROQ_API_KEY`.

### The News API (free tier, source discovery)

1. Sign up at [thenewsapi.com](https://www.thenewsapi.com) and copy the free-tier token → set `THE_NEWS_API_TOKEN`.
2. The free tier is rate-limited and returns headline + snippet (not always full body) — see the partial-evidence handling note below.

### Google Sheets (required backing store)

1. In [Google Cloud Console](https://console.cloud.google.com) → IAM & Admin → Service Accounts, create a service account and a JSON key.
2. From the JSON key, copy `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `private_key` → `GOOGLE_PRIVATE_KEY` (keep the `\n` escapes literal — the worker normalizes them at runtime; do not paste real line breaks into a single-line env value).
3. Create a Google Sheet, share it with the service-account email as **Editor**, and copy its ID (the long string in the sheet's URL) → `GOOGLE_SHEETS_SPREADSHEET_ID`.
4. Create 6 tabs with header rows matching the schema column order (see `worker/src/sheets/mappers.ts` for exact column order per tab):
   - `Source Registry`
   - `Intelligence Cards`
   - `Claims Ledger`
   - `Output Queue`
   - `Approval Ledger`
   - `News Intake Inbox`

   (`Raw Evidence Vault` is intentionally D1-only — not mirrored to Sheets, to avoid duplicating large source text across two stores.)

### Cloudflare

1. `wrangler login` (or set `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` for non-interactive use).
2. Create the D1 database: `wrangler d1 create legal-intel-db`, then paste the returned `database_id` into `worker/wrangler.toml`.
3. Create a Pages project for the frontend (`wrangler pages project create legal-intel-frontend`), or let the first `wrangler pages deploy` create it.

## Deploying

CI/CD is `.github/workflows/deploy.yml`: every push to `main` runs the full Vitest + Playwright suite (no live secrets needed — Sheets/News API/Groq are mocked), then on success applies D1 migrations, syncs the 5 worker secrets, deploys the Worker, builds the frontend, and deploys it to Cloudflare Pages.

Required GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, plus the same 5 names as `.env.example` (`GROQ_API_KEY`, `THE_NEWS_API_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEETS_SPREADSHEET_ID`).

Manual deploy (no CI):

```bash
npm run db:migrate:remote --workspace=worker
cd worker && npx wrangler secret put GROQ_API_KEY            # repeat for the other 4 secrets
npx wrangler deploy
cd ../frontend && npm run build
npx wrangler pages deploy dist --project-name=legal-intel-frontend
```

The frontend calls relative `/api/...` paths. Since Pages and the Worker are different origins, `frontend/public/_redirects` proxies `/api/*` to the deployed Worker URL — after the first `wrangler deploy`, replace the placeholder subdomain in that file with the real `*.workers.dev` URL it printed (or point it at a custom route) and redeploy the frontend.

## Evaluation checklist

- [x] End-to-end chain works on a sample item (manual paste-in and news-discovered-then-ingested both run the same pipeline)
- [x] Approval gate preserved — no auto-publish; no `/publish` route exists anywhere in the codebase
- [x] Claim-scoping / proof-grading enforced in code (do-not-say filtering, status-machine transitions, partial-evidence proof-grade capping) — not just left to the LLM prompt
- [x] Internal vs public outputs separated in schema (`output_type`), API (`/api/queue` always returns split arrays), and UI (visually distinct sections/banners, no shared approval control on internal briefs)
- [x] Wired to the layered structure end-to-end — Source Registry → Raw Evidence Vault → Intelligence Card → Claims Ledger → Output Queue → Approval Ledger → Published Asset Index, traceable by ID, mirrored to a human-readable Google Sheet

## Productionization note

This is a ~10-hour vertical slice. To take it to production:

- **Scheduling**: replace manual `POST /api/news/fetch` clicks with a Cloudflare Cron Trigger running on an interval, still writing only to the inbox — ingestion stays a human action.
- **More sources/connectors**: The News API free tier is a single, rate-limited connector; a real system would add court-docket feeds, regulator RSS, and PACER/state-court watchers behind the same inbox abstraction.
- **Dedup**: current dedup is a single `url` unique constraint on the inbox table; production needs fuzzy/semantic dedup across paraphrased coverage of the same underlying event.
- **Sheets sync resilience**: the current dual-write is a synchronous compensating-action saga (roll back D1 if the Sheets call fails). A production version would queue Sheets writes (e.g. Cloudflare Queues) with retries/backoff instead of failing the whole request, and reconcile a backlog rather than rolling back.
- **Evidence retention**: Raw Evidence Vault currently stores normalized text in D1; production would push large/binary originals to object storage (R2) and keep D1 as a pointer + checksum.
- **Partial-evidence handling**: free-tier News API responses are often headline + snippet only; proof grade is capped at `C` and a scope-limitation sentence is force-appended for any card built from partial evidence — a production system would follow up with a full-text fetch before allowing a higher grade.
- **Auth/roles**: approval actor is currently a free-choice role dropdown with no authentication; production needs real per-person auth mapped to one of the fixed roles, with an audit trail of which person acted under which role.
