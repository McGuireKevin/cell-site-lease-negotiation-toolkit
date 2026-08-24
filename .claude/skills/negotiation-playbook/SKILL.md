---
name: negotiation-playbook
description: Build or revise the negotiating position for a telecom lease — what to ask for, in what order, what each ask is worth, what the landlord will say and the answer to it, and where the walk-away sits. Use after the audit and the comparator have run, when preparing to open a negotiation, when a landlord has pushed back and the position needs revising, or when asked for negotiation strategy, talking points, counterarguments or a fallback position on a lease. Stage 3.5 of the lease negotiation pipeline.
---

# Negotiation playbook

The audit says what is wrong with the lease. The comparator says what fixing it is worth. This
turns both into a position: what to ask for, in what order, and what to do when the landlord says
no.

| Output | What it is |
|---|---|
| **`playbook` block in `<site>.deal.json`** | Structured. Travels with the deal into redline and the final report. |
| **`<site>-playbook.md`** | The brief a negotiator reads. Prose, ordered for a conversation. |

Both, every time. The JSON is what later stages consume; the brief is what someone actually takes
into the room.

## Before anything else

Read these:

- The deal file. **If `audit.triage.recommendation` is `no-action`, stop and say so** — there is no
  negotiation to prepare for, and building a playbook implies one.
- `negotiation/positions.json` — the standard objections and counters, keyed by clause category.
- `clauses/impacts.json` — what trades against what.
- `clauses/clauses.json` — `tenantBenefit` scores, and the clause that would give effect to an ask.

## Hard rules

**Never invent a number.** Every figure comes from the comparator, through the deal file, and
carries `worthNote` saying which run. A playbook that works out its own present values will
disagree with the model it came from, and two documents in one deal file disagreeing about money is
worse than having neither. Where a point cannot be priced — most terms cannot — leave `worth` blank
and say why. **A blank is an honest answer; a plausible number is not.**

**Never invent market evidence.** If `marketBenchmark` is absent, the entitlement argument on rent
is `unknown`, not "probably above market". The market test exists to produce that finding and
guessing it invents the thing it was going to establish.

**Respect `do-not-raise`.** Where the audit recorded `present-better`, put the subject in
`doNotRaise` with the reason and leave it out of `points` entirely. Raising co-location on a lease
that permits it with no revenue share invites the landlord to price something they are currently
giving away, and the question cannot be un-asked.

**Raise everything in the first round.** A term introduced in round three reads as bad faith and
reopens what was settled. If a point is worth making, it goes in `points` now with a rank, even if
it ranks last.

**Say which arguments are borrowed and which were written for this site.** `anticipated[].source`
is `positions` or `site`. A reviewer needs to know which parts have been used before.

**The walk-away is arithmetic.** It is `baselinePV` — the present value of doing nothing. A counter
costing more than that is worse than no deal. Do not soften it into a judgement.

**Never write a playbook into the repository.** It contains the concession sequence and the
walk-away number. Write to `deals/` or outside the repo, and set `confidential: true`.

## Procedure

### 1. Establish what you are working from

Fill `basedOn`: the comparator window, discount rate, proposal ids, and the dates the comparator
and market test were run. This is what makes staleness detectable later — **if the proposals or the
window have moved since, the playbook describes a deal that is no longer on the table.** Say so at
the top of the brief rather than quietly regenerating.

Record `baselinePV` and `targetPV` from the comparator run. If the deal file carries no comparator
output, ask for it rather than estimating.

### 2. Build the points

One point per subject worth raising. Sources, in order:

1. **`audit.termsAnalysis.findings`** — `absent`, `present-weaker` and `unclear`, excluding
   `do-not-raise`. Rank by `priority` then `gap`.
2. **The financial case** — where `marketBenchmark.flag` is `above`, rent and escalator are points
   whether or not the terms analysis mentions them.
3. **`clauses/impacts.json`** — subjects the audit never flagged that the above drag in. A term ask
   without a termination ask is the standard error: a longer term without an exit is worse than the
   shorter one it replaced.

For each point set `ask`, `entitlement`, `worth` + `worthNote`, `ladder`, `tradeFor`, `priority`,
and `anticipated` from `positions.json` plus anything site-specific.

**Order them for a conversation, not by value.** Open on terms rather than rent: a rent ask invites
a rent counter and the conversation never leaves the number. Where the audit found only a financial
case and clean terms, say that plainly instead of manufacturing term asks — a landlord who spots a
padded list stops believing the real items.

### 3. Make the arguments site-specific

This is the part `positions.json` cannot do. The standard counter is a starting point; the version
that persuades uses this site's facts.

- A municipal lessor with a public-safety mandate is not a tower company. Read the lease's own
  language back to them — a landlord-form lease with an emergency-removal right has told you what
  it cares about.
- Use what the audit found. "The escalator has been raising it every year" is an argument; "625 in
  1998 is 1,270.50 now, computed across 24 escalations" is the same argument that cannot be waved
  away.
- Where a finding is `low` confidence, do not build a headline argument on it. It will not survive
  the first request for evidence.

### 4. Decide the concession order before the call

Fill `concessionOrder`: what is given, in what order, and what each purchase buys. A concession made
in the order the landlord pushes is a concession made for nothing.

Use `tradeFor`. Term is the usual currency, and the escalator floor is usually the cheapest thing to
give.

### 5. On revision, record what actually happened

When the landlord has pushed back, do not rewrite history. Append to `pushback`:

- `said` — their words, as close to verbatim as the record allows
- `response` — what was said back
- `outcome` — `held`, `conceded`, `traded`, `deferred`, `unresolved`
- `movedTo` — the revised position
- `newObjection: true` where it was not in `positions.json`

Then update the affected `points[].status`. **Keep `anticipated` and `pushback` apart.** One is what
we expected before the conversation; the other is what happened. Collapsing them destroys the only
signal that says whether the position file is any good.

**Flag every `newObjection` in the brief.** Those are the ones worth folding back into
`negotiation/positions.json`, and that is how the file improves.

### 6. Emit both outputs

The brief follows the order of the conversation:

1. Where this stands — round, what it is based on, and whether that is stale
2. **The walk-away number**, stated once, near the top
3. The asks in order, each with entitlement, worth, the objection and the answer
4. What we will concede, and what it buys
5. What we are not raising, and why
6. What changed since the last round, on a revision

## Before you finish

- [ ] Every figure traceable to a comparator run via `worthNote`
- [ ] `baselinePV` recorded — the walk-away is stated, not implied
- [ ] `marketBenchmark` absent means the rent entitlement says `unknown`
- [ ] Every `present-better` finding is in `doNotRaise` with a reason, and in no point
- [ ] Every point that will be raised is in this round
- [ ] `anticipated[].source` set on each — borrowed or written here
- [ ] `pushback` appended to, never rewritten
- [ ] `confidential: true`, written outside the repository

## Not built yet

**Live recomputation.** The brief carries figures copied from a comparator run. A `playbook.html`
viewer would recompute them the way `report.html` does, and would make staleness impossible rather
than merely detectable. Until then `basedOn` is the guard, and it only works if it is filled in
honestly.

**Learning from `pushback`.** Objections marked `newObjection` are collected but nothing folds them
back into `positions.json` automatically. That is deliberate for now — a position file that grows
by itself, without a human deciding the counter is any good, is a file nobody can trust.
