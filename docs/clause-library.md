# Clause library

62 clause variants across 30 categories. Metadata in `clauses/clauses.json`; prose in
`clauses/text/<id>.txt`, one file each.

## Every clause here is unreviewed drafting

| `provenance` | Count | What it means |
|---|---|---|
| `researched` | 62 | **Composed from published market practice. Never used, never reviewed by counsel.** |

Every one carries `status: "draft"`, and `tools/check-clauses.ps1` fails if one is promoted to
`vetted` without the field changing — so the distinction cannot erode quietly.

**Do not put any of it in front of a landlord without review.** The risk is not that the language
is wrong in the abstract; most of it is unremarkable market-standard drafting. The risk is that it
may not fit *the base lease it is amending* — it may redefine a term that lease already defines, or
reference a concept that lease never established. That is precisely the failure mode
[term-checks.md](term-checks.md) exists to catch, and it can only be checked against a specific
document.

### What used to be here

33 of these clauses were extracted from a sample amendment template. **They were removed before
this repository went public**: they were drafted from client information, and sanitising the merge
values out of the text does not change where the drafting came from.

Removing them emptied nine categories — including term, termination and escalator, which is most of
what an amendment actually does — so 25 researched clauses were written to restore coverage. Four
ids were deliberately reused, because fixtures, `negotiation/positions.json` and the drafter's
boilerplate selection reference them by id and would otherwise have broken silently:
`access.24-7`, `sublease.assignment`, `termination.convenience-no-fee`,
`boilerplate.other-terms-remain`.

**This is scaffolding, and it is meant to be replaced.** When client-approved language is
available, swap the text file and update `provenance`. Coverage is enforced mechanically rather
than by memory: `check-clauses.ps1` fails if an impact category has no clauses, and
`check-positions.ps1` fails if a position category has none, so a replacement that drops a subject
cannot pass quietly.

The library is wider than the template was, and deliberately: a real telecom lease has far more
surface than term, rent and escalation — interference, structural capacity, roof penetration,
relocation, environmental, SNDA, right of first refusal, co-location revenue, removal and
restoration. A negotiation that never raises those is not conceding them; it is not seeing them.

## Why the split

The prose is plain text so it diffs as prose. The metadata is what turns "keep the clauses that
apply and delete the rest" from a memory exercise into a checkable one:

| Field | What it does |
|---|---|
| `operation` | `amend_replace` / `amend_include` / `amend_modify` / `delete` / `standalone` — the guidance's distinction about when a section can be cleanly excised. |
| `targetSection` | Resolved from the deal file's `sectionMap`, not typed. |
| `definedTerms` | Which of the ten this clause depends on. |
| `placeholders` | Which merge fields it uses. |
| `conflictsWith` | Mutually exclusive variants. **Mutual and machine-checked.** |
| `requires` | `definedTerm:X`, `sectionMap:Y`, or `clause:Z`. |
| `whenToUse` | The judgement that does not fit in a field name. |
| `status` | `draft` throughout, until client-approved language replaces it. |

`conflictsWith` is the point. Four Term variants exist and at most one of the three that replace the term section belongs in any amendment;
the graph says which pairs cannot coexist. `requires` is checked against the audit — a clause
needing `definedTerm:PropertyName` on a lease where the audit recorded `Property` as `absent`
refers to something that does not exist.

## The third relation: `impacts`

Those two are **hard** — they block the document. There is a third, in
[`clauses/impacts.json`](../clauses/impacts.json), which blocks nothing:

> **Changing a term in one category usually means revisiting another.**

It exists because **the audit finds problems one term at a time, and a draft trades across terms.**
The audit may flag the term length and record nothing against termination — and a first draft
proposing a longer term should still put termination rights on the table in the same round, because
a longer term without an exit is worse than the shorter one it replaced. No audit finding would
ever surface that, because there was no finding to surface.

Modelled **per category**, not per clause. The relationships hold between subjects rather than
between drafting variants — every Term clause implicates termination for the same reason — and a
per-clause map would be authoring for its own sake.

**Direction is deliberate.** A impacting B does not oblige B to impact A. Changing the rent should
raise the escalator every time; changing a recording provision raises title, but changing title
does not particularly raise recording.

The reason attached to each pair is the product. A list of clause ids tells a drafter nothing they
can act on, so `check-clauses.ps1` fails a pair whose reason is missing or too short to be one.

29 categories, 71 relationships. `boilerplate` deliberately has none, and `rent-guarantee` was removed with its clauses.

## Sample language for every placeholder

`clauses/placeholders.json` records, for each placeholder, **the form its value must take** and a
fragment showing how the sentence reads once it is filled.

This exists because a placeholder value is dropped **verbatim** into legal prose, and nothing about
a field name says which form is wanted:

| Stored | Renders as |
|---|---|
| `3000000` | "limits of not less than 3000000" |
| `Three Million Dollars ($3,000,000.00)` | "limits of not less than Three Million Dollars ($3,000,000.00)" |
| `20` | "a share equal to 20 of the revenue" |
| `twenty percent (20%)` | "a share equal to twenty percent (20%) of the revenue" |
| `$1,950` in `RentProposal` | "($$1,950) per month" — the clause supplies the dollar sign |
| `2%` in `EscalatorProposal` | "increase by 2% percent" — the clause supplies the word |

Every one of those loads, validates, and reaches an executed document. The number is right and only
the drafting is broken, which is exactly the class of error nobody catches on a read-through.

**The drafter quotes the sample back.** An unresolved placeholder no longer says only "no value in
the deal file" — it names the expected form and the field it comes from.

`check-clauses.ps1` gate 10 fails if a placeholder is used without sample language, or if an entry
lacks a sample, a source or a rendered example. Documented-but-unused is allowed: a placeholder can
be written ahead of the clause that will use it.

**Defined terms are marked `kind: "definedTerm"` and are different in kind.** Their value is not a
house choice — it is whatever *this* lease calls the thing, read off the document during the audit.
A lease that says *Lessor* does not become *Landlord* because Landlord reads better.

## Placeholders

Every merge field is `{{FieldName}}`. Two conventions:

- `{{sectionMap.term}}` — resolved from the deal file, not a merge field.
- `{{RentProposal_Words}}` — the same field as `{{RentProposal}}`, rendered with Word's
  `\* CardText` switch: *"two thousand two hundred fifty"* beside *"2,250.00"*. One field, two
  renderings.

## Cross-clause dependencies

Four clauses are not safe alone, and `requires` records why:

| Clause | Requires | Because |
|---|---|---|
| `termination.landlord-default` | `default-cure.periods` | It terminates on a failure to cure within "the period allowed", and without the cure clause there is no period. |
| `interference.cure-and-remedy` | `interference.tenant-protection` | A remedy with no covenant to enforce. |
| `colocation.revenue-share` | `colocation.tenant-right` | Sharing revenue from a right that was never granted. |
| `generator.installation-and-fuel` | `environmental.tenant-obligation` | Stored fuel breaches a blanket hazardous-materials prohibition unless the carve-out is present. |

## Before committing any change here

```bash
pwsh -File tools/check-clauses.ps1
```

Five gates: completeness, placeholder parity, role-based placeholder names, sanitization, and
provenance. **The fourth is the confidentiality gate.** The sample document stores cached merge
results inline — a real landlord name, site address, site name, FAN, rent and escalator sit
inside the `.docx` with no merge run — so a naive extraction carries all of it into the clause
files.

The check looks for the *shape* of a merged value where a placeholder belongs: a currency amount,
a formatted percentage, a spelled-out date, a long digit run. It is deliberately not a denylist
of real names, because a file listing real landlord names would itself be the leak.

It cannot catch a bare proper noun carrying no digits. That is what reading the files is for, and
why short files were chosen over one large one.

The clauses that made this necessary are gone, but the gate stays. The next person to paste
drafting in from a real document will hit it, and that is the point.

## Defects corrected during extraction

Two source defects were fixed here rather than carried forward. Both remain in the `.docx` —
see [drafting-traps.md](drafting-traps.md).

**Rent guarantee end date.** The template mapped the guarantee end to `Current_Term_End_Date`,
which is the day *before* the extension term starts, producing a 60-month period that ended the
day before it began. Both guarantee variants now use a distinct `Rent_Guarantee_End_Date`.

**Unparameterised variant.** `term.extension.new-extension-dated-start` had Landlord, Tenant and
Extension Term as literal words rather than merge fields, so it silently ignored the defined-term
set — exactly the inconsistency the guidance warns about. Now parameterised. Check any previously
merged document that used it.

## Clauses marked `review`

- `term.renewal-notice-period` — references "the Initial Term" without defining it. Confirm the
  base lease uses that phrase, or the reference dangles.
- `utilities.metered-or-fee` — carries two hand-fill blanks (`[SPELL OUT DOLLAR AMOUNT]`,
  `$[AMOUNT]`) that no merge field fills. Also asserts the Utility Fee is not subject to the rent
  escalator; check that against how the escalator clause is drafted.
- `holdover.month-to-month` — unlike the full term replacement, does not state the holdover rent.
  Confirm that is intended.

## Placeholder names carry no client identity

Placeholders are named for the **role**, never the party: `TenantTitle`, `LandlordTitle`,
`Tenant_Notice_Entity`. A client name must not appear anywhere in this repo — not in a value, not
in a field name, not in a comment.

This is enforced, not just documented. `tools/check-clauses.ps1` fails on any placeholder whose
name is not in the known set, so a new `AcmeCorpTitle` cannot be introduced quietly.

The original template named this field after the client. Since the amendment is produced by this
toolkit rather than by a fixed mail merge, the names are ours to choose and there is no reason to
carry that forward.
