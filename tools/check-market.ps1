# =============================================================================
# Market rate file checks.
#
#   pwsh -File tools/check-market.ps1
#
# The rate file is the one dataset the toolkit ships. It is also the one a
# COUNTERPARTY might open, since this repository is public — so the checks
# below are as much about what the file claims as about whether it parses.
#
# Five gates:
#
#   1. VALID          parses, and every reference resolves
#   2. BANDS          low is not above high, nothing is negative, and no band
#                     is wildly out of line with the spread of its peers
#   3. INPUTS ONLY    no derived value stored beside the input it came from.
#                     The spreadsheet this replaced kept five adder columns
#                     that were the baseline times a multiplier -- already
#                     unused by the tool, and free to drift out of agreement
#                     with the number they were computed from.
#   4. PROVENANCE     every row says where it came from, and the shipped file
#                     carries no row derived by analogy
#   5. STANCE         the shipped file states that it is illustrative and
#                     conservative, in the file itself rather than only in docs
# =============================================================================

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$file = Join-Path $root 'market\market-rates.json'
$fail = 0

if (-not (Test-Path $file)) { Write-Host "market/market-rates.json missing" -ForegroundColor Red; exit 1 }

Write-Host "`n=== 1. valid ===" -ForegroundColor Cyan
try { $m = Get-Content $file -Raw | ConvertFrom-Json -Depth 20 }
catch { Write-Host "  not valid JSON: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }

$tierIds = @($m.tiers | ForEach-Object { $_.id })
foreach ($r in $m.metros) {
  if ($tierIds -notcontains $r.tier) {
    Write-Host "  $($r.metro): tier '$($r.tier)' is not defined" -ForegroundColor Red; $fail++
  }
}
$dupes = @($m.metros | Group-Object metro | Where-Object { $_.Count -gt 1 })
foreach ($d in $dupes) { Write-Host "  '$($d.Name)' appears $($d.Count) times" -ForegroundColor Red; $fail++ }
Write-Host "  $($m.metros.Count) metros across $($m.tiers.Count) tiers"

Write-Host "`n=== 2. bands ===" -ForegroundColor Cyan
foreach ($r in $m.metros) {
  if ([double]$r.publishedLow -gt [double]$r.publishedHigh) {
    Write-Host "  $($r.metro): low $($r.publishedLow) is above high $($r.publishedHigh) - the band is inside out" -ForegroundColor Red
    $fail++
  }
  if ([double]$r.publishedLow -lt 0 -or [double]$r.publishedHigh -lt 0) {
    Write-Host "  $($r.metro): negative rent" -ForegroundColor Red; $fail++
  }
}
foreach ($e in @($m.equipmentAdders) + @($m.spaceRates)) {
  $n = if ($e.item) { $e.item } else { $e.spaceType }
  if ([double]$e.baseline -lt 0) { Write-Host "  $n : negative baseline" -ForegroundColor Red; $fail++ }
}

# A band can be individually valid and still be wrong. One row shipped here at
# 1800-1900: high above low, nothing negative, so every gate above passed --
# while every other band in the file spread between 2.4x and 3.3x. One digit.
#
# So the file is asked to judge itself rather than being measured against a
# fixed range: a user's own rates may legitimately be tighter or wider than
# these, and a hard-coded bound would fail a file that is perfectly good.
$ratios = @()
foreach ($r in $m.metros) {
  $lo = [double]$r.publishedLow; $hi = [double]$r.publishedHigh
  if ($lo -gt 0 -and $hi -gt 0) {
    $ratios += [PSCustomObject]@{ metro = $r.metro; ratio = $hi / $lo }
  }
}
if ($ratios.Count -ge 5) {
  $sorted = @($ratios.ratio | Sort-Object)
  $median = $sorted[[int][math]::Floor($sorted.Count / 2)]
  $loBound = $median / 2
  $hiBound = $median * 2
  foreach ($x in $ratios) {
    if ($x.ratio -lt $loBound -or $x.ratio -gt $hiBound) {
      Write-Host ("  {0}: high/low is {1:N2}, against a file median of {2:N2}" -f `
                  $x.metro, $x.ratio, $median) -ForegroundColor Red
      Write-Host ("  Outside {0:N2}-{1:N2}. A band that far out of line with every other band" -f `
                  $loBound, $hiBound) -ForegroundColor Red
      Write-Host  "  in the same file is usually one wrong digit, not a real market." -ForegroundColor Red
      $fail++
    }
  }
}
if ($fail -eq 0) { Write-Host "  every band is the right way round, nothing negative, no spread outlier" }

Write-Host "`n=== 3. inputs only ===" -ForegroundColor Cyan
# A recommended band or a per-tier adder column stored in the file would mean
# the same number lives in two places and can disagree with itself.
$derived = @('groundLow','groundMid','groundHigh','rooftopMid','recLow','recMid','recHigh',
             'tier1a_gateway','tier1b_dense','tier2_major','tier3_mid','tier4_small_rural')
$raw = Get-Content $file -Raw
$found = @($derived | Where-Object { $raw -match ('"' + $_ + '"') })
if ($found.Count) {
  Write-Host "  derived values stored in the file: $($found -join ', ')" -ForegroundColor Red
  Write-Host "  These are computed by src/market-derive.js. Storing them invites them to drift." -ForegroundColor Red
  $fail++
} else {
  Write-Host "  no derived value is stored - bands and per-tier adders are computed at load"
}

Write-Host "`n=== 4. provenance ===" -ForegroundColor Cyan
$byBasis = $m.metros | Group-Object basis | Sort-Object Name
foreach ($g in $byBasis) { Write-Host "  $($g.Name): $($g.Count)" }
$noBasis = @($m.metros | Where-Object { -not $_.basis })
if ($noBasis.Count) {
  Write-Host "  $($noBasis.Count) row(s) with no basis - say where a figure came from" -ForegroundColor Red; $fail++
}
$analogy = @($m.metros | Where-Object { $_.basis -eq 'analogy' })
if ($analogy.Count) {
  Write-Host "  $($analogy.Count) row(s) derived BY ANALOGY in the shipped file." -ForegroundColor Yellow
  Write-Host "  Those are an extrapolation rather than a published figure. Fine in a private file; " -ForegroundColor Yellow
  Write-Host "  in the public one they read as data." -ForegroundColor Yellow
}

Write-Host "`n=== 5. stance is stated ===" -ForegroundColor Cyan
if (-not $m.asOf) { Write-Host "  no asOf - a band with no date cannot be judged stale" -ForegroundColor Red; $fail++ }
if (-not $m.stance) { Write-Host "  no stance - the file should say where in the range its bands sit" -ForegroundColor Red; $fail++ }
if (-not $m.stanceNote -or $m.stanceNote.Length -lt 40) {
  Write-Host "  stanceNote missing or too short. It is what a counterparty reads before quoting this at you." -ForegroundColor Red
  $fail++
}
$bands = @{ 'conservative' = @(0.0, 0.3); 'midpoint' = @(0.3, 0.7); 'aggressive' = @(0.7, 1.0) }
if ($m.stance -and -not $bands.ContainsKey($m.stance)) {
  Write-Host "  unknown stance '$($m.stance)' - expected conservative, midpoint or aggressive" -ForegroundColor Red
  $fail++
} elseif ($m.stance) {
  $mp = $m.derivation.midPosition
  $lo = $bands[$m.stance][0]; $hi = $bands[$m.stance][1]
  if ($mp -lt $lo -or $mp -gt $hi) {
    Write-Host "  stance says '$($m.stance)' but midPosition $mp sits outside $lo-$hi" -ForegroundColor Red
    $fail++
  }
}
if ($m.illustrative -ne $true) {
  Write-Host "  the tracked rate file is not marked 'illustrative': true" -ForegroundColor Red
  Write-Host "  market.html reads that marker to tell a user they are looking at sample data," -ForegroundColor Red
  Write-Host "  and it must never be inferred from the stance - 'conservative' is a reasonable" -ForegroundColor Red
  Write-Host "  choice for someone's own rates. If a REAL rate file has replaced the shipped" -ForegroundColor Red
  Write-Host "  one, it does not belong in this repository." -ForegroundColor Red
  $fail++
}
if ($fail -eq 0) {
  Write-Host "  asOf $($m.asOf), stance '$($m.stance)', midPosition $($m.derivation.midPosition)"
}

if ($fail -eq 0) {
  Write-Host "`nALL CHECKS PASS`n" -ForegroundColor Green; exit 0
} else {
  Write-Host "`n$fail PROBLEM(S)`n" -ForegroundColor Red; exit 1
}
