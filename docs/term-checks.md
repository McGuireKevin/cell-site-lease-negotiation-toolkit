# Term checks

Converted from the amendment guidance document into a rule set.

**Each rule carries a phase.** The guidance spans both ends of the process: defined terms are
*established* during the audit and *re-checked* at drafting. Most rules are therefore `both`.
Treating it as a drafting-only checklist — which is how it reads at first glance — loses the
audit half, where the answers actually come from.

| Phase | Meaning |
|---|---|
| `audit` | Establish this while reading the document chain. |
| `amendment` | Check this against the drafted amendment. |
| `both` | Established in the audit, verified again at drafting. |

This is **deliberately not a complete review checklist.** It covers the failure modes that have
actually bitten, which is why some obvious-looking checks are absent and some narrow ones are
here. Do not pad it out for symmetry.

---

## 1. Transcription

These are find-and-replaced from the audit, so an error propagates everywhere at once.

| Rule | Phase | Where it lands | Deal file |
|---|---|---|---|
| FAN and site name | `both` | Header, notice section | `site.fan`, `site.siteName` |
| Site address | `both` | Header, preamble background | `site.address` |
| Amendment name | `both` | Throughout; effective / commencement date language | `documentChain[].statedTitle` |
| Document name | `both` | Heading and first paragraph | `definedTerms.LeaseDocument` |
| Landlord name | `both` | Preamble, notices, signature block | `site.landlord.name` |

**Check:** every one of these appears in more than one place. A correction in one is a
correction in all of them.

---

## 2. Sections included

The audit decides which terms the amendment addresses. Verify the drafted document actually
contains them.

**Rule — audit terms present.** `phase: amendment`
If the audit called for an extended term, an NNR date change, termination rights, or anything
else, confirm a clause covering it was retained after the merge.
Registry: `term.*`, `use.permitted`, `termination.*`, `access.hours`, `sublease.rights`,
`term.holdover`.
Mechanically: every `audit.terms` entry the negotiation touched should have a matching entry in
`clauseSelection`.

---

## 3. Term

**Rule — new initial term vs added extension terms.** `phase: both`
The language differs substantially. A new initial term normally **deletes the old term
entirely**. Adding extension terms is cleaner, but requires that dates and definitions line up.

Clause variants: `term.extension.new-initial-void-existing` (new initial) versus
`term.modify.current-then-five-by-five` and `term.extension.new-extension-*` (added extensions).
They are mutually exclusive and `clauses.json` records that as `conflictsWith`.

**Check:** if extensions are being added, `term.currentTermEnd` and `term.extensionTermStart`
must be consecutive days. A gap or an overlap is a drafting error the numbers will not reveal.

---

## 4. Termination

**Rule — the full termination clause references Default and Cure.** `phase: amendment`
If the full termination section was used, confirm the right Default and Cure section is included
or correctly referenced.
Enforced: `termination.full-section` declares `requires: ["clause:default.cure-periods"]`.

**Rule — a partial termination replacement can leave a fee standing.** `phase: amendment`
If only a piece of the termination section was replaced, confirm the untouched part does not
still impose an early-termination fee.
Applies to: `termination.technology-and-convenience`, `termination.technology-only`,
`termination.convenience-only`. Each is flagged `PARTIAL REPLACEMENT` in `clauses.json`.
`termination.convenience-no-fee` disclaims a fee expressly and is the safer choice where one may
exist.

---

## 5. Notice

**Rule — prefill the landlord's address.** `phase: amendment`
The landlord verifies their own address, but it must be prefilled with the best available guess.
Deal file: `site.landlord.address`. Clause: `notices.addresses`.

---

## 6. Rent and escalator

**Rule — rent figures come from the letter or the audit, and negotiation breaks that.**
`phase: both`
Where terms were negotiated, the letter or audit number is likely stale. This is why
`rent.figures[]` records a `source` per figure — `audited`, `offered`, `negotiated`, `books` —
rather than collapsing to one number. The variance between sources is the finding.

**Check:** `rent.reconciled` must state which figure was chosen and why.

**Rule — rent commencement dates, especially with a guarantee or an annual payment.**
`phase: both`
Double-check rent commencement where a rent guarantee exists, or where an annual payment has
already been made this year. Registry: `rent.commencement`, `rent.guarantee`,
`rent.annual-payment`.

**Rule — escalator dates must line up.** `phase: both`
Confirm the escalator dates make sense against the term. In the comparator this is
`escalators[].firstAdjustment` and `appliesFrom` / `appliesTo`; `checkEsc()` already warns on
overlapping and gapped ranges.

---

## 7. Assignment

**Rule — an AT&T-era site needs the assignment recital.** `phase: both`
If the site ever belonged to AT&T, the paragraph referencing the 2020 assignment is required.
Registry: `parties.successor-chain`. Establish it during the audit from the document chain.

---

## 8. Negotiated terms

**Rule — negotiated terms are not in the template.** `phase: amendment`
Anything agreed in negotiation — a rent guarantee, a term addressing a specific landlord
concern — will not appear automatically. Check it was added by hand.

---

## 9. Reference errors

**Rule — confirm every referenced section is the right one.** `phase: amendment`
The amendment references sections of earlier documents by number. Deal file: `sectionMap`.
This is why six clauses carry `Section XX` placeholders today — see
[drafting-traps.md](drafting-traps.md).

**Rule — "deleted and replaced" can lose something.** `phase: amendment`
Check earlier documents to make sure nothing important is deleted: terms you want to keep,
defined words that are not redefined, subjects unrelated to the replacement language.

**Rule — prefer "amended to include" where the fit is unclear.** `phase: amendment`
Where it is not clear that a section can be cleanly excised, add rather than replace. Permitted
Use is the standard case: an existing Permitted Use section usually covers subjects the
replacement does not touch, so `use.permitted.include` uses `amend_include` for that reason.

---

## 10. Definitions

The governing principle: **stay consistent.** If a term was already in use, keep using it. The
amendment defines many of these explicitly, and the risk is losing something in a redefined term.

Where the base document and the amendment already conflict, that is a conversation, not a silent
fix.

All ten are `phase: both` and live in `deal.definedTerms` with provenance — `definedIn`,
`section`, `redefinedHere`. Provenance is what makes these mechanically checkable rather than a
careful human read.

| Term | Rule |
|---|---|
| `RentName` | Use whatever the previous documents used. Do not leave the landlord able to argue a "Lease Fee", a "Monthly Rent" **and** a "Rent" are all owed. If defining it as Rent, check that is not inconsistent with earlier use — for example `Rent` previously defined to include utilities or taxes. |
| `TermName` | Use Renewal Term, Extension Term, or whatever they used. Confusion here propagates into escalators and end dates. If deleting the old term and creating a new one, different language is probably wanted. |
| `AreaName` (Premises) | Usually the full area leased. **Used without being defined**, so if it does not exist in the chain the clause needs adjustment. |
| `PropertyName` (Property) | The area the landlord controls, including the Premises. **Also used without being defined.** |
| `EquipmentName` (Communication Facility) | Typically the equipment or structure, not the full Premises. Use an equivalent pre-defined term if one exists; otherwise redefining is fine. |
| `LandlordTitle` / `TenantTitle` | Whatever the parties call themselves. If they used company names, redefining to a generic term is a judgement call — ask. |

**The trap this is all guarding:** redefining a term the base lease already defines, or using one
it never defined.

Both directions are caught mechanically:

- `definedTerms.<term>.redefinedHere = true` **and** `definedIn` non-empty → the amendment
  redefines an existing term. Intended sometimes; never accidental.
- A clause `requires: definedTerm:X` where the audit records `X` as `absent` → the clause refers
  to something that does not exist.

`boilerplate.capitalized-terms` does **not** rescue the second case. "Capitalized terms not
defined herein shall have the same meanings as defined in the Agreement" only works if the
Agreement defines it. If the audit says `absent`, there is nothing to point at.
