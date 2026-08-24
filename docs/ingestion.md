# Ingesting a returned document

After a redline, the landlord sends something back. This is what happens to it.

## .docx — read in full

A `.docx` is a zip of XML. The writer produces one with STORE because Word accepts uncompressed
entries; the reader has to handle what **Word** wrote, and Word compresses — so it needs DEFLATE.

`DecompressionStream('deflate-raw')` is native in Firefox 113+, Edge and Chrome, and works over
`file://`. No dependency for this half either.

What comes out, and why each part earns its place:

| | |
|---|---|
| **Text** | Two views: the document as it now reads, and what it said before their tracked edits. |
| **Tracked changes** | **Their actual edits**, attributed and dated. |
| **Comments** | Usually where the reason lives — and the reason is what tells you whether an edit is negotiable. |
| **Formatting** | Per paragraph, for the conformance check. |
| **Page setup** | Margins and page size, compared against the house style. |

### Tracked changes beat diffing

Where Track Changes was used, `redline.html` takes **both sides from the one file**: what it said
before, and what it says now.

A diff *infers* what changed. Tracked changes *are* what they did. It also removes the commonest
source of false findings — comparing against the wrong version of our own draft, which happens the
moment more than one copy of round two exists.

Where Track Changes was not used, the comparison falls back to diffing and says so. A landlord
editing without it is not necessarily hiding anything, but nothing in the file records what they
touched.

## .pdf — inspected, not extracted

**A PDF is triaged and reported on. Text is not extracted from it, and that is a decision rather
than a gap.**

Two reasons:

**A PDF has no styles.** The formatting half of the comparison is impossible from a PDF no matter
how good the text extraction is. There is nothing in the file that says what a paragraph was
*supposed* to look like.

**Half-reliable extraction is worse than none.** PDF text lives behind font encodings. Without a
`/ToUnicode` map, character codes cannot be reliably mapped to letters, and the failure mode is not
an error — it is plausible-looking wrong text. Feed that into the redline comparison and it
produces a page of false findings, in the one place where a reviewer's trust matters most. The
project's rule throughout is that an honest *unknown* beats a confident wrong answer.

So `inspectPdf()` reports what the file is:

| Verdict | Meaning |
|---|---|
| `scanned` | Images, no fonts. Nothing to extract at all. |
| `no-text` | No embedded fonts. |
| `text-without-unicode-map` | Text, but codes cannot be mapped to letters reliably. |
| `text-layer` | Extractable — but still no styles. |

**Ask for the `.docx`.** A redline happens in Word, so the Word file exists; the PDF is usually the
flattened copy, and it has thrown away the tracked changes and the comments on the way.

If only the PDF exists: Word opens a PDF directly and converts it, including many scans. Paste the
resulting text in. The formatting comparison stays unavailable and the final report records it as
**not included** rather than as clean.

## What the conformance check measures

One of these has teeth and the rest are hygiene.

**Numbering is not cosmetic.** If section numbers renumber or duplicate, every cross-reference in
the document points at the wrong clause, and the document is then wrong in a way that reads as
clean. Checked first, scored highest:

- `numbering-lost` — a section keeps its style and drops out of the list, so everything after it renumbers
- `numbering-doubled` — a number typed over an automatic one, reading as "3. 4. Termination"
- `numbering-split` — sections across two list definitions, so the document counts 1, 2, 3, 1, 2

Then the hygiene: direct formatting, font and size overrides, styles that arrived with pasted
content, and page setup.

## The invariant this rests on

**Our writer emits a named style and nothing else on every paragraph** — plus `numPr` on numbered
sections, which sits on the paragraph so list membership survives copy-paste.

That is what makes the measurement mean anything: if our own document contains no direct
formatting, then direct formatting in a returned document was added by a person.

It is enforced by two tests, and the second exists because the first was not enough. The heading
used to restate its own style's bold and caps on the *run*, so a freshly generated document
reported itself as carrying direct formatting. Found by running our own output through our own
conformance check.

## Findings become deviations

Formatting findings merge into `deviations[]` with `kind: "formatting"`, alongside the substantive
ones. Same accept/reject discipline, same stable keys, same merge — because both are changes
somebody has to have seen.

They are kept distinguishable so the final report can group them: deciding about a font is not the
same act as deciding about a termination right.

## Verified

A document from the writer was damaged the way a landlord's Word damages one — numbering removed
from one section, a number typed over another, font and size and alignment overridden, a foreign
style pasted in, a tracked insertion and deletion, a margin nudged to a round inch — then rezipped
with **DEFLATE** and confirmed to open in Word with 2 revisions.

Read back: all seven kinds of damage found, each at the right paragraph and the right count, the
tracked insertion and deletion recovered verbatim, both text views correct, and the substantive
comparison finding `consent-added` from the two views of that single file. **One** paragraph
reported for direct formatting — the one that was damaged.
