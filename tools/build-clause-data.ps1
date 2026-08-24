# =============================================================================
# Regenerate clauses/clause-data.js from clauses.json and clauses/text/*.txt.
#
#   pwsh -File tools/build-clause-data.ps1
#
# WHY: fetch() and XHR are blocked over file://, so draft.html — which opens
# straight from disk — cannot read clauses.json or the text files. A classic
# <script src> does load, so both ship as one global assignment.
#
# Same pattern as market/market-data.js. The SOURCE OF TRUTH stays clauses.json
# and the .txt files; this is derived. Run it after any change under clauses/,
# and check-clauses.ps1 will tell you if you forgot.
# =============================================================================

$ErrorActionPreference = 'Stop'
$root    = Split-Path -Parent $PSScriptRoot
$dir     = Join-Path $root 'clauses'
$outFile = Join-Path $dir  'clause-data.js'

$json  = Get-Content (Join-Path $dir 'clauses.json') -Raw
$lib   = $json | ConvertFrom-Json -Depth 20

$sb = [System.Text.StringBuilder]::new()
$null = $sb.AppendLine(@'
/* =============================================================================
   CLAUSE DATA — GENERATED FILE. Do not hand-edit.

   Regenerate with:  pwsh -File tools/build-clause-data.ps1
   Source: clauses/clauses.json and clauses/text/*.txt, which remain the source
   of truth. This exists only because fetch() is blocked over file://.
   ============================================================================= */
'@)

# The library metadata, verbatim, so nothing can drift in translation.
$null = $sb.AppendLine('window.CLAUSE_LIBRARY = ' + $json.TrimEnd() + ';')
$null = $sb.AppendLine('')

# The impact map ships alongside. It stays a separate source file because it is
# a different kind of data: relationships between SUBJECTS rather than clause
# metadata, hand-authored prose, changing at a different rate.
$impactPath = Join-Path $dir 'impacts.json'
if (-not (Test-Path $impactPath)) { throw "missing clauses/impacts.json" }
$impactJson = Get-Content $impactPath -Raw
$null = $sb.AppendLine('window.CLAUSE_IMPACTS = ' + $impactJson.TrimEnd() + ';')
$null = $sb.AppendLine('')

# Sample language for every placeholder. The drafter quotes it back when one is
# unresolved, which is the difference between "no value in the deal file" and
# something a person can act on.
$phPath = Join-Path $dir 'placeholders.json'
if (-not (Test-Path $phPath)) { throw "missing clauses/placeholders.json" }
$phJson = Get-Content $phPath -Raw
$null = $sb.AppendLine('window.CLAUSE_PLACEHOLDERS = ' + $phJson.TrimEnd() + ';')
$null = $sb.AppendLine('')
$null = $sb.AppendLine('window.CLAUSE_TEXTS = {')

$n = 0
foreach ($c in $lib.clauses) {
  $p = Join-Path $dir $c.textFile
  if (-not (Test-Path $p)) { throw "missing text file for $($c.id): $($c.textFile)" }
  $text = (Get-Content $p -Raw).TrimEnd()
  # ConvertTo-Json on a string produces a correctly escaped JS string literal.
  $lit = $text | ConvertTo-Json
  $null = $sb.AppendLine("  " + ($c.id | ConvertTo-Json) + ": " + $lit + ",")
  $n++
}
$null = $sb.AppendLine('};')

$sb.ToString() | Set-Content $outFile -Encoding UTF8
Write-Host "wrote $outFile" -ForegroundColor Green
Write-Host "  $($lib.clauses.Count) clauses, $n texts"
