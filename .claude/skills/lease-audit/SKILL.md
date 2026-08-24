---
name: lease-audit
description: Audit a telecom lease document chain — an original ground or rooftop lease plus its amendments, usually as PDFs — and produce the deal file the rest of the toolkit runs on, together with a human-readable audit report. Use when asked to audit, review, or work up a cell site lease, to build a rent history from a lease chain, to extract defined terms from a lease, or to decide whether a site is worth pursuing. Stage 1 of the lease negotiation pipeline.
---

# Lease audit

Read a lease and its amendments. Establish what the documents actually say, decide whether the
site is worth pursuing, and emit two things:

| Output | What it is |
|---|---|
| **`<site>.deal.json`** | The deal file. **Authoritative.** Every downstream tool reads it. |
| **`<site>-audit.md`** | The report a human reviews. Prose, with the arithmetic shown. |

Both, every time. The JSON is what the tools consume; the report is what makes the JSON
reviewable. Neither substitutes for the other.

## Before anything else

Read these. They are the contract you are writing to:

- `schema/deal.schema.json` — the deal file format. Field descriptions carry the reasoning.
- `clauses/clauses.json` — the clause library and its `tenantBenefit` scores.
- `docs/audit-terms.md` — the term registry and what triage means.
- `fixtures/lease-chain/expected-audit.md` — **a worked example of the report format.** Follow its
  shape.

## Hard rules

These are not style preferences. Each one exists because breaking it produces a confident wrong
answer that survives review.

**Never invent a value.** If a page is missing, illegible, or the document is silent, that is a
finding — `absent` or `ambiguous` with a note. It is never a reason to supply what the document
"probably" says. An audit that says *unknown* is complete; one that guesses is worse than useless
because it looks finished.

**Never carry a superseded value forward through an illegible amendment.** If an amendment changes
a figure and you cannot read the new one, the answer is `ambiguous` at `confidence: low` — **not**
the old figure. This is the most common failure and it is silent.

**Distinguish stated from computed.** Every rent figure is one or the other. `stated` means it
appears in a document. `computed` means you derived it by applying an escalator. Long computed
chains inherit every assumption in the derivation; label them and say so.

**Show the arithmetic.** The report must let a reviewer check the rent history by hand. Give the
closed-form check (`1,200 × 1.03⁵ = 1,391.1289`), not just the answer.

**Record how reliably you read it.** `confidence: high | medium | low` on findings, and
`extraction` / `legibility` on sources. A degraded scan is where you are most likely to produce a
plausible wrong reading. Marking it `low` is not failure — it tells the reviewer where to look.

**Never write client content into the repository.** Deal files, quoted lease text and source PDFs
are confidential. Write outputs to `deals/` (gitignored) or a path outside the repo. `fixtures/`
is for invented material only. Set `confidential: true` on any real deal file.

**Do not judge the market.** Triage `financials` is `unknown` unless you have been given market
evidence. Stage 2 (`market.html`) establishes that. Guessing "above market" from a rent figure
invents the finding the market test exists to produce.

## Procedure

### 1. Inventory the documents

Build `documentChain[]` and `audit.sources[]`.

**Record the stated title and the chronological position separately.** They disagree in practice
— a document titling itself "First Amendment" may be chronologically second, and more than one
document in a chain may claim the same title. Order by **date**, not by title. Every later
cross-reference depends on getting this right.

Note anything referenced in the chain but not supplied — a recital naming an amendment you do not
have is a gap in the audit, recorded as `extraction: unavailable`.

### 2. Extract defined terms

Fill `definedTerms` with **provenance**: the term as actually used, which document defined it,
which section, and whether it exists at all.

Do not assume the obvious name. Rent is frequently **not** called "Rent" — "Lease Fee", "Monthly
Rent", "Rental" are all common, and introducing "Rent" into an amendment when the lease says
something else creates two payment obligations on one document.

Mark a term **absent** when the lease never defines it. This matters more than it looks: library
clauses use `{{PropertyName}}` and `{{EquipmentName}}` without defining them, so if the lease
never defined them, those clauses refer to nothing. `boilerplate.capitalized-terms` does not rescue
this — it points at the Agreement, and there is nothing there to point at.

### 3. Build the rent history

`history.rentSchedule[]`, forward from commencement. The careful part. Work through the chain in
date order and apply each instrument in turn.

Five things go wrong here:

**The escalation anniversary is not the amendment date.** If an amendment resets the rent on 1
October but leaves the escalation clause intact, escalation continues on the *original*
anniversary. Escalating from the amendment date puts every later figure wrong.

**A premises expansion is not a rent event.** Additional area at no additional fee changes nothing
in the schedule. Only create a row where the payable amount actually changes.

**A replacement escalator does not stack on the old one.** When an amendment deletes and replaces
an escalation clause, the new rate *supersedes*. Applying both compounds an error that grows for
the rest of the term.

**Options accumulate unless the document says otherwise.** An amendment adding two extension terms
to four existing ones gives six, not two.

**Rounding is usually unspecified.** Rounding each step and compounding unrounded give different
answers over a long chain. State which you used in `history.reconciliation.method`. Where the
difference is material, say so.

**A lease past its last renewal does not stop having a rent history.** If every option has been
exercised or elapsed and the chain supplies nothing further, the schedule does not end at the last
contractual date — the site is still there and money is still moving. Continue the schedule with
`reason: "holdover"` and say in the note what it rests on, then record the holdover terms as
`term.holdover` and carry them into `termsAnalysis` as a risk. A lease with **no holdover provision
at all** is the case that matters: nothing states what governs the tenancy, and that is a finding,
not a gap in the audit.

Two things follow, and both are easy to get wrong:

- **Whether the escalator still runs is a reading of the document, not an assumption you may
  make silently.** Some leases hold the last rate; some keep escalating; most say nothing. Say
  which you applied and why, and mark every holdover row `computed`.
- **Do not model holdover in the comparator.** It already handles this: give it the last
  contractual date as `current.termEnd` with `baselineMode: continue`, and it flags every payment
  after that date as `assumed` — the do-nothing baseline then reads as resting on a continuation
  assumption rather than an obligation, which is exactly what it is. The audit and the history are
  where holdover is recorded; the comparator needs nothing added for it.

Leave `history.payments` empty unless a payment record was supplied. Its absence means the
over/under-payment question is **unanswered**, not answered "no". Never populate it from the
contractual schedule — that would make reconciliation compare a thing to itself.

### 4. Record the terms

Fill `audit.terms{}` against the registry in `docs/audit-terms.md`, each with `status`,
`confidence`, `documentRef`, `sectionRef`, and `verbatim` where a reviewer would want the exact
words. Unknown ids warn rather than fail — add one if a lease addresses something the registry
does not cover, and say so in the report.

### 5. Analyse the terms against the clause library

`audit.termsAnalysis`. For each library clause that could apply to this site, compare what the
lease has.

Read from the **tenant side** — the library is scored that way. Site facts move the score: a
rooftop clause is irrelevant on a tower, and interference matters far more on a shared site.

Two states are easy to miss and both matter:

**`present-better`.** The lease beats the library. You are looking for gaps, so you will find
gaps; a provision more favourable than the library's own position is a thing to **defend**, and
raising it in negotiation risks losing it. Flag these explicitly and consider
`priority: do-not-raise`.

**`unclear`.** The document is ambiguous. That is a finding, not a blank.

The **gap is the case**. A lease missing several clauses scored `+3` is worth pursuing on terms
even where the rent is at market, which is why triage treats terms and financials independently.

### 6. Triage

`audit.triage`. The audit's first job is deciding whether stages 2–8 happen at all, and **most
sites should stop here.** A lease at market with clean terms is a completed audit, not a failed
one.

- `financials` — `unknown` unless given market evidence.
- `terms` — `problematic` on its own is sufficient to pursue.
- `recommendation` — `pursue`, `monitor`, or `no-action`. `monitor` means nothing now but
  something later, usually an NNR or option deadline approaching.
- `rationale` — always. A recommendation nobody can review is not a recommendation.

### 7. Emit both outputs

**The deal file.** Validate it: every enum against the schema, every date real (`2027-13-45`
parses into a real Date and is still wrong), `current.baseRent` equal to the last `rentSchedule`
row, `finalTermEnd` not before `currentTermEnd`. Set `stage: "audit"` and `confidential: true`.

**The report.** Follow `fixtures/lease-chain/expected-audit.md`:

1. Document chain — stated titles and chronological order side by side
2. Rent history — the table, with the arithmetic checks
3. Defined terms — with the absent ones called out
4. Terms analysis — the gaps, and anything the lease does better
5. Low-confidence findings — what you could not read, and what it affects
6. Term and options
7. Triage and rationale

Lead the report with anything that changes the recommendation. A reviewer should be able to stop
after the first screen and know whether to proceed.

## Before you finish

- [ ] Every rent figure labelled `stated` or `computed`, with the arithmetic shown
- [ ] Chronological order derived from **dates**, not titles
- [ ] Defined terms carry provenance; absent ones marked absent
- [ ] Nothing illegible silently replaced by a superseded value
- [ ] If the last term has elapsed, the schedule continues with `reason: "holdover"` and the
      holdover terms — or their absence — are recorded as a finding
- [ ] `financials` is `unknown` unless market evidence was supplied
- [ ] `present-better` findings identified, not just gaps
- [ ] Deal file validates; `confidential: true`; written outside the repo or to `deals/`
- [ ] No client content anywhere under version control

## Testing

`fixtures/lease-chain/` is a synthetic chain with a known-correct answer in `expected-audit.md`.
Run against it and compare. Differences are either an agent bug or a fixture that needs
correcting — both worth knowing.

It exercises **reasoning, not extraction**: the files are text, and production input is PDF.

## Not built yet

**Payment reconciliation.** `history.payments` and `history.reconciliation` are shaped but unused.
When built, the method is fixed: run `src/lease-engine.js` over `rentSchedule` to produce the
expected schedule and diff against actuals. **The same engine that prices proposals** — a second
implementation of escalation would disagree with the first, and the disagreement would be mistaken
for a variance.

**Database corroboration.** No access yet. When it arrives, records join `audit.sources[]` as a
corroborating source. An audit performed from documents alone is complete, not provisional — the
database confirms or contradicts, it does not supply what the documents already say.
