# Synthetic lease chain

A three-document chain for building and testing the audit agent. **Entirely invented** — invented
parties, invented site, invented figures, round numbers. Safe to commit, and the only lease text
that ever should be.

| File | What it is |
|---|---|
| `00-original-lease.txt` | Communications Site Lease Agreement, 2006-05-01 |
| `01-amendment-2011.txt` | First amendment (chronologically first) |
| `02-amendment-2016.txt` | Second amendment — **also titles itself "First Amendment"** |
| `expected-audit.md` | What a correct audit produces. The grading target. |

## Why it is shaped this way

Each element exists to catch a specific failure. A chain that is merely realistic tests nothing;
this one has answers that are wrong in identifiable ways.

**Two documents titled "First Amendment."** Stated title and chronological position disagree, as
they do in practice. Getting this wrong points every later cross-reference at the wrong
instrument.

**Rent that is almost entirely computed.** Only two figures in twenty years are stated in a
document. The current rent is the product of twelve compounding steps, which is exactly the
number that should be labelled `computed` and treated as a derivation rather than a fact.

**Three arithmetic traps.** The escalation anniversary survives a rent reset on a different date;
a premises expansion carries no fee and is not a rent event; and the second amendment *replaces*
the 3% rather than stacking the 10% on top. The third is worth about **74/month** if missed.

**A defined term that is not what anyone expects.** Rent is called **"Lease Fee"**. An amendment
that introduces "Rent" creates two payment obligations on one document.

**Two defined terms that do not exist.** The lease defines "Land", never "Property", and never
defines the equipment. Library clauses using `{{PropertyName}}` or `{{EquipmentName}}` refer to
nothing unless the amendment adopts or defines them.

**A degraded page.** The renewal notice period is illegible. The correct output is `ambiguous`
with low confidence — **not** the 180 days the original said. Silently carrying it forward is the
most likely agent failure here, and it produces a wrong NNR date.

**One provision better than the library.** Section 8 permits co-location with no fee to the
landlord. An agent hunting for gaps finds gaps; this one has to be recognised as something to
defend rather than improve.

**Financials that cannot be judged yet.** No market is named, so `financials: unknown` is the
correct triage. Guessing "above-market" from the rent alone invents the finding the market test
exists to establish.

## Using it

Run the audit against the three documents and compare the output to `expected-audit.md`.
Differences are the interesting part — each one is either an agent bug or a fixture that needs
correcting, and both are worth knowing.

## What it does not test

**Extraction.** These are text files; production input is PDF. The degraded-page markers simulate
what a poor scan does to *confidence*, but nothing here exercises OCR. Testing that needs scanned
PDFs and is a later step.

**Database corroboration.** Not built, and no access yet. When it arrives it joins
`audit.sources[]` as a corroborating source — it confirms or contradicts, it does not supply what
the documents already say.
