# Market rate data

The rate file is the one dataset this toolkit ships. Everything else — leases, deal files,
playbooks — is yours and never enters the repository.

## The file that ships is illustrative

`market/market-rates.json` carries **23 rows**: 19 metros whose figures come from published sources,
and 4 benchmark bands for anywhere unnamed.

Two deliberate choices, and both are stated inside the file itself rather than only here:

**Published rows only.** The private dataset this was cut from also carries rows derived *by
analogy* — a figure assigned from tier peers where no published number exists. That is somebody's
judgement, and in a public file it would read as data. Those rows are excluded.

**The stance is `conservative`.** `derivation.midPosition` is `0.15`. The field records *where in
each range the recommended figure is placed*; it does not change how any of the arithmetic works.

Nothing in it is invented. Every published low and high is a real sourced figure.

**It is a starting point, not a valuation.** Supply your own file before relying on a number.

## What the file contains — and what it deliberately does not

**Inputs only.** Published low and high per metro, one baseline per equipment item, one multiplier
per tier. The recommended low, mid and high, the rooftop figure and every per-tier adder are
**computed at load** by `src/market-derive.js`.

That is the whole reason this replaced a spreadsheet. The workbook stored inputs and outputs side by
side, and:

- **five of the six tier columns on every equipment row were the baseline times a multiplier** —
  verified, exactly — and the tool never read any of them
- one row's own note said the multiplier did not suit it, while its numbers applied the multiplier
  anyway
- the derivation panel in `market.html` recovered the published figures by **dividing back out of**
  the band that had been computed from them

A file cannot contradict itself about a number it does not contain. `tools/check-market.ps1` fails
the build if a derived value reappears in the file.

### Shape

```json
{
  "schemaVersion": "1.0",
  "label": "…", "asOf": "2026-01-01", "currency": "USD",
  "source": "where these figures came from",
  "stance": "conservative | midpoint | aggressive",
  "stanceNote": "what a reader should know before quoting it",
  "illustrative": true,   // ONLY on the file this repo ships - see below
  "derivation": { "lowFactor": 0.95, "highFactor": 0.70, "midPosition": 0.45 },
  "thresholds": { "above": 1.25, "below": 0.80 },
  "tiers":  [{ "id": "tier-2", "label": "Tier 2 — Major metro",
               "multiplier": 1.0, "rooftopPremium": 1.2 }],
  "metros": [{ "metro": "Dallas-Fort Worth, TX", "tier": "tier-2",
               "publishedLow": 900, "publishedHigh": 3000, "basis": "published" }],
  "equipmentAdders": [{ "category": "ANTENNAS", "item": "Panel antenna — standard (<50 lb)",
                        "baseline": 90, "tierScaled": true, "note": "…" }],
  "spaceRates":      [{ "spaceType": "Ground compound — primary",
                        "unit": "$ / sq ft / month", "baseline": 2.5, "tierScaled": true }]
}
```

### `illustrative` belongs only on the shipped file

`market.html` shows a banner reading **"This is the bundled illustrative file"** followed by the
`stanceNote`. It fires on this marker and nothing else.

It used to be inferred from the stance, which was wrong: `conservative` is a perfectly reasonable
choice for someone's own house rates, and a user who picked it was told their own figures were our
sample data — our disclaimer attached to their numbers.

`market-builder.html` never writes the field, so anything you build is unmarked by construction,
including a file you build by loading this one and editing it. `check-market.ps1` requires the
tracked file to carry it, which also catches a real rate file committed in its place.

### The derivation, in three numbers

| | |
|---|---|
| `lowFactor` | published low × this = recommended low |
| `highFactor` | published high × this = recommended high |
| `midPosition` | 0 puts the recommendation at the low, 1 at the high |

Rooftop mid is the recommended mid × the tier's `rooftopPremium`.

**Making a whole dataset more or less conservative is three numbers, not a re-export of every row.**
That is the lever the shipped file uses, and it is the one to reach for if you disagree with how
this one is set.

`basis` is `published`, `analogy` or `benchmark`. Say which — six months later nobody remembers
which figures were sourced and which were reasoned.

`tierScaled: false` is the escape hatch for an item the multiplier does not suit. Use it instead of
writing per-tier numbers out.

## Building your own

**Author wherever you like.** Excel, Google Sheets, Numbers, LibreOffice, a text editor. A
spreadsheet is a good place to type forty rows of numbers; it just is not something the toolkit
should depend on.

1. Open **`market-builder.html`** from disk.
2. **Load template** for the shape, or **Open a rate file** to start from the shipped one.
3. Paste CSV into each box. Quoted fields work, which matters — `"New York, NY"` splits into two
   columns without them, and the failure is a shifted row rather than an error.
4. The preview shows what the tool will **compute**, not what you typed, so you are checking the
   figures a negotiator will actually read.
5. **Download rate file.** It saves as `*.rates.json`, which is gitignored.

Then in `market.html`, **Load Rate File**. Validation and derivation run through the same functions
in both tools, so a file that passes in the builder behaves identically in the rate builder.

### Where figures come from

Published sources exist and are worth the hour: tower REIT filings and investor decks, carrier
disclosures, published lease-rate surveys, and county records where leases or memoranda are
recorded. Note the date — the `asOf` field is not decoration.

## Ageing

Market rents move. `market.html` warns when a file is more than 18 months old, and the validator
refuses a file with no `asOf` at all: a band with no date cannot be judged stale, which is how a
four-year-old figure gets quoted as current.

Stale data **warns rather than blocking**. Old data is often all there is, and refusing it would
push people to fake the date, which is worse than knowing it is old.

## Checks

```bash
pwsh -File tools/check-market.ps1
```

Five gates: the file parses and every reference resolves; no band is inside out and nothing is
negative; no derived value is stored beside its own input; every row says where it came from and the
shipped file carries no analogy rows; and the stance is stated in the file, with `midPosition`
actually matching what the stance claims.
