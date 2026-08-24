# Audit term registry

> **Status: provisional.** The audit phase has not been designed yet. This is a starting
> inventory of standard telecom lease terms, assembled so the deal file has somewhere to put
> findings — not a settled specification. **Expect it to be wrong in places.** Correcting it
> should be cheap, and the design below is what keeps it cheap.

## Who performs the audit

An **LLM, agent or skill**, with a **human reviewing**. An agent-produced audit is not finished
until someone has read it, which is why `audit.auditedBy` and `audit.reviewedBy` are separate
fields rather than one.

Inputs are the original lease, its amendments, any associated governing documents (assignments,
memoranda, SNDAs, estoppels) and linked records from stored data. `audit.sources[]` records what
was actually read — filenames and record ids only, never content.

## The audit is a gate, not just data entry

Its first job is deciding whether anything downstream happens at all, and that decision lives in
`audit.triage`:

| Field | Answers |
|---|---|
| `financials` | Is the rent out of line? A **preliminary** read — the market test confirms or overturns it. |
| `terms` | Is anything in the rights, term or restrictions worth acting on *independently of rent*? |
| `recommendation` | `pursue`, `monitor`, or `no-action`. |
| `rationale` | Why. A recommendation with no reasoning cannot be reviewed. |

**Most sites should stop here.** A lease at market with clean terms is a completed audit, not a
failed one. Recording that decision matters as much as recording the terms — it is the difference
between "we looked and passed" and "we never looked".

Two things worth noting. A lease can be **at market and still worth amending**: `terms:
problematic` is sufficient on its own. And `monitor` is a real outcome — nothing now, something
later, usually an NNR deadline or an option date approaching.

## One audit, three consumers

The deal file the audit produces feeds three different things, which is why it carries more than
any one of them needs:

| Consumer | Takes |
|---|---|
| **Market test** (`market.html`) | site type, area, location, equipment, charge basis, current rent |
| **Comparator** | rent, escalators, cadence, proration, term dates, options |
| **Amendment drafting** | defined terms with provenance, party names, site id and name, address, section map, document chain |

Nothing is entered twice. If a field appears in two of those columns it is stored once and read
twice.

## How the term registry works

Audit findings live in `deal.audit.terms`, keyed by the ids below:

```json
"audit": {
  "terms": {
    "termination.tenant-convenience": {
      "value":       "180 days notice, no fee",
      "status":      "found",
      "source":      "audited",
      "documentRef": "amend-3",
      "sectionRef":  "6(e)"
    }
  }
}
```

**The schema fixes the shape of an entry, never the list of ids.** An id that is not in this
registry produces a *warning*, not an error. That is deliberate: the inventory can grow as the
audit phase gets defined, without a schema version bump and without invalidating existing files.

`status` carries real information and is required:

| status | Meaning |
|---|---|
| `found` | The documents address this term. `value` says what they say. |
| `absent` | The documents are silent. **A finding, not a blank.** A clause that assumes this term exists cannot be used as drafted. |
| `ambiguous` | The documents address it inconsistently or unclearly — typically across amendments. |

`absent` is the one that matters most in drafting. Several template clauses use `Premises` and
`Property` without defining them, so an amendment that assumes them on a lease that never defined
them produces language referring to nothing.

## Registry

`rule` marks terms that already have a check attached in [term-checks.md](term-checks.md).
`merge` marks terms that feed a merge field in the amendment template.

### Parties and instrument

| id | Label | Notes |
|---|---|---|
| `parties.landlord` | Landlord of record | `merge` — verify against the chain, not just the original |
| `parties.tenant` | Tenant of record | `merge` |
| `parties.successor-chain` | Assignment / successor history | `rule` — an AT&T-era site needs the 2020 assignment recital |
| `instrument.type` | Lease / Sublease / License / Sublicense | `merge` `rule` — drives the recital verb |
| `instrument.name` | What the base agreement is called | `merge` |
| `instrument.amendment-count` | Number of amendments | Cross-check against `documentChain` length |

### Premises and property

| id | Label | Notes |
|---|---|---|
| `premises.description` | Premises as described | `rule` — used undefined by several clauses |
| `premises.area-sqft` | Leased area | Feeds the space-rate check |
| `property.description` | Landlord's wider property | `rule` — also used undefined |
| `access.easement` | Access easement and route | |
| `utilities.easement` | Utility easement | |
| `structure.type` | Tower / rooftop / other structure | |
| `structure.rad-center` | RAD center / elevation | Vertical space pricing |
| `structure.capacity` | Structural capacity limits | Gates equipment additions |

### Term and options

| id | Label | Notes |
|---|---|---|
| `term.commencement` | Commencement date | `merge` |
| `term.current-end` | Current term end | `merge` |
| `term.final-end` | Final term end if all options exercised | Distinct from current end |
| `term.options-remaining` | Unexercised options: count and length | Feeds `deal.options[]` |
| `term.renewal-mechanism` | Automatic vs affirmative exercise | Materially changes the baseline |
| `term.nnr-notice` | **NNR — notice of non-renewal.** How much notice the lease requires around renewal, in days. `rule` — the governing term; the deadline below derives from it | |
| `term.nnr-date` | The NNR deadline for the term now running | `rule` — miss it and a renewal is forfeited |
| `term.holdover` | Holdover terms and rate | |

### Rent and escalation

| id | Label | Notes |
|---|---|---|
| `rent.charge-basis` | **How the lease charges.** Flat rent (the common case), rent plus per-antenna/per-dish, or a full itemised manifest (uncommon — typically a restrictive tower-company licence) | `rule` — governs how a market comparison may be built, and is a negotiating term in its own right |
| `rent.current` | Rent currently payable | `rule` — reconcile sources; they disagree |
| `rent.commencement` | Rent commencement date | `rule` — check separately from term commencement |
| `rent.basis` | Monthly or annual | |
| `rent.cadence` | Invoicing frequency | |
| `rent.timing` | Advance or arrears | |
| `rent.proration` | Proration treatment of partial periods | |
| `rent.payment-day-rule` | Behaviour when the payment day is missing from a month | See [conventions.md](conventions.md) |
| `escalator.type` | Fixed %, fixed $, or CPI | `rule` |
| `escalator.rate` | Rate per adjustment | `rule` |
| `escalator.cadence` | Annual, per-term, other | `rule` — check the dates line up |
| `escalator.compounding` | On prior rent or on base | Ambiguous clauses should be priced both ways |
| `escalator.floor-cap` | CPI floor and cap | A floor with no cap is one-sided |
| `rent.guarantee` | Rent guarantee period and carve-outs | `rule` |
| `rent.annual-payment` | Annual payment already made this year | `rule` |
| `fees.utilities` | Utility fee or reimbursement | |
| `fees.taxes` | Tax treatment and reimbursement | |
| `fees.cam` | Common area / other recurring charges | |
| `fees.revenue-share` | Co-location revenue share | Landlord position is typically 15–30% |

### Rights and obligations

| id | Label | Notes |
|---|---|---|
| `use.permitted` | Permitted use | `rule` `merge` — often messy; usually amended by inclusion rather than replacement |
| `use.modification-rights` | Right to add, modify, replace equipment | |
| `access.hours` | Access rights, typically 24/7 | `rule` |
| `sublease.rights` | Sublease and assignment rights | `rule` |
| `interference.protection` | Interference protection | |
| `exclusivity` | Exclusivity / competitor restrictions | |
| `relocation.rights` | Landlord relocation rights | Affects rent guarantee carve-outs |
| `termination.tenant-convenience` | Tenant termination for convenience | `rule` — check no early-termination fee survives |
| `termination.technology` | Termination on technology change | `rule` |
| `termination.permits` | Termination on permit failure | `rule` |
| `termination.default` | Termination on default | `rule` — references default and cure |
| `default.cure-periods` | Default and cure periods | `rule` — the termination clause references this |
| `insurance` | Insurance requirements | |
| `indemnity` | Indemnity | |
| `casualty-condemnation` | Casualty and condemnation | Standard rent-guarantee carve-out |
| `quiet-enjoyment` | Quiet enjoyment | |
| `memorandum` | Memorandum of lease recorded | |
| `snda` | Subordination, non-disturbance, attornment | |
| `estoppel` | Estoppel obligations | |
| `notices.addresses` | Notice addresses | `rule` `merge` — prefill the landlord's, they verify |

### Defined terms

Handled separately in `deal.definedTerms` rather than as registry entries, because each needs
provenance (`definedIn`, `section`, `redefinedHere`) rather than a status:

`RentName` · `TermName` · `ExtensionName` · `AreaName` · `PropertyName` · `EquipmentName` ·
`LandlordTitle` · `TenantTitle` · `DocumentType` · `LeaseDocument`

All ten are `rule` and `merge`.

## Changing this registry

1. Add, remove or rename ids here.
2. Nothing in the schema changes — unknown ids already warn rather than fail.
3. The Phase 2 capture form is generated from this file, so a field appears automatically.

The one thing worth care is **renaming an existing id**, which orphans findings in already-saved
deal files. Prefer adding a new id and marking the old one deprecated.
