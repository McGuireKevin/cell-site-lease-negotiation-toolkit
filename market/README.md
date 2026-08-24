# Market rate data

| File | What it is |
|---|---|
| `market-rates.json` | **The source of truth.** Illustrative, published rows only, conservative stance. |
| `market-data.js` | Generated. The file above, verbatim, wrapped in one global assignment. |

`market-data.js` exists only because `fetch()` is blocked over `file://`, so a page opened from disk
cannot read a `.json` beside it. Regenerate after any change:

```bash
pwsh -File tools/build-market-data.ps1
```

**The bands are in neither file.** Published low and high go in; recommended low, mid, high and the
rooftop figure are computed at load by `src/market-derive.js`, because the same arithmetic has to
run on a rate file a user supplies and two implementations would eventually disagree.

## This dataset is illustrative to assist negotiators in determining top and bottom of a broad market area. Not a specific recommendation on a particular site.

19 metros from published sources plus 4 benchmark bands. `stance` is `conservative` and
`derivation.midPosition` is `0.15`.

Nothing in it is invented: every figure comes from a published source, and rows derived by analogy
are excluded. It ships publicly, and it is a starting point rather than a valuation.

**Supply your own file before relying on a number.** `market-builder.html` builds one from a CSV
export of any spreadsheet. See [../docs/market-data.md](../docs/market-data.md).

## What used to be here

Three CSVs exported from `Cell_Site_Rent_Schedule_2026.xlsx`. Both are gone: a compiled rate table
is commercially valuable and this repository is public, the workbook made Excel a dependency of a
project that otherwise needs nothing installed, and the CSVs stored five adder columns per row that
were the baseline times a tier multiplier — already unused by the tool, and free to drift out of
agreement with the number they came from.
