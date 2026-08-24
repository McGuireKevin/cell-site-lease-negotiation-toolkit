# Document format

The house style for the amendment `.docx`. It lives as data in
[`src/docx-style.js`](../src/docx-style.js) — one object, `DOCX_FORMAT`.

**Status: placeholder.** Every value is read out of `Lease Amendment Proposal Template.docx`,
which is a sample rather than an issued standard. Legal will replace this. Each value below is one
line to change, and the writer and the conformance checker read the same object, so they cannot
drift apart from each other.

## The spec

| | Value | Source |
|---|---|---|
| Page | Letter, 12240 × 15840 tw | template `sectPr` |
| Margins | top 1820, right 1100, bottom 1500, left 1380, header/footer 432 tw | template `sectPr` |
| Body font | Times New Roman | template `Normal` |
| Body size | 22 half-points (11 pt) | template `Normal` |
| Alignment | justified | template `pPrDefault` |
| First-line indent | 720 tw (0.5″) | template `pPrDefault` |
| Line spacing | single (`line=240 auto`) | normalised — see below |
| Space after | 120 tw (6 pt) | added — see below |
| Widow/orphan control | on | stated — see below |
| Heading | TNR 11 pt, bold, centred, all caps, keep-with-next | template `Heading1` |
| Numbering L1 | decimal `%1.`, left 216 tw, hanging 360 tw | template `abstractNum 0` |
| Numbering L2 | decimal `%2.`, left 936 tw, hanging 360 tw | template `abstractNum 0` |
| Numbering L3 | bullet `•`, left 1656 tw, hanging 360 tw | template `abstractNum 0` |

Margins are deliberately not rounded. They are what the document actually uses; rounding them
would reflow every page against the version already in circulation.

`%2.` rather than `%1.%2.` is the template's own choice — sub-parts restart rather than reading
3.1, 3.2. That is a drafting decision, so it is preserved rather than "corrected".

## What was normalised, and why

The template has already drifted. It is a document that was round-tripped through a converter and
then hand-edited, and it carries the fingerprints:

| Found in the template | Encoded here | Why |
|---|---|---|
| `docDefaults` 12 pt, `Normal` 11 pt | 11 pt everywhere | The file contradicted itself. `Normal` governs most of the document, so 11 pt is what it actually looks like. |
| `BodyText` 11 pt, `ListParagraph` 12 pt | 11 pt everywhere | Numbered sections rendered a point larger than the paragraphs between them. |
| Character scaling 100 / 105 / 107 % | 100 % | `Heading1` at 105 %, list numbers at 107 %. Conversion artifacts — the digits were fractionally wider than the text they introduced. |
| Character spacing −2, +9, +40 tw | none | Direct run formatting, applied to 29 runs, with no pattern. |
| 8 paragraphs double-spaced | single throughout | An otherwise single-spaced document. |
| `ListParagraph` ind left 126 / firstLine 695 | from the numbering indents | 126 tw is 0.0875″. It does not line up with anything, including the numbering it was meant to match. |
| Widow control never specified | explicitly on | It was relying on Word's default. A spec that has to be checked cannot rely on a default. |
| No space after paragraphs | 120 tw (6 pt) | The template separated paragraphs with empty paragraphs instead, which is what breaks when text reflows. |

**A conformance spec that contradicts itself cannot be checked.** Encoding the template literally
would make the checker enforce the damage. Anything above is one line to put back.

## Rules the writer enforces

**Every paragraph carries a named style and nothing else.** No direct formatting anywhere in the
generated document. This is what makes drift detectable: direct formatting in a returned document
is, by construction, something a person added.

The one exception is `numPr` on numbered sections, which sits on the paragraph rather than in the
style so that list membership survives copy-paste between documents — and a redline cycle is
mostly copy-paste between documents.

**Styles used**

| Style | Applied to |
|---|---|
| `Heading1` | the amendment title |
| `BodyText` | preamble, recitals, closing |
| `AmendmentSection` | a numbered section — the first paragraph of each clause |
| `AmendmentContinuation` | later paragraphs of the same clause, unnumbered, indented to the text edge above |
| `SignatureBlock` | the execution block, left aligned, kept together |

**A clause is one section, however many paragraphs it has.** Clause text is split on blank lines;
the first block gets the number, the rest continue it. Numbering every paragraph is how a
four-section amendment comes out reading as twelve.

## Why a real .docx

The export used to be Word-openable HTML. Word opens it — but it arrives with no styles, no real
numbering and no page setup, so the first thing anyone does is reformat it by hand. That
hand-formatting is drift, on round one, before the landlord has seen the document.

No dependency was added. A `.docx` is a zip of XML; the zip is written with STORE (no
compression), which Word accepts, so the whole writer is arithmetic rather than a vendored deflate.
See [`src/docx-writer.js`](../src/docx-writer.js).

## Verified

Generated from `draft.html`, opened in Word with no repair prompt:

- page 8.5 × 11 in, margins 1.264 / 0.764 / 1.042 / 0.958 in — exactly the spec
- styles applied by name: Heading 1, Body Text, Amendment Section, Amendment Continuation, Signature Block
- auto-numbering renders `1.` `2.` `3.` `4.`, continuation paragraphs take no number, and the
  section after a multi-paragraph clause resumes at the right number
- Times New Roman 11 pt throughout, widow control on

All nine package parts parse as well-formed XML independently of Word.

## Not built yet

**The conformance checker.** Reading a returned `.docx` and reporting where it has drifted from
this spec — direct formatting, changed fonts and sizes, broken or renumbered lists, indent and
spacing changes. Reading needs DEFLATE, because Word compresses what it writes; the browser has
`DecompressionStream('deflate-raw')` natively (Firefox 113+, Edge), so this needs no dependency
either. It is the other half of the drift problem and the natural next piece.
