# Phased Task List — Cloudflare + D1 + Google Sheets + The News API + Groq

## ROOT PROMPT

```text
Think deeply before responding. Enter plan mode first and do not edit files until I approve the plan.

Read `design-doc.md` and `CLAUDE.md` in full before doing anything else.

You are building a minimal evaluation-focused legal-market-intelligence vertical slice.

Locked stack:
- Frontend: React + Vite
- Backend: Cloudflare Workers with Hono
- App DB: Cloudflare D1 with Drizzle ORM
- Required backing store: Google Sheets
- Automatic source discovery: The News API free tier
- LLM: Groq free API (`llama-3.3-70b-versatile`) via OpenAI-compatible API
- Validation: Zod
- Tests: Vitest + Playwright
- Deployment: Cloudflare Pages + Workers

Hard constraints:
- Google Sheets is mandatory because the design doc explicitly requires Google Sheets or Notion as the backing store.
- The app must support both manual intake and automatic news discovery from a public news API.
- Automatic intake means fetch candidate articles into an inbox; ingestion still requires explicit operator action.
- Public draft always defaults to `HOLD — pending approval`.
- No auto-publish path and no `/publish` route.
- Internal and public outputs must be separate in schema, API, and UI.
- LLM output must be structured JSON and Zod-validated.
- Raw evidence is immutable.
- Do-not-say enforcement must be in code.

Your plan must cover:
1. File/folder structure
2. D1 schema and Google Sheets tab mapping
3. The News API inbox flow
4. JWT auth approach for Google Sheets API from Cloudflare Worker
5. All API routes
6. All UI screens
7. Groq client and prompt contracts
8. Test strategy, including Sheets-sync and news-fetch failure tests
9. Deployment steps and secrets

Output a concise structured plan and wait for approval before coding.
```

## PHASE 0 — Scaffold

```text
Work on only this task: scaffold the repo and config.

Before editing:
- Re-read CLAUDE.md.
- State files to touch.
- Acceptance criteria: frontend dev server starts, worker dev server starts, env examples include Groq, Google Sheets, and The News API secrets.

Scaffold:
- React + Vite frontend
- Hono worker
- D1 binding named `DB`
- env vars in example docs:
  - GROQ_API_KEY
  - GOOGLE_SERVICE_ACCOUNT_EMAIL
  - GOOGLE_PRIVATE_KEY
  - GOOGLE_SHEETS_SPREADSHEET_ID
  - THE_NEWS_API_TOKEN
- create `/worker/src/sheets` and `/worker/src/news`
- add test runners: Vitest and Playwright

Do not implement business logic yet.
After editing, run the startup commands and report results.
```

## PHASE 1 — D1 schema + Sheets mapping

```text
Work on only this task: implement D1 schema, migrations, and Google Sheets tab mapping helpers.

Acceptance criteria:
- all D1 tables exist
- output_queue default status is `HOLD — pending approval`
- news_intake_inbox table exists
- helper functions map records to Sheets rows for required tabs

Implement:
- Drizzle schema for required tables
- migration files
- `/worker/src/sheets/mappers.ts` for row conversion:
  - Source Registry
  - Intelligence Cards
  - Claims Ledger
  - Output Queue
  - Approval Ledger
  - News Intake Inbox
- raw_evidence_vault remains D1-only but linked by IDs

Tests:
- schema compiles
- row mappers produce expected header/value order
- controlled values align with CLAUDE.md
```

## PHASE 2 — Google Sheets client

```text
Work on only this task: implement Google Sheets API client for Cloudflare Workers.

Acceptance criteria:
- service account JWT auth works in Worker-compatible code
- append-row and batch-append helpers exist
- tab auto-header bootstrap is supported

Implement files:
- `/worker/src/sheets/auth.ts`
- `/worker/src/sheets/client.ts`
- `/worker/src/sheets/bootstrap.ts`

Requirements:
- Worker-compatible JWT signing
- normalize escaped newlines in GOOGLE_PRIVATE_KEY
- support append to named tabs
- expose `appendRows(tabName, rows)` and `ensureHeaders(tabName, headers)`
- fail loudly with typed error on auth or Sheets API failure

Tests:
- mock token generation path
- mock appendRows success/failure
- bootstrap writes expected headers
```

## PHASE 3 — The News API client + inbox flow

```text
Work on only this task: implement automatic source discovery via The News API.

Acceptance criteria:
- fetch route pulls a small candidate set from The News API
- candidates are stored in `news_intake_inbox`
- inbox status defaults to `fetched`
- operator can later ingest a candidate through a separate route

Implement files:
- `/worker/src/news/client.ts`
- `/worker/src/news/queries.ts`
- `/worker/src/routes/news.ts`

Routes:
- `POST /api/news/fetch` — fetch candidates using a small keyword set
- `GET /api/news/inbox` — list stored candidates

Rules:
- Use The News API free tier
- Keep query set minimal: `legal`, `litigation`, `regulation`
- Store exactly what the API returns that is useful: title, description, snippet/content if present, source, url, published_at, fetched_at
- Do not auto-ingest fetched items
- Use mockable fetch client for tests

Tests:
- successful fetch stores candidates in inbox
- API failure returns typed error
- duplicate URL handling if implemented
```

## PHASE 4 — Groq client + Zod contracts

```text
Work on only this task: implement Groq client and all structured output contracts.

Acceptance criteria:
- 5 functions return Zod-validated objects or throw typed errors
- model fallback on 429
- do-not-say phrases blocked before persistence

Implement:
- `/worker/src/llm/groq.ts`
- `/worker/src/llm/prompts.ts`
- `/worker/src/llm/schemas.ts`

Functions:
- normalizeSource
- draftIntelCard
- draftClaims
- draftPublicOutput
- draftInternalBrief

Rules:
- base URL `https://api.groq.com/openai/v1`
- primary `llama-3.3-70b-versatile`
- fallback `llama3-8b-8192`
- JSON only, no streaming
- retry once on invalid structured output
- if source evidence from news API is partial, prompts must force conservative language

Tests:
- valid JSON passes
- invalid JSON retries once then throws
- do-not-say phrase triggers error
```

## PHASE 5 — Guardrails

```text
Work on only this task: implement guardrails.

Acceptance criteria:
- invalid transitions throw
- missing source ids throw
- public body without claim refs throws
- no API path can publish content
- fetched news candidates cannot bypass explicit ingest action

Implement:
- do-not-say filter
- status machine
- validators
- explicit assertion that no publish route is registered
- inbox selection guard requiring POST /api/news/ingest/:candidate_id for pipeline entry

Tests for all invalid cases are required.
```

## PHASE 6 — Manual intake pipeline + selected news ingest

```text
Work on only this task: implement the downstream pipeline for both manual intake and selected news candidate ingest.

Acceptance criteria:
- Sample A/B manual intake create D1 records and corresponding Google Sheets rows
- selected news candidate ingest creates D1 records and Sheets rows
- public draft is HOLD
- internal brief is separate
- failure in required Sheets sync fails the request

Implement routes:
- `POST /api/intake` for manual text intake
- `POST /api/news/ingest/:candidate_id` for inbox-selected intake

Pipeline requirements:
1. validate input or candidate selection
2. create source + raw evidence in D1
3. run Groq normalization/card/claims/public/internal drafting
4. validate guardrails
5. write D1 transaction
6. map records to Sheets rows
7. append required rows to Google Sheets tabs
8. update inbox status to `ingested` for selected candidates
9. return IDs

Important:
- both manual intake and selected news ingest must converge into the same pipeline service after evidence acquisition
- if Sheets append fails, surface failure clearly
- no partial-success illusion in API response

Integration tests:
- manual success path
- selected candidate success path
- Groq failure
- guardrail failure
- Sheets failure
```

## PHASE 7 — Read + approval routes

```text
Work on only this task: implement all remaining routes.

Acceptance criteria:
- queue API returns separate arrays for public_drafts and internal_briefs
- approval route writes D1 and Google Sheets approval row
- approval never sets published status

Implement:
- GET /api/sources/:id
- GET /api/cards/:id
- GET /api/queue
- GET /api/queue/:id
- POST /api/approvals/:output_id
- GET /api/approvals

Tests required for route behavior and separation guarantees.
```

## PHASE 8 — Frontend

```text
Work on only this task: implement the 5-screen operator UI.

Acceptance criteria:
- manual intake works
- news inbox fetch works
- operator can ingest a candidate from inbox
- item detail shows source/card/claims/outputs
- public draft has HOLD banner
- internal brief is visually separate
- no publish button exists anywhere
- queue page shows public drafts vs internal briefs in separate sections

Screens:
- `/` manual intake
- `/news` intake inbox
- `/item/:card_id`
- `/queue`
- `/approvals`

Keep UI plain and functional.
Write Playwright tests for the critical flow.
```

## PHASE 9 — Deploy + README

```text
Work on only this task: deployment config and docs.

Acceptance criteria:
- Cloudflare deployment config complete
- README includes Google Sheets setup and The News API setup
- secrets list is complete

README must include:
- project overview
- architecture diagram
- Cloudflare setup
- Google Cloud service account + Sheets setup
- The News API setup
- env vars / secrets
- local dev
- deploy steps
- evaluation checklist
- productionization note
```

## PHASE 10 — Final audit

```text
Work on only this task: self-audit against the evaluation criteria.
Do not modify code unless a gap is found.

For each checkbox from design-doc.md, report:
- implementation file(s)
- test coverage
- status: satisfied / partial / missing

Also verify:
- Google Sheets rows visibly populate for manual and news-selected intake
- no publish route exists
- no auto-publish path exists
- approval gate is preserved
- The News API inbox flow works without bypassing human selection
```

## REUSABLE TASK PROMPT

```text
Work on only this task: <TASK>.

Before editing:
1. Re-read CLAUDE.md.
2. State exact files to touch.
3. State acceptance criteria.
4. Check risk against hard rules:
   - no auto-publish
   - HOLD default for public drafts
   - internal/public separation
   - raw evidence insert-only
   - D1 + required Google Sheets sync both preserved
   - automatic news intake remains inbox-first, not blind ingestion
   - Zod validation on all LLM/external input

Implementation rules:
- smallest correct change
- do not broaden scope
- add/update tests
- do not weaken guardrails to make tests pass
- if task touches Sheets, include failure handling
- if task touches Groq, require structured JSON and validation
- if task touches The News API, keep manual fallback intact

After editing:
1. run relevant tests
2. report exact results
3. confirm no regression against approval-gate invariants
4. summarize what changed and any remaining risk
```
