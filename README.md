# Cell Site Lease Negotiation Toolkit

Tooling for commercial telecom lease negotiations — cell site ground leases, rooftop leases,
and amendments. Audit a lease chain, test the rent against a market band, price the scenarios,
build a negotiating position, draft the amendment as a real `.docx`, review every redline round,
and assemble the package that goes to leadership before signature.

**Everything opens from disk.** No server, no build step, no `npm install`, no dependency to fetch.
A `.docx` is written by hand because a `.docx` is a zip of XML; a returned one is read back with
the browser's own `DecompressionStream`.

**Two stages run as Claude skills.** `lease-audit` reads the document chain and emits the deal file;
`negotiation-playbook` turns the audit and the pricing into a position. The rest are browser tools.

> **The clause library is unreviewed drafting and the market data is illustrative.** Both are
> scaffolding that makes the tools runnable, not house positions. See
> [Not legal advice, and not a valuation](#not-legal-advice-and-not-a-valuation) below.

## The pipeline

One job in eight stages, plus a half. The arrows marked **re-entry** are where a human currently retypes data
that already exists upstream; closing them is the point of this repo.

```
  original lease + amendments + governing documents + stored data
        |
        v
 1  AUDIT ─────────────── LLM / agent / skill, with human review
        |                 Reads the document chain and records what it says:
        |                 terms, defined terms, dates, rights, rent history.
        |                 TRIAGES: unfavourable financials or bad terms?
        |                 If neither — stop here. Most sites should.
        |
        |  ONE deal file out, serving three consumers:
        |     financials ──────────────> the comparator
        |     equipment, area, location > the market test
        |     defined terms, parties,
        |     site id, location ───────> amendment drafting
        v
 2  MARKET TEST ───────── market.html
        |                 Is this a strong candidate for rent reduction?
        v
 3  COMPARISON ────────── Lease-Proposal-Comparator.html
        |                 Price scenarios; build a financial proposal.
        v
 3.5 PLAYBOOK ────────── negotiation-playbook skill
        |                 What to ask for, in what order, what it is worth,
        |                 what the landlord will say and the answer to it,
        |                 and WHERE THE WALK-AWAY SITS. Needs both the audit
        |                 and the comparator, so it sits after both.
        v
 4  INTERNAL REVIEW ───── human, then higher-ups if needed, then the client.
        |                 Approves the POSITION, not just the number.
        v
 5  NEGOTIATION ───────── to the landlord. Their counters go back into the
        |     ^           comparator to see what actually moved.
        |     └───────────────────────────── loops to 3
        v
 6  DRAFTING ──────────── amendment or new lease
        |                 ⚠ MAY HAPPEN BEFORE 5 — see below
        v
 7  REDLINE ───────────── redline.html — exchange on all terms. Flags
        |     ^           deviations in landlord redlines and tracks risk
        |     └────────── AS IT GOES, not once at the end
        v
 8  FINAL REPORT ─────── report.html — to leadership, finance, risk
                         management, legal. Market test + comparator +
                         accumulated risk assessment, for final review.
```

Four things follow from the shape:

**The audit is a gate, not just a data-entry step.** Its first job is deciding whether steps 2–8
happen at all. A site with fair financials and clean terms should stop at stage 1.

**Drafting is not fixed after negotiation.** Where the ask is essentially rent, the proposal to
the landlord can just be a rent proposal and drafting waits. Where *terms* drive the negotiation,
or the landlord asks for a draft, stage 6 runs first. The stage list is the usual order, not a
sequence the tooling should enforce.

**Deviation tracking is continuous.** Every redline round is reviewed as it arrives — that is
where a bad change is cheapest to reject. The accumulated record is what feeds stage 8; it is not
a single pass bolted on at the end.

**After stage 6 the document, not the clause library, is authoritative.** Redlining moves the
language away from the library by design, and pulls in terms from proposals made after the draft.
The library is where the document *started*, not a description of what it became.

## The drafting principle

An amendment should **keep in line with the document it amends**: reuse the terms that lease
already defines, and avoid changes that would read as a shock to the existing arrangement —
unless the proposal genuinely is a significant change.

This is not politeness. Every gratuitous redefinition is a place the landlord's counsel can find
an inconsistency, and every unnecessary structural change is a reason to reopen something already
settled. It is also what `definedTerms` provenance and the clause library's `conflictsWith` graph
exist to support.

**The drafting stage emits a real `.docx`.** Written directly, with no dependency and no build
step — a `.docx` is a zip of XML, and the zip is written with STORE, which Word accepts. **Mail
merge is not a requirement** and nothing here depends on it: clause text is plain text with
role-named `{{Placeholders}}`, and `clauses/placeholders.json` records the form each value must
take, because a value is dropped verbatim into legal prose and `3000000` reads as
"limits of not less than 3000000".

**The playbook is a skill, not a tool, and that split is deliberate.** A PV is a PV, so the
comparator is a tool. An argument that persuades *this* landlord about *this* site is judgement, so
the playbook is a skill — templated prose reads as templated, and a negotiator who sees generic
text stops reading. But the parts that recur live in `negotiation/positions.json` as data, checked
like the clause library, and **every figure comes from the comparator through the deal file.** A
playbook that works out its own present values will disagree with the model it came from, and the
validator refuses a figure with no stated source.

The walk-away is the point of it: `baselinePV` is the present value of doing nothing, so a counter
costing more than that is worse than no deal. Arithmetic, not nerve.

**A playbook is the most sensitive file in the system.** It carries the concession sequence and the
walk-away number. A comparator result reaching a landlord is embarrassing; a walk-away number
reaching a landlord loses the negotiation outright. Never in the repo, never in anything a
counterparty sees.

**Every clause stays selectable at every stage, and the audit only sets the order.** Drafts,
originals and redrafts all need the whole library: a redraft routinely needs a term nobody raised
in round one. What the audit changes is prominence, not availability — its findings sort to the
top, worst first.

**The audit finds problems one term at a time; a draft trades across them.** So the drafter also
surfaces the terms a selection drags in with it, from `clauses/impacts.json`. Propose a longer term
and it puts termination on the table even where the audit recorded nothing against it — a longer
term without an exit is worse than the shorter one it replaced, and no audit finding would ever
say so, because there was no finding to make.

**Drift is two problems, and the returned `.docx` answers both.** `redline.html` reads the file
directly — text, formatting, comments, and **tracked changes if they used them**, which beats
diffing because it is what they did rather than what a comparison infers. Formatting findings join
`deviations[]` with `kind: "formatting"`, so they go through the same accept/reject discipline.

**A PDF is inspected, not extracted, and that is a decision.** A PDF carries no styles, so it can
never answer the formatting question — and without a `/ToUnicode` map, extraction produces
plausible-looking wrong text rather than an error, which would feed false findings into the one
place a reviewer's trust matters most. See [docs/ingestion.md](docs/ingestion.md).

**Formatting is a spec, not a habit.** [`docs/document-format.md`](docs/document-format.md) records
the house style and `src/docx-style.js` holds it as data. Every paragraph in the generated document
carries a named style and nothing else, which is the invariant the drift argument rests on: if our
own document contains no direct formatting, then direct formatting in a returned document is by
construction something a person added.

## What is here

| Path | What it is |
|---|---|
| `.claude/skills/lease-audit/` | The audit agent. Reads a lease chain, emits the deal file and an audit report. |
| `.claude/skills/negotiation-playbook/` | Stage 3.5. Turns the audit and the comparator into a position: asks, counters, ladder, walk-away. |
| `negotiation/positions.json` | The half of a playbook that recurs on every site — standard landlord objections and the answers. |
| `fixtures/lease-chain/` | Synthetic lease + amendments with a known-correct answer, for testing the agent. |
| `deals/` | Where audit output goes. Gitignored — deal files describe real sites. |
| `market.html` | Site Rate Builder. Audit-stage screening: is this lease out of line, and what should we open at. |
| `Lease-Proposal-Comparator.html` | The financial model. Open it from disk; no server, no install. |
| `draft.html` | Amendment Drafter. Assembles the amendment from the clause library and **refuses to produce a document with an unresolved reference in it**. |
| `redline.html` | Redline Review. Compares what came back against what we sent, and **will not let a change pass unseen** — every finding needs a decision. |
| `report.html` | Final Report. Assembles the package for leadership, finance, risk and legal, and **will not produce one while a change is still undecided**. |
| `src/lease-engine.js` | Escalation, proration and payment-period logic. The single calculation engine. |
| `src/redline-compare.js` | Token diff, paragraph alignment and the signals that say what a change *does*. |
| `src/final-report.js` | The two stage-8 gates, and what the package is judged to contain. |
| `src/docx-style.js` | The house style, as data. One object the writer emits and the checker will measure against. |
| `src/docx-writer.js` | A real `.docx` — STORE zip and OOXML, no dependency. |
| `src/docx-read.js` | Reads a returned `.docx`: text, tracked changes, comments, formatting. Triages a `.pdf`. |
| `src/docx-conform.js` | Measures a returned document against the house style. Numbering first. |
| `src/lease-validate.js` | Deal-file validation with a collect-all-errors report. |
| `schema/deal.schema.json` | The deal file — the format every component reads and writes. |
| `clauses/` | Clause library: `clauses.json`, one plain-text file per variant, and `impacts.json` — which terms drag which other terms in. |
| `market/market-rates.json` | Market rent bands, adders and space rates. **Illustrative** — supply your own. |
| `market-builder.html` | Builds a rate file from a CSV export of any spreadsheet. |
| `docs/` | Schema, conventions, document format, audit term registry, term checks. |
| `fixtures/` | Synthetic deal files for testing. Never real sites. |
| `test/tests.html` | Test runner. Open it from disk; all expected values are hand-checkable. |

## Running it

Everything opens directly from the filesystem. There is no build step, no `npm install`,
and no dependency to fetch.

- **The rate builder** — open `market.html` in a browser.
- **The comparator** — open `Lease-Proposal-Comparator.html` in a browser.
- **The drafter** — open `draft.html` in a browser.
- **The redline reviewer** — open `redline.html` in a browser.
- **The final report** — open `report.html` in a browser.
- **The tests** — open `tests.html` in a browser. Green means every case passed.

Two generated bundles exist because `fetch()` is blocked over `file://`, so a page opened from
disk cannot read a `.csv` or `.json` beside it. Regenerate after changing their sources —
`check-clauses.ps1` catches a stale clause bundle, and the market CSVs change rarely enough to
watch by hand:

```bash
pwsh -File tools/build-clause-data.ps1
pwsh -File tools/build-market-data.ps1
```

### Admin mode

**Ctrl+Shift+A** in either tool, or open it with `?admin=1`. The setting is shared, so both tools
are in the same mode at once, and it is remembered per machine.

It hides things that are useful but would be unhelpful in front of a landlord — a button that
silently replaces the screen, or a theme switch that changes the house style mid-negotiation:

| | Comparator | Rate builder | Drafter | Redline |
|---|---|---|---|---|
| Light / dark theme | ● | ● | ● | ● |
| Load worked example | ● | ● | | ●¹ |
| Save / load defaults | ● | | | |
| Band derivation | | ● | | |

¹ The redline reviewer's worked example is not hidden behind admin mode — it is
synthetic, it carries no house position, and it is the fastest way to see what the
comparison actually reports.

Dark is the default. **Printing always forces light**, so the theme never affects a paper copy.
The choice lives in `localStorage`, never in the deal file, so opening someone else's deal does
not drag their theme along with it.

Both stylesheets hold one invariant — no raw hex outside the token blocks, or a colour will not
flip. It is quiet when broken (the page still renders; only the light-mode user sees a dark
patch), so it is checked:

```bash
pwsh -File tools/check-theme.ps1
```

The comparator loads `src/lease-engine.js` with a classic `<script src>`. This was verified to
work over `file://` in Firefox 153 from a path containing a space, including from a
subdirectory. Firefox is the strict case — since v68 it confines `file://` reads to the
document's own directory and below — so Chrome and Edge, which are more permissive for classic
scripts, also work. **Do not convert the engine to an ES module**: `type="module"` *is* blocked
over `file://`, and that would reintroduce a build step.

## Confidentiality

**No real lease data belongs in this repo — not in the working tree, not in history.**
No client rents, addresses, party names, site names, FANs, or executed documents.

`.gitignore` denies `.docx`, `.xlsx`, `.pdf` and saved deal files by default. Anything needing
sample data uses a synthetic fixture in `fixtures/`.

Three specific traps worth knowing:

1. **A Word template carries cached merge results.** A landlord name, site address, site name, FAN,
   rent and escalator sit inside the `.docx` itself even with no merge run, so a naive text
   extraction carries all of it. `check-clauses.ps1` looks for the *shape* of a merged value where a
   placeholder belongs — never a denylist of real names, because a file listing real names would
   itself be the leak.
2. **Saved comparator projects describe real sites.** They match `*.deal.json` and `deals/` and are
   ignored. Only `fixtures/*.json` is tracked.
3. **A playbook is the most sensitive file the toolkit produces.** It holds the concession sequence
   and the walk-away number. A comparator result reaching a landlord is embarrassing; a walk-away
   number reaching one loses the negotiation.

**History was rewritten before this repository was made public.** An earlier version tracked a
market rate workbook and 33 clauses extracted from a real amendment template. Both are gone from
every commit, not merely deleted at the tip — removing a file in a later commit leaves it fully
recoverable in the earlier ones, which is not removal.

## Decisions worth knowing

**One calculation engine.** Escalation, proration and payment-period logic live in
`src/lease-engine.js` and nowhere else. If you find yourself reimplementing a day-count or an
escalation step, that is a bug.

**The two gates are opposites, on purpose.** The drafter *refuses* — it will not emit a document
with an unresolved reference in it, and `assemble()` returns nothing rather than trusting a
disabled button. The redline reviewer refuses **nothing**: the landlord is entitled to ask, and
most of a redline is fine. What it will not do is let a change pass **unseen**. Every finding has
to be accepted or rejected by a person, and the count of undecided ones is what stage 8 reads.
A rejected deviation is closed — someone looked and said no. An unread one is not.

Two consequences worth knowing:

- **Round N is compared against round N−1, not against the original draft.** Comparing every round
  to the first draft re-reports everything already dispositioned, which is exactly how a reviewer
  learns to skim the list. `redline.rounds[].comparedTo` records what each round was diffed against.
- **A clean run is not a clean document.** It means no pattern the tool knows about fired and no
  figure moved. It cannot read a sentence and tell you an obligation now runs the wrong way.

**Stage 8 has two gates, and collapsing them would break it.** The package cannot be *produced*
while any deviation is undecided — but it is producible before anyone has signed it off, because
the package is what goes *to* the reviewers. Signature is the second gate, and it waits for all
four functions. Refusing to produce the report until it had been reviewed would be circular;
treating an unreviewed contract as ready would be worse.

The check that earns its place is the smallest one: legal drafting states a figure twice —
*one hundred eighty (180) days* — and **where the two disagree, the words control**. An edit that
changes the digits and leaves the words produces a term that means the opposite of what was
negotiated, and it survives review because the reader checking numbers reads the parenthetical.
That check needs no diff at all.

**The rate builder is deliberately not part of the comparator.** They answer different questions
at different stages. `market.html` asks *"is this lease out of line, and what should we open at"* —
a screening question, asked at audit time, before you have decided what to propose. The comparator
prices scenarios you have already chosen. Folding the build-up into the comparator would put it
after the decision it exists to inform, and would bolt a second UI onto an already dense one.

There is also a correctness reason. The comparator's **effective monthly is a PV-derived figure**
with a discount rate baked in; the market bands are **nominal current dollars**. Putting them side
by side yields a ratio that looks meaningful and is not. `market.html` compares only against the
rent *currently payable*, which is like-for-like. Keep it that way.

The two connect through the deal file, not through code: `market.html` writes `marketBenchmark`
and `equipment`, and the comparator reads the same file.

**The market data ships as a shape, not as a dataset.** It used to be a tracked spreadsheet
exported to three CSVs. It is now one JSON file carrying **inputs only** — published low and high
per metro, one baseline per item — with every band computed at load by `src/market-derive.js`.

The workbook stored inputs and outputs side by side, and five of the six tier columns on every
equipment row were the baseline times a multiplier: derivable, already unused by the tool, and free
to drift out of agreement with the number they came from. A file cannot contradict itself about a
number it does not contain.

**What ships is illustrative.** 19 metros drawn from published sources plus 4 benchmark bands, with
a `conservative` stance recorded in the file itself. Nothing in it is invented and none of it is a
valuation — it is a starting point that lets the tools run out of the box. Build your own with
`market-builder.html`; see [docs/market-data.md](docs/market-data.md).

**The screening formula is not the engine, on purpose.** The rent schedule's Site Rate Builder
escalates with `rent * (1 + r)^years` — whole years, no dates, no proration, no payment cycle.
That is correct for screening a portfolio and wrong to unify with the engine, which would demand
inputs a screening pass does not have. See `docs/conventions.md`.

**The precursor workbooks are out of scope and untracked.** Spreadsheets were used to build the
comparator and the original rent schedule. They are not competing sources of truth, and none of
them is in this repository.

## Status

Every stage of the pipeline has tooling. **152 tests**, four checks, all passing.

| Stage | State |
|---|---|
| 1 Audit | `lease-audit` skill — **never run against its own fixture** |
| 2 Market test | `market.html` |
| 3 Comparison | `Lease-Proposal-Comparator.html` |
| 3.5 Playbook | `negotiation-playbook` skill |
| 4 Internal review | human — needs no tooling |
| 5 Negotiation | loops back to 3 |
| 6 Drafting | `draft.html` → a real `.docx` |
| 7 Redline | `redline.html` — reads the returned `.docx` |
| 8 Final report | `report.html` |

### Known gaps, stated plainly

- **The audit skill has never been run against `fixtures/lease-chain/`**, which has a known-correct
  answer waiting in `expected-audit.md`. Oldest loose end here.
- **Payment reconciliation is unbuilt.** The shape is defined and the method is fixed — run the
  engine over `history.rentSchedule` and diff against `history.payments` — but the payment record
  usually does not exist.
- **No database corroboration.** When it arrives, records join `audit.sources[]` as a corroborating
  source rather than replacing anything.
- **A PDF is triaged, not extracted.** Deliberate: a PDF carries no styles, so it can never answer
  the formatting question, and unreliable extraction would feed false findings into the redline.
  See [docs/ingestion.md](docs/ingestion.md).
- **The playbook copies figures** from a comparator run rather than recomputing them. `basedOn`
  makes staleness detectable; a viewer would make it impossible.
- **`negotiation/positions.json` covers 14 of 30 categories.** The rest fall back to the audit
  finding, which is thin rather than broken.

Failure modes seen in real amendment templates, and how the tooling designs them out, are in
[docs/drafting-traps.md](docs/drafting-traps.md).

## Not legal advice, and not a valuation

This repository contains contract drafting and market rate data. Both are covered by the warranty
disclaimer in [LICENSE](LICENSE), and three things are worth stating plainly on their own:

**The clause library is unreviewed drafting.** Every clause is composed from published market
practice. None of it has been used in an executed document and none of it has been reviewed by
counsel. It is scaffolding that makes an amendment buildable. Have a lawyer read anything before it
reaches a counterparty.

**The market rate file is illustrative**, derived from public information. It is a small set of
published figures, shipped so the tools run out of the box.

**The checks are mechanical.** A clean redline run means no pattern the tool knows about fired; it
cannot read a sentence and tell you an obligation now runs the wrong way.

Nothing here creates a lawyer-client relationship.

## Contributing

The checks are the contract. Run them before committing anything:

```bash
pwsh -File tools/check-clauses.ps1     # 11 gates on the clause library
pwsh -File tools/check-positions.ps1   # negotiating positions resolve
pwsh -File tools/check-market.ps1      # rate file is inputs-only and honest about its stance
pwsh -File tools/check-theme.ps1       # no raw hex outside the token blocks
```

Then open `tests.html` from disk. Green means every case passed; the summary names any that did not.

### Put the checks in front of the push

Everything above is advisory until you install the hook. One command per clone —
`.git/hooks/` is not tracked, so this is how a hook survives cloning at all:

```bash
git config core.hooksPath tools/hooks
```

[`tools/hooks/pre-push`](tools/hooks/pre-push) runs the four checks and a confidentiality gate, and
refuses the push if a denied format (`.docx`, `.xlsx`, `.pdf`, `.tif`), a deal file outside
`fixtures/`, or a deal file marked `confidential: true` appears in **any commit being pushed** —
not merely at the tip.

That distinction is the whole point. A file deleted in a later commit is still public the moment an
earlier commit carrying it is pushed, and a push cannot be retracted: GitHub caches commits, forks
retain them, and the API can serve orphaned objects long after a force-push. Every other check here
is one you can rerun. This is the one that has to be right the first time.

Two rules that are not obvious:

**Never commit real lease data.** Not in the working tree, not in history. `.gitignore` denies
`.docx`, `.xlsx`, `.pdf` and saved deal files by default. Anything needing sample data uses a
synthetic fixture.

**Regenerate the bundles after touching their sources.** `fetch()` is blocked over `file://`, so
`clauses/clause-data.js` and `market/market-data.js` ship the JSON as script assignments.
`check-clauses.ps1` catches a stale clause bundle; the market one changes rarely enough to watch by
hand.
