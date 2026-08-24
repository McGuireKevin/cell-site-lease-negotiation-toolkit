# =============================================================================
# Regenerate market/market-data.js from market/market-rates.json.
#
#   pwsh -File tools/build-market-data.ps1
#
# WHY IT EXISTS: fetch() and XHR are blocked over file://, so market.html —
# which opens straight from disk — cannot read a .json beside it. A classic
# <script src> does load, so the rate file ships as one global assignment.
#
# WHAT CHANGED: this used to walk three CSVs exported from a spreadsheet and
# compute the recommended bands on the way through. It now copies the rate file
# VERBATIM.
#
# The derivation moved into src/market-derive.js, in JavaScript, because a
# user-supplied rate file has to be derived in the browser and two
# implementations of the same arithmetic will eventually disagree. This script
# no longer knows anything about how a band is calculated, which is the point.
# =============================================================================

$ErrorActionPreference = 'Stop'
$root    = Split-Path -Parent $PSScriptRoot
$dir     = Join-Path $root 'market'
$inFile  = Join-Path $dir  'market-rates.json'
$outFile = Join-Path $dir  'market-data.js'

if (-not (Test-Path $inFile)) { throw "missing market/market-rates.json" }

$json = Get-Content $inFile -Raw
try { $parsed = $json | ConvertFrom-Json -Depth 20 }
catch { throw "market-rates.json is not valid JSON: $($_.Exception.Message)" }

$header = @'
/* =============================================================================
   MARKET RATES — GENERATED FILE. Do not hand-edit.

   Regenerate with:  pwsh -File tools/build-market-data.ps1
   Source: market/market-rates.json, which remains the source of truth.

   This exists only because fetch() is blocked over file://, so a page opened
   from disk cannot read the .json beside it. The content below is that file
   VERBATIM — no transformation, so nothing can drift in translation.

   The recommended bands are NOT in here. They are computed at load time by
   src/market-derive.js from the published figures and the derivation block,
   because the same arithmetic has to run on a rate file a user supplies and
   two implementations would eventually disagree.
   ============================================================================= */
'@

$sb = [System.Text.StringBuilder]::new()
$null = $sb.AppendLine($header)
$null = $sb.AppendLine('window.MARKET_RATES = ' + $json.TrimEnd() + ';')

$sb.ToString() | Set-Content $outFile -Encoding UTF8
Write-Host "wrote $outFile" -ForegroundColor Green
Write-Host ("  {0} metros, {1} tiers, {2} equipment adders, {3} space rates, asOf {4}, stance {5}" -f `
  $parsed.metros.Count, $parsed.tiers.Count, $parsed.equipmentAdders.Count,
  $parsed.spaceRates.Count, $parsed.asOf, $parsed.stance)
