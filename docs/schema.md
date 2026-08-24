# The deal file

One file describes one site. Every component reads and writes it, so a value entered once
travels: audit → comparison → merge data → drafted amendment.

`schema/deal.schema.json` is authoritative and carries a description on every field. This document
covers what a JSON Schema cannot express — units, boundaries, and the rules you have to know to
avoid producing a plausible wrong number.

## Shape

```
schemaVersion      "1.0"; absent means legacy
confidential       true for a real site; fixtures are false
glob               analysis settings: window, discount rate, assumed CPI, baseline mode
current            the lease as it stands
proposals[]        one per scenario being priced

site               FAN, name, address, landlord, tenant        } identity and audit;
documentChain[]    original + every amendment                  } none of this affects
definedTerms       the ten capitalized terms, with provenance  } a calculation
sectionMap         which section governs what
term               commencement, current end, final end, NNR
options[]          unexercised renewal options
rent               sourced figures + a reconciled one
equipment[]        installed unit counts
marketBenchmark    contract vs indicated market rent
audit.terms{}      findings, keyed by term id (open map)
clauseSelection[]  chosen clause variants
```

Only `glob`, `current` and `proposals` are required. Everything else is additive, so a file saved
by the comparator before any audit exists is still valid.

## Units — the part that bites

**Every rate the engine handles is monthly.** Annual figures are divided by twelve at the
boundary; results are always monthly.

**Percentages are whole numbers in the file, fractions in the engine.** `ratePct: 3` means 3%.
The conversion happens in exactly one place — `normEsc()` — which also renames the fields:

| In the file (UI shape) | In the engine | Conversion |
|---|---|---|
| `ratePct: 3` (`fixed_pct`) | `rate: 0.03` | ÷ 100 |
| `ratePct: 400` (`fixed_amount`) | `rate: 400` | **none** — dollars per month, not a percent |
| `floorPctIn: 2` | `floorPct: 0.02` | ÷ 100 |
| `capPctIn: 4` | `capPct: 0.04` | ÷ 100 |
| `discountRatePct: 6.5` | `discountRate: 0.065` | ÷ 100 |
| `assumedCpiPct: 3` | `assumedCpi: 0.03` | ÷ 100 |

The file keeps the UI shape because saved files already use it and hand-editing a project file is
a supported workflow. **Do not convert on load.** If you find a second place doing `/100`, that is
a bug.

`ratePct` doing double duty — percent for `fixed_pct`, dollars for `fixed_amount` — is the sharpest
edge in the format. It is retained for compatibility with existing files.

## Dates

`yyyy-mm-dd`, or empty meaning "inherit / not established". All arithmetic is UTC.

The pattern in the schema only checks the shape. Calendar validity is checked by the validator,
because `Date.UTC` silently rolls overflow over: `2027-13-45` parses into a real Date in
January 2028. A regex cannot catch that; reformatting and comparing can.

**`termEnd` is the last day of occupancy, as the document states it** — not the day after. The
engine converts to an exclusive bound internally (`effEnd`). Entering the day after shifts every
downstream period by one day.

## Two dates that are not the same date

`term.currentTermEnd` is when the term now running ends.
`term.finalTermEnd` is when the lease ends if every remaining option is exercised.

The comparator's single `termEnd` cannot express both, which is why `glob.baselineMode` exists as
a proxy. With `options[]` populated, "do nothing" becomes a real calculation instead of a guess.

## Rent has provenance

`rent.figures[]` records each figure with where it came from — `audited` (read from the
documents), `offered` (the letter or proposal), `negotiated` (agreed in discussion), `books` (the
payables system). They disagree, and the disagreement is a finding rather than noise to average
away. `rent.reconciled` records which one was chosen and why.

This is separate from `current.baseRent`, which is what the engine actually prices: **the rent
payable at `glob.windowStart`**, after every escalation that has already happened. Not the
original commencement rent.

## The audit block is deliberately open

`audit.terms` is a map keyed by term id. The schema constrains the *shape* of an entry and never
the set of ids, because the audit phase is not yet designed. An id absent from
[audit-terms.md](audit-terms.md) warns rather than errors.

`status` is required and carries real information: `found`, `absent`, `ambiguous`. **`absent` is a
finding, not a blank** — a clause that assumes a term the lease never defined produces language
referring to nothing.

## Escalators, and the one-time step

An escalator row describes one escalation regime. Multiple rows describe a lease that changes
formula partway through.

`cadenceMonths: 0` is a **one-time step**: applied once on `firstAdjustment`, never repeated.
Combined with `type: "fixed_amount"`, that is how a permanent mid-term rent change — an equipment
addition — is expressed. There is no separate event type for it.

Three limits worth knowing, all pinned by tests:

1. It expresses a **delta**, not an absolute reset. "Rent becomes $X" has to be entered as the
   difference, which breaks if an upstream escalator changes.
2. A step dated exactly on the regime start is **dropped** (`buildRateEvents` requires
   `anchor > start`).
3. When a `%` escalator and a `$` step land on the same date, **row order decides** which applies
   first. Order the rows deliberately.

## Legacy files

A file with no `schemaVersion` is treated as pre-v1. It loads, and the validator says so rather
than refusing.

One behavioural change affects legacy files: `paymentDayRule` defaults to `anchored`. Files
saved before it existed were effectively `clamped`. This only differs when the payment anchor
falls on day 29, 30 or 31, and the validator warns explicitly in that case, naming the old and new
payment dates. See [conventions.md](conventions.md).
