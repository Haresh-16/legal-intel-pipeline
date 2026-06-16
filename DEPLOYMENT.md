# Deployment Guide

## Cloud services involved

| Service | What it hosts | Free tier |
|---|---|---|
| **Cloudflare Workers** | Backend API (`legal-intel-worker`) | 100k req/day |
| **Cloudflare D1** | SQLite database (8 tables) | 5 GB, 5M row-reads/day |
| **Cloudflare Pages** | React frontend | Unlimited static |
| **Google Sheets API** | Evaluator-visible backing store | Free (service account) |
| **Groq** | LLM (`llama-3.3-70b-versatile`) | Free tier |
| **The News API** | News candidate discovery | 100 req/day, 3 articles/req |

---

## Prerequisites (install once)

> **Windows note:** `npm install -g wrangler` sometimes skips the platform-specific
> workerd binary (`@cloudflare/workerd-windows-64`), causing wrangler to crash even
> on simple commands like `login`. Use `npx wrangler` from the `worker/` directory
> instead — the locally installed copy (already in `worker/node_modules`) has all
> dependencies intact. All commands below use this approach.
>
> If you'd prefer a working global install, run:
> ```bash
> npm uninstall -g wrangler
> npm install -g wrangler --include=optional
> wrangler --version   # should print a version number without errors
> ```

**All wrangler commands below are run with `npx wrangler` from the `worker/` directory
unless noted otherwise.** First, authenticate:

```bash
cd /d/AI_Intake_Agent/Interview_Assignment/worker
npx wrangler login       # opens browser → authorise your Cloudflare account
npx wrangler whoami      # confirm: should print your Cloudflare account email
```

---

## Step 1 — Cloudflare: create the D1 database

```bash
# From the worker/ directory
npx wrangler d1 create legal-intel-db
```

Copy the `database_id` printed in the output and paste it into `worker/wrangler.toml`:

```toml
# worker/wrangler.toml  (line 8 — only change needed before first deploy)
database_id = "PASTE_ID_HERE"
```

Commit that change before deploying.

---

## Step 2 — Google Cloud: service account + spreadsheet

1. Go to [console.cloud.google.com](https://console.cloud.google.com) →
   **IAM & Admin → Service Accounts → Create service account**.
2. After creating it, click **Keys → Add key → JSON** — download the key file.
3. From the JSON file, note two values:
   - `client_email` → this becomes `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → this becomes `GOOGLE_PRIVATE_KEY`  
     *(keep the `\n` sequences as literal backslash-n — do not turn them into real newlines)*

   These values go in **three places** depending on context:

   | Context | Where to paste |
   |---|---|
   | **Local dev** | `worker/.dev.vars` — copy `.env.example` to that file and fill in the values |
   | **Manual first deploy** | Piped directly into `wrangler secret put` commands in Step 5 below |
   | **CI/CD (GitHub Actions)** | Added as repository secrets in Step 6 |

   You do not need to paste them into any source file — they are never committed.
4. Create a new Google Sheet, share it with the `client_email` as **Editor**.
5. Copy the spreadsheet ID from the URL  
   (`https://docs.google.com/spreadsheets/d/**THIS_PART**/edit`) →  
   becomes `GOOGLE_SHEETS_SPREADSHEET_ID`.
6. Inside the sheet, create **6 tabs** with these exact names (case-sensitive), and add
   the header row shown below to **row 1** of each tab. The app appends data starting
   at the next empty row — without headers, row 1 will be overwritten by data and the
   columns won't be labelled.

   **Source Registry**
   | Source ID | Title | Publisher | Author | Date Published | Date Captured | URL | Source Type | Primary/Secondary | Public Status | Proof Grade | Pages/Figures/Lines | Key Extract | Related Claims | Related Cards | Approval Status | Notes |

   **Intelligence Cards**
   | Card ID | Title | Vertical | Date Created | Status | Primary Source IDs | Related Claim IDs | Proof Grade | Risk Level | Public Use Status | Writer Status | Builder Status | Approval Owner | Monetization Path | Output Priority | Tags | Narrative Gap Summary |

   **Claims Ledger**
   | Claim ID | Card ID | Exact Claim | Short Claim | Approved Public Version | Source IDs | Proof Grade | Scope Limitation | Risk Notes | Do Not Say | Approved By | Approval Date | Where Used | Status |

   **Output Queue**
   | Output ID | Card ID | Output Type | Status | Content | Monetization Path Tag | Created At |

   **Approval Ledger**
   | Approval ID | Output ID | Action | Actor Role | Timestamp | Notes |

   **News Intake Inbox**
   | Candidate ID | Title | URL | Publisher | Published At | Snippet | Fetched At | Status | Source ID |

---

## Step 3 — Groq API key

Sign up at [console.groq.com](https://console.groq.com) → create an API key → note it as `GROQ_API_KEY`.

---

## Step 4 — The News API token

Sign up at [thenewsapi.com](https://www.thenewsapi.com) → copy your free-tier token → note it as `THE_NEWS_API_TOKEN`.

---

## Step 5 — First manual deploy

Run all of these from the `worker/` directory (with `wrangler.toml` already updated in Step 1):

```bash
cd /d/AI_Intake_Agent/Interview_Assignment/worker

# Apply DB migrations to the remote D1 database
npx wrangler d1 migrations apply legal-intel-db --remote

# Push the 5 app secrets to the Worker
echo "YOUR_GROQ_KEY"                            | npx wrangler secret put GROQ_API_KEY
echo "YOUR_NEWS_TOKEN"                          | npx wrangler secret put THE_NEWS_API_TOKEN
echo "sa@your-project.iam.gserviceaccount.com" | npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL
echo "-----BEGIN RSA PRIVATE KEY-----\n..."     | npx wrangler secret put GOOGLE_PRIVATE_KEY
echo "1BxS_your_spreadsheet_id"                | npx wrangler secret put GOOGLE_SHEETS_SPREADSHEET_ID

# Deploy the Worker
npx wrangler deploy
```

The last command prints your worker URL, e.g.:
```
https://legal-intel-worker.YOUR_SUBDOMAIN.workers.dev
```

**Update `frontend/public/_redirects`** — replace `YOUR_SUBDOMAIN` with the real value printed above:
```
/api/*  https://legal-intel-worker.YOUR_SUBDOMAIN.workers.dev/api/:splat  200
```

Then build and deploy the frontend (from the repo root):
```bash
cd /d/AI_Intake_Agent/Interview_Assignment
npm run build:frontend
npx wrangler pages deploy frontend/dist --project-name=legal-intel-frontend
```

The Pages deploy prints the live frontend URL (e.g. `https://legal-intel-frontend.pages.dev`).

---

## Step 6 — Wire up CI/CD (GitHub Actions)

Push the repo to GitHub, then add **7 secrets** under  
`Settings → Secrets and variables → Actions → New repository secret`:

| Secret name | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com → My Profile → API Tokens → Create Token (use the "Edit Cloudflare Workers" template) |
| `CLOUDFLARE_ACCOUNT_ID` | dash.cloudflare.com → right sidebar on any page → Account ID |
| `GROQ_API_KEY` | from Step 3 |
| `THE_NEWS_API_TOKEN` | from Step 4 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | from Step 2 |
| `GOOGLE_PRIVATE_KEY` | from Step 2 |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | from Step 2 |

After that, every push to `main` automatically:
1. Runs all Vitest + Playwright tests (no live secrets needed — all mocked)
2. Applies any new D1 migrations
3. Syncs the 5 app secrets to the Worker
4. Deploys the Worker
5. Builds and deploys the frontend to Pages

---

## Local dev (reference)

```bash
cp .env.example worker/.dev.vars   # fill in real values
npm run db:migrate:local --workspace=worker
npm run dev:worker     # http://localhost:8787
npm run dev:frontend   # http://localhost:5173 (proxies /api → :8787)
```

---

## Verification after deploy

1. Open the Pages URL → paste Sample A text into **Manual Intake** → submit.
2. Open your Google Sheet — rows should appear in `Source Registry`, `Intelligence Cards`, `Claims Ledger`, `Output Queue`.
3. Go to `/queue` — the public draft should show a `HOLD — pending approval` badge.
4. Go to `/news` → click **Fetch candidates** → click **Ingest** on one → check the Sheet again.
5. Approve a draft in `/queue` → status flips to `approved`; confirm no publish button appears anywhere.

---

## Summary of file edits required

Before first deploy:
- **`worker/wrangler.toml` line 8** — replace `REPLACE_WITH_REAL_D1_DATABASE_ID` with the ID from Step 1.

After first `wrangler deploy`:
- **`frontend/public/_redirects`** — replace `YOUR_SUBDOMAIN` with the actual workers.dev subdomain printed by the deploy command.
