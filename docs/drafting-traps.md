# Drafting traps

Four failure modes seen in real amendment templates. None is exotic and none is caught by
proofreading, because in every case the document *looks* right.

They are recorded because **the job of the tooling is to make them structurally impossible**, not
to catch them in review. Where this repo already does that, it says so.

---

## 1. A conditional field testing the wrong variable

A recital that adapts its verb to the instrument type — *leased*, *subleased*, *licensed*,
*sublicensed* — is usually built from Word `IF` fields, one per verb.

The trap: three of the four test a **different merge field** from the one that carries the
instrument type. Because the first branch is the common case, the document reads correctly on
almost every site, and on the exception it loses the verb entirely and reads *"the parties entered
into that certain Agreement dated…"* with no verb at all.

**Why proofreading misses it.** The output is grammatical on the ninety percent case, and nobody
generates the ten percent case to check.

**What this repo does.** There are no conditional fields. `DocumentType` is a defined term resolved
from the deal file, and the clause text uses it directly. A branch that can be wrong is a branch
that will be.

---

## 2. A period that ends before it begins

A rent guarantee stated as a number of months — sixty, one hundred and twenty — with its end date
mapped to a merge field holding the **current term end** rather than a computed end.

On a site whose current term ends before the guarantee would, the document states a period ending
the day before it starts.

**Why proofreading misses it.** Both values are correct in isolation. The defect only exists in the
relationship between them, and the relationship is not written down anywhere in the document.

**What this repo does.** Dates come from the deal file, where `term.commencementDate`,
`term.currentTermEnd` and `term.finalTermEnd` are separate fields, and the validator refuses a
`finalTermEnd` before a `currentTermEnd`. A derived date is computed rather than mapped to whatever
field happened to be nearby.

---

## 3. A data source bound to an absolute path

Word stores the **absolute path** to a mail-merge data source inside the document. Move the file,
change machines, or leave the organisation, and the merge fails — quietly, and for whoever inherits
the template rather than whoever created it.

**What this repo does.** Nothing reads a path stored inside a document. The drafter takes its values
from the deal file it was handed, and writes the `.docx` itself.

---

## 4. `Section XX` reaching an executed document

Clauses that amend a numbered section carry a placeholder for the number. Filling it in is a
checklist item, and a checklist catches it most of the time.

Most of the time is not good enough for a number that determines which clause of a binding contract
is being replaced.

**What this repo does.** This one is the reason the drafter's gate exists. `targetSection` resolves
from the deal file's `sectionMap`, and a clause whose section number is missing **blocks the export
entirely** — `assemble()` returns nothing rather than trusting a disabled button. See
[clause-library.md](clause-library.md).

---

## The pattern

Every one of these produces a document that reads correctly to someone who is not looking for that
specific defect. That is what makes them worth designing out rather than reviewing for: a review
catches what it is looking for, and none of these announces itself.
