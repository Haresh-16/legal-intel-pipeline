

## Project

I run a legal-market intelligence operation. Today I do it by hand every day: I find legal news, turn it into organized intelligence, and write it up so that every public claim is backed by a source — some of it becomes articles, and some of it tells my firm which cases to go after.

I want to see how much of that daily work you can automate — from the news coming in to a finished draft coming out.

**Two hard rules:**

1. Nothing gets published without a human approving it first.
1. Every public sentence must be backed by its source — never overstated.

I’m not expecting a finished product. I want to see **how far you get, whether you respect those two rules, and how you’d build the rest.** Show me the working piece, and tell me your plan for the rest.

## The challenge

We operate a legal-market intelligence pipeline that today is run **by hand, every day**. Your task: **automate it — from raw source intake through to drafted output — and stop at exactly one human approval gate.** Show us how far you can take it.

## The golden rule (non-negotiable)

**Nothing publishes automatically.** The system *drafts and stages*; a human reads and approves every public output before it goes anywhere. An implementation that auto-publishes public claims **fails** the assignment, no matter how polished.

## The pipeline (the layers you’re automating)

1. **Source Registry** — every source gets a unique ID + metadata; every claim traces back to a Source ID.
1. **Raw Evidence Vault** — original artifacts stored exactly as received; never overwritten.
1. **Intelligence Cards** — one structured packet per item (standard card format below).
1. **Claims Ledger / Proof Stack** — protects every public sentence; exact language is claim-scoped and proof-graded.
1. **Narrative Gaps / Market Signals** — gap between market narrative and provable fact → opportunity.
1. **Output Queue** — approved intelligence routed into deliverables; no output without a source card + approval path.
1. **Approval Ledger** — tracks approvals by use; public and internal use kept separate.
1. **Monetization Map** — each item mapped to a revenue path.
1. **Correction Watch** — tracks sensitive public-record/correction issues.
1. **Published Asset Index** — what went live, where, linked back to approved claims.
1. **Archive / Do-Not-Use** — obsolete or unsafe claims quarantined, never deleted.

## What to automate — and where to stop

**Automate, end to end:**

- Source intake → structured **Source Registry** rows (auto-generated IDs + metadata)
- Source → **Intelligence Card** (auto-filled, standard format)
- Card → **claim-scoping + proof-grading draft**: exact claim, approved public version, scope limitation, do-not-say, proof grade, risk level — *enforcing the scoping rules*
- Card → **narrative-gap / market-signal** detection
- Card → **two drafted outputs**:
1. a **public news-article DRAFT** — status: `HOLD — pending approval`
1. an **internal intelligence brief** — a practice-area / targeting signal for internal use
- Routing into the **Output Queue** with a monetization-path tag

**Stop — human only (do not automate past these):**

- Publishing any public output (a person reads the news draft first)
- Final claim approval / sign-off
- Legal verification of specific cases or holdings
- Anything sales

## The two outputs that matter

- **Public draft** → feeds the content / authority engine (held for approval).
- **Internal brief** → tells the team which areas and angles to pursue.

Both are *produced* by the automation. Humans act *after*.

## The claim-scoping discipline (the hard part — we are watching for this)

Every public sentence must be **source-linked, claim-scoped, proof-graded, and risk-checked** before it can be approved. Your automation should draft these, enforce a **do-not-say list**, and keep **internal vs public** use separate. Generating text is easy. Enforcing scoped, defensible public language — and refusing to publish without a human — is the actual test.

## What you get / what you don’t

**You get:** this brief, the schema below, 1–2 sample source inputs, and dummy example rows.
**You do not get:** our live data, real claims, competitor analysis, or monetization specifics — and you won’t need them to build the automation.

-----

## Schema (build against this)

**Source Registry (columns):** Source ID · Title · Publisher · Author · Date Published · Date Captured · URL/Location · Source Type · Primary/Secondary · Public Status · Proof Grade · Pages/Figure/Lines · Key Extract · Related Claims · Related Cards · Approval Status · Notes

**Intelligence Card (columns):** Card ID · Title · Vertical · Date Created · Status · Primary Source IDs · Related Claim IDs · Proof Grade · Risk Level · Public Use Status · Writer Status · Builder Status · Approval Owner (role) · Monetization Path · Output Priority · Tags · Narrative Gap Summary

**Claims Ledger (columns):** Claim ID · Exact Claim · Short Claim · Approved Public Version · Source IDs · Proof Grade · Scope Limitation · Risk Notes · Do-Not-Say · Approved By (role) · Approval Date · Where Used · Status

**Controlled values:**

- Proof Grade: A · B · C
- Risk Level: Low · Medium · High
- Public Use Status: Public · Website-safe after approval · Hold pending verification · Internal-only
- Status: Research lead · Card drafted · Draft ready · Hold · Approved · Published · Archived

**Owner roles (use roles, not names):** Intelligence Desk · Writer · Builder · Ops · Legal · Principal

### Dummy example — Intelligence Card

`Card ID:` INTEL-SAMPLE-001 · `Title:` Sample Notice-Requirement Ruling · `Vertical:` Sample Vertical · `Status:` Draft ready · `Primary Source IDs:` SRC-SAMPLE-001 · `Proof Grade:` B · `Risk Level:` Medium · `Public Use Status:` Hold pending verification · `Approval Owner:` Legal · `Narrative Gap Summary:` Market reads the ruling as uncertainty; the opportunity is in venue and intake strategy.

### Dummy example — Claim

`Claim ID:` CLM-SAMPLE-001 · `Exact Claim:` A federal appeals court issued a split decision on notice requirements under [Statute X]. · `Approved Public Version:` Courts appear divided on [Statute X] notice requirements. · `Proof Grade:` B · `Scope Limitation:` Cite the actual cases once verified. · `Do-Not-Say:` “guaranteed outcome”; “all courts agree” · `Status:` Hold

### Sample source inputs (run the pipeline on these)

- **Sample A:** “A federal appeals court this week issued a split ruling interpreting notice requirements under [Statute X], deepening a divide with two other circuits. Practitioners expect further appellate activity.” *(fictional)*
- **Sample B:** “Regulators signaled expanded scrutiny of [Practice Y] data handling, with commentators warning of rising litigation exposure for companies in the space.” *(fictional)*

-----

## What ~10 hours should produce (the bar)

A working **end-to-end vertical slice**, demonstrated on 1–2 sample items:

- backing store wired (Google Sheets or Notion — your choice)
- automated intake → card → claim-scoped draft → both drafted outputs → Output Queue, **with the approval gate in place**
- a short architecture note: how you’d productionize (more sources, scheduling, dedup, error handling)

Not expected in ten hours: production hardening, many connectors, dedup, billing, or a polished UI. Expected: the happy path works, the scoping rules are enforced, and **the approval gate is respected.**

## How we evaluate (how far did you get?)

- ☐ End-to-end chain works on a sample item
- ☐ **Approval gate preserved — no auto-publish**
- ☐ Claim-scoping / proof-grading **enforced** (not just text generation)
- ☐ Internal vs public outputs separated
- ☐ Wired to the layered structure (traceable, source-linked) — not a throwaway script

## Stack & constraints

Your choice of language/framework. Google Sheets or Notion as the backing store. LLM API allowed and encouraged for carding and drafting