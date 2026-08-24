# Expected audit — synthetic lease chain

The grading target. If the audit agent produces this, it works. Where it differs, one of the
two is wrong and the difference is the conversation.

Every figure here was computed independently and is reproducible by hand.

---

## 1. Document chain

Three documents. **Two of them title themselves "First Amendment".** The stated title and the
chronological position disagree, which is why the schema carries both.

| id | Stated title | Chronological | Date | Extraction |
|---|---|---|---|---|
| `original` | Communications Site Lease Agreement | 0 | 2006-05-01 | text |
| `amend-1` | First Amendment | 1 | 2011-09-15 | text |
| `amend-2` | First Amendment | 2 | 2016-03-30 | mixed — page 2 degraded |

**Failure to catch:** recording `amend-2` as the first amendment because that is what it calls
itself. Every later cross-reference then points at the wrong instrument.

---

## 2. Rent history

`history.rentSchedule`. Note how much of it is **computed** rather than stated — only two rows
in the whole chain are figures a document actually contains.

| From | Monthly | Set by | Reason | Derivation |
|---|---|---|---|---|
| 2006-05-01 | 1,200.00 | `original` §3(a) | commencement | **stated** |
| 2007-05-01 | 1,236.00 | `original` §3(b) | escalation | computed |
| 2008-05-01 | 1,273.08 | `original` §3(b) | escalation | computed |
| 2009-05-01 | 1,311.27 | `original` §3(b) | escalation | computed |
| 2010-05-01 | 1,350.61 | `original` §3(b) | escalation | computed |
| 2011-05-01 | 1,391.13 | `original` §3(b) | escalation | computed |
| 2011-10-01 | 1,650.00 | `amend-1` §1 | amendment | **stated** |
| 2012-05-01 | 1,699.50 | `original` §3(b) | escalation | computed |
| 2013-05-01 | 1,750.48 | `original` §3(b) | escalation | computed |
| 2014-05-01 | 1,803.00 | `original` §3(b) | escalation | computed |
| 2015-05-01 | 1,857.09 | `original` §3(b) | escalation | computed |
| 2016-05-01 | 2,042.80 | `amend-2` §2 | escalation | computed |
| 2021-05-01 | 2,247.08 | `amend-2` §2 | escalation | computed |
| 2026-05-01 | 2,471.79 | `amend-2` §2 | escalation | computed |

**Rent currently payable: 2,471.79/month.** That figure is the product of **twelve compounding
steps across twenty years, none of which any document states.** It is exactly the kind of number
that should be labelled `computed` and treated as a derivation rather than a fact.

Checks:

- `1,200 × 1.03⁵ = 1,391.1289` — matches the 2011 row before the reset
- `1,650 × 1.03⁴ = 1,857.0895` — matches the 2015 row
- `× 1.10³ = 2,471.7862` — matches the current rent

Rounding each step and not rounding at all both give **2,471.79** here, so that ambiguity does
not bite on this chain. It will on others; the method used belongs in `history.reconciliation.method`.

### Three traps in the rent history

**The escalation anniversary survives the rent reset.** `amend-1` resets the fee on 1 October
2011 but expressly keeps §3(b), so escalation continues on the **Commencement Date anniversary
(1 May)** — not on the amendment date. Escalating from October would put every subsequent figure
wrong.

**`amend-1` expands the premises by 400 sq ft for no additional fee.** The rent does not change.
An audit that treats an expansion as a rent event invents a step.

**`amend-2` stops the 3% and names its own last adjustment.** It states the final 3% adjustment
was 1 May 2015, so there is no 3% step in 2016 — the 10% replaces it rather than stacking on top.
Applying both gives 2,104.08 at 2016-05-01 and a current rent of **2,545.94**, which is wrong by
about **74/month**.

---

## 3. Defined terms

| Term | Value | Defined in | Status |
|---|---|---|---|
| `RentName` | **Lease Fee** | `original` §3(a) | found — **not "Rent"** |
| `TermName` | Term | `original` §2(c) | found |
| `ExtensionName` | Extension Term | `original` §2(b) | found |
| `AreaName` | Premises | `original` §1 | found |
| `PropertyName` | — | — | **absent** — "Land" is defined, "Property" never is |
| `EquipmentName` | — | — | **absent** — "communications facility" used, never defined |
| `LandlordTitle` | Lessor | `original` preamble | found |
| `TenantTitle` | Lessee | `original` preamble | found |
| `DocumentType` | Lease | `original` preamble | found |
| `LeaseDocument` | Agreement | `original` preamble | found |

**These three are the whole point of collecting defined terms.**

`RentName` is **"Lease Fee", not "Rent"**. Any amendment that introduces "Rent" as a new defined
term creates two payment obligations on the same document — precisely the argument the guidance
doc warns about.

`PropertyName` is **absent**. The lease defines "Land". Library clauses that use `{{PropertyName}}`
without defining it — `access.24-7`, `interference.tenant-protection`, `rofr.lease-purchase` and
others — refer to nothing unless the amendment either adopts "Land" or defines "Property".

`EquipmentName` is **absent**. Same problem for every clause using `{{EquipmentName}}`.

---

## 4. Terms analysis

Against the scored clause library. The gap is the case.

| Clause | State | Gap | Why |
|---|---|---|---|
| `termination.convenience-no-fee` | **absent** | +3 | No convenience termination anywhere. §12 gives permit-failure termination only, **and charges a six-month fee for it** |
| `sublease.assignment` | present-weaker | +2 | Consent required; affiliate transfers already carved out. `amend-2` softens to "not unreasonably withheld" for subletting only, and leaves assignment untouched |
| `interference.tenant-protection` | **absent** | +3 | Nothing. Landlord may let adjacent space to an interfering user |
| `title.snda` | **absent** | +3 | No subordination or non-disturbance provision at all |
| `use.permitted.include` | present-weaker | +2 | §4 requires Lessor consent for material alteration — every technology change is a negotiation |
| `access.24-7` | present-equivalent | 0 | `amend-1` §3 already gives 24/7 without notice |
| `colocation.tenant-right` | **present-better** | −2 | §8 permits co-location **with no fee to Lessor**. Better than the library, which pairs the right with a revenue share. **Defend this; do not reopen it** |
| `default.cure-periods` | present-weaker | +1 | 30 days for everything, one-way, no tenant right to cure the landlord |
| `removal.equipment-at-termination` | present-weaker | +2 | §13 requires restoration to "original condition" with no depth limit on foundations |
| `structural.tower-capacity` | absent | +3 | No reserved capacity or RAD-centre protection |

Summary: **criticalGaps 4**, several present-weaker, and **one present-better**.

**The present-better finding is the one most likely to be missed.** An agent looking for gaps
finds gaps. Section 8 is a provision worth more than the library's own position, and raising
co-location in negotiation risks losing it.

---

## 5. Low-confidence findings

Page 2 of `amend-2` is a degraded scan. Two findings must be recorded with `confidence: low`
rather than guessed:

- **Renewal notice period** — §3 amends it to `[?]` days. The original says 180. **The audit must
  not silently carry 180 forward.** It is `ambiguous`, low confidence, and it drives the NNR date.
- **Assignment consent standard after `amend-2`** — §4 softens *subletting* only; the following
  sentence is illegible. Whether assignment consent was also softened is unknown.

**Failure to catch:** filling in 180 because the original said so and the amendment is hard to
read. That is the single most likely agent failure on this fixture, and it silently produces a
wrong NNR date.

---

## 6. Term and options

| Field | Value | Note |
|---|---|---|
| `commencementDate` | 2006-05-01 | |
| Initial term | 5 years to 2011-04-30 | |
| Options | 4 × 5 yrs (`original` §2(b)) **+ 2 × 5 yrs** (`amend-2` §1) = 6 | Cumulative, not replaced |
| `currentTermEnd` | 2031-04-30 | Initial + 4 exercised extensions |
| `finalTermEnd` | 2041-04-30 | All 6 exercised |
| `nnrNoticeDays` | **unknown** | 180 in the original, amended to an illegible figure |

**Trap:** `amend-2` **adds** two options to the four already there. Reading it as a replacement
gives a final term end of 2041 either way here, but the count reaches the comparator as
`options[]` and the reasoning matters.

---

## 7. Triage

```
financials      : unknown   — needs the market test; 2,471.79 in an unnamed market says nothing yet
terms           : problematic
recommendation  : pursue
rationale       : Four critical terms gaps — no convenience termination (and a six-month fee on
                  the one termination right that exists), no interference protection, no SNDA,
                  no reserved structural capacity. Assignment still needs consent. Two defined
                  terms the library depends on are absent from the chain, so any amendment must
                  adopt or define them. Rent is entirely computed past 2011 and has never been
                  confirmed against a payment record.
```

**`financials: unknown` is the correct answer, not a cop-out.** The market test has not run. An
agent that guesses "above-market" from the rent alone is inventing the finding that the whole
stage-2 tool exists to establish.

---

## What this fixture is not

It exercises **reasoning**, not **extraction** — it is text, and production input is PDF. The
degraded-page markers simulate what a poor scan does to confidence, but they do not test OCR.
Testing extraction needs scanned PDFs, which is a later step.
