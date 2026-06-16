# Legal Market Intelligence — Project Brain

## Objective
Build the **smallest deployable vertical slice** that satisfies the evaluation criteria in `design-doc.md` using 1–2 sample items while demonstrating both manual intake and automatic intake from a public news API. The priority is evaluator confidence, traceability, and strict rule enforcement — not breadth.

## Hard Business Rules
1. **Nothing publishes automatically.**
2. **Every public sentence must be source-linked and never overstated.**
3. **Exactly one human approval gate** for public output.
4. **Internal and public outputs stay separate** in schema, API, and UI.
5. **Raw evidence is immutable** — insert only, never overwrite.
6. **Use role names only** in approval flows.
7. **LLM output is untrusted until validated** with Zod.
8. **Do-not-say enforcement happens in code**, not only in prompts.
9. **Google Sheets is required** as the evaluator-visible backing store from the design doc.
10. **Automatic intake must not bypass human review.** News API ingestion discovers and stages candidate items only.

## Final Architecture (locked)
| Layer | Choice |
|---|---|
| Frontend | React + Vite |
| Backend | Cloudflare Workers with Hono |
| App DB | Cloudflare D1 + Drizzle ORM |
| Required backing store | Google Sheets |
| News discovery API | The News API free tier |
| LLM | Groq free API (`llama-3.3-70b-versatile`) |
| Validation | Zod |
| Testing | Vitest + Playwright |
| Deployment | Cloudflare Pages + Workers |

## Why this architecture
- The design doc explicitly requires **Google Sheets or Notion as the backing store**, so Google Sheets is mandatory for the demo.
- The design doc asks for automated intake, and a public news API lets the demo show source discovery in addition to manual intake.
- Cloudflare still hosts the deployable app for free.
- D1 gives transactional app logic; Google Sheets gives evaluator visibility.
- The News API free plan lists 100 daily requests and 3 articles per request, which is enough for a demo inbox flow.

## Intake modes
### 1. Manual intake
- Operator pastes raw source text into the app.
- This is the reliable demo fallback and must always work with Sample A and Sample B.

### 2. Automatic news intake
- Worker fetches candidate articles from The News API.
- Candidates are shown in an **Intake Inbox**.
- Operator clicks **Ingest** on a candidate item.
- Only then does the downstream pipeline run.
- This is **assisted automatic intake**, not blind ingestion of everything.

## Important automatic-intake constraints
- Do not auto-ingest every fetched article.
- Do not auto-approve, auto-publish, or auto-route to published assets.
- Store exactly what the news API returns as raw evidence plus capture timestamp.
- If article body text is partial, preserve that limitation in proof grading and scope language.
- Manual intake and automatic intake must converge into the same downstream pipeline after selection.

## Data ownership model
- **D1 is the app's transactional store** for API reads, joins, inbox state, and UI rendering.
- **Google Sheets is the required external backing store mirror** for evaluator visibility and requirement compliance.
- Required D1 writes and required Sheets writes must both succeed for a pipeline run to be considered successful.
- News API fetch results may be cached in D1 for the intake inbox.

## Google Sheets requirements
Use one spreadsheet with these tabs:
1. `Source Registry`
2. `Intelligence Cards`
3. `Claims Ledger`
4. `Output Queue`
5. `Approval Ledger`
6. `News Intake Inbox` (optional but recommended for demo visibility)

## Google integration rules
- Use Google Sheets API directly from the Worker.
- Auth via service account JWT.
- Required env vars:
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
  - `GOOGLE_PRIVATE_KEY`
  - `GOOGLE_SHEETS_SPREADSHEET_ID`
- Store private key as a Cloudflare secret.
- Normalize newline escaping for the private key before JWT signing.
- If a required Sheets write fails, the request fails.

## News API rules
- Provider: **The News API**
- Base URL: `https://api.thenewsapi.com/v1/news/top`
- Env var: `THE_NEWS_API_TOKEN`
- Use this only for **candidate discovery**.
- Keep manual intake available even if The News API fails or rate-limits.
- Default query set should be small and focused, e.g. `legal`, `litigation`, `regulation`.
- Respect the free-tier limits in design: fetch only a few items for the demo.

## LLM — Groq
- Base URL: `https://api.groq.com/openai/v1`
- Primary model: `llama-3.3-70b-versatile`
- Fallback model on 429: `llama3-8b-8192`
- Env var: `GROQ_API_KEY`
- Use OpenAI-compatible SDK if convenient.
- All outputs must be structured JSON and Zod-validated before persistence.

## Project structure
```text
/
├── CLAUDE.md
├── design-doc.md
├── frontend/
│   └── src/
├── worker/
│   └── src/
│       ├── routes/
│       ├── db/
│       ├── llm/
│       ├── sheets/
│       ├── news/
│       └── guardrails/
└── tests/
```

## Required tables / tabs
### D1 tables
- `source_registry`
- `raw_evidence_vault`
- `intelligence_cards`
- `claims_ledger`
- `output_queue`
- `approval_ledger`
- `published_asset_index`
- `news_intake_inbox` (for fetched candidates and selection state)

### Sheets tabs
Mirror these tables for the demo:
- `source_registry` -> `Source Registry`
- `intelligence_cards` -> `Intelligence Cards`
- `claims_ledger` -> `Claims Ledger`
- `output_queue` -> `Output Queue`
- `approval_ledger` -> `Approval Ledger`
- `news_intake_inbox` -> `News Intake Inbox` (recommended)

`raw_evidence_vault` may remain D1-only if text size is awkward for Sheets.

## Controlled values
```ts
ProofGrade = "A" | "B" | "C"
RiskLevel = "Low" | "Medium" | "High"
PublicUseStatus = "Public" | "Website-safe after approval" | "Hold pending verification" | "Internal-only"
RecordStatus = "Research lead" | "Card drafted" | "Draft ready" | "Hold" | "Approved" | "Published" | "Archived"
OutputStatus = "HOLD — pending approval" | "approved" | "archived"
InboxStatus = "fetched" | "selected" | "ingested" | "rejected"
ApprovalRole = "Intelligence Desk" | "Writer" | "Builder" | "Ops" | "Legal" | "Principal"
```

## Core invariants
1. Public draft status defaults to `HOLD — pending approval`.
2. No `/publish` endpoint exists.
3. Approval only changes status to `approved`, not `published`.
4. Claims without source IDs are rejected.
5. Public output without claim references is rejected.
6. Do-not-say phrases block persistence.
7. Raw evidence is insert-only.
8. Internal brief content never appears in public draft API responses.
9. Required D1 writes and required Google Sheets writes must both succeed for intake success.
10. Automatic news intake only stages candidates; ingestion requires an explicit operator action.

## LLM contracts
Implement Zod schemas for:
- `SourceNormalized`
- `CardDraft`
- `ClaimDraft[]`
- `PublicDraftOutput`
- `InternalBriefOutput`

Prompt rules:
- Conservative legal-language style.
- Explicitly forbid overstatement.
- Include do-not-say list in system prompt.
- Require source-linked claims.
- Never allow public copy without a scoped public version.
- If source evidence is partial, the output must acknowledge uncertainty conservatively.

## API routes
- `POST /api/intake`
- `GET /api/news/inbox`
- `POST /api/news/fetch`
- `POST /api/news/ingest/:candidate_id`
- `GET /api/sources/:id`
- `GET /api/cards/:id`
- `GET /api/queue`
- `GET /api/queue/:id`
- `POST /api/approvals/:output_id`
- `GET /api/approvals`

## UI screens
- `/` Intake
- `/news` Intake Inbox
- `/item/:card_id` Item detail
- `/queue` Review queue
- `/approvals` Approval ledger

## Minimal implementation target
Must demonstrate on Sample A and Sample B, plus at least one fetched news candidate:
- manual intake
- automatic candidate discovery from The News API
- operator-selected ingest from inbox
- source registry row
- intelligence card
- claims ledger entries
- public draft in HOLD
- internal brief
- output queue
- approval action
- visible Google Sheets rows for evaluator inspection

## Testing requirements
### Unit
- Zod schema validation
- do-not-say filter
- status transitions
- source-id and claim-ref validators
- Sheets row mapping functions
- The News API response mapping

### Integration
- full manual intake writes D1 + Sheets rows
- news fetch stores inbox candidates
- selected candidate ingest writes D1 + Sheets rows
- rollback/failure behavior when Sheets sync fails
- approval route writes D1 + Sheets approval row
- public/internal separation maintained

### E2E
- sample manual intake works
- news inbox fetch works with mocked API
- ingest candidate from inbox works
- HOLD badge visible
- no publish button exists
- approve action works
- queue separated into public drafts vs internal briefs

## Definition of done
- [ ] End-to-end chain works on sample items
- [ ] Approval gate preserved — no auto-publish
- [ ] Claim-scoping / proof-grading enforced
- [ ] Internal vs public outputs separated
- [ ] Layered structure traceable and source-linked
- [ ] Google Sheets backing store visibly wired
- [ ] Automatic intake from public news API demonstrated
- [ ] Cloudflare deployment works
- [ ] Tests pass

## Out of scope
- background schedulers and cron-driven ingestion
- deduplication beyond simple URL guard if easy
- auth/multi-user flows
- billing
- real publishing integrations
- polished marketing UI
- blind auto-processing of all fetched news
