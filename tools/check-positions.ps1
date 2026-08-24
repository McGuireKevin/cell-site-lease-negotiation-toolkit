# =============================================================================
# Negotiating position checks.
#
#   pwsh -File tools/check-positions.ps1
#
# negotiation/positions.json holds the half of a playbook that recurs on every
# site: the standard landlord objections and the answers to them. It is keyed
# by clause category, so it can fall out of step with the library in exactly
# the ways the library cannot notice.
#
# The gates below are all one idea: A POSITION THAT CANNOT BE ACTED ON IS
# WORSE THAN NO POSITION. A category with no clauses behind it, a trade
# pointing nowhere, an objection with no counter — each produces a playbook
# that says something and offers nothing, and a negotiator who reads two of
# those stops reading the rest.
# =============================================================================

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$posFile = Join-Path $root 'negotiation\positions.json'
$fail = 0

if (-not (Test-Path $posFile)) {
  Write-Host "negotiation/positions.json missing" -ForegroundColor Red; exit 1
}

$pos  = Get-Content $posFile -Raw | ConvertFrom-Json -Depth 20
$lib  = Get-Content (Join-Path $root 'clauses\clauses.json') -Raw | ConvertFrom-Json -Depth 20
$cats = @($lib.clauses | ForEach-Object { $_.category } | Sort-Object -Unique)

Write-Host "`n=== 1. categories resolve ===" -ForegroundColor Cyan
$covered = @()
foreach ($p in $pos.byCategory.PSObject.Properties) {
  $covered += $p.Name
  if ($cats -notcontains $p.Name) {
    Write-Host "  '$($p.Name)' has no clauses in the library — nothing can give effect to the position" -ForegroundColor Red
    $fail++
  }
}
Write-Host "  $($covered.Count) categories with a stated position, of $($cats.Count) in the library"

Write-Host "`n=== 2. every position is usable ===" -ForegroundColor Cyan
# A ladder without a walk-away is the one that matters. "Open here, aim here"
# with no floor is how a negotiator concedes past the point where doing nothing
# was better, which is the single most expensive mistake available.
foreach ($p in $pos.byCategory.PSObject.Properties) {
  $v = $p.Value
  foreach ($req in @('position','entitlement')) {
    if (-not $v.$req -or $v.$req.Length -lt 20) {
      Write-Host "  $($p.Name): $req is missing or too short to be one" -ForegroundColor Red; $fail++
    }
  }
  if (-not $v.ladder) {
    Write-Host "  $($p.Name): no ladder — nothing says where to stop" -ForegroundColor Red; $fail++
  } else {
    foreach ($rung in @('opening','target','walkAway')) {
      if (-not $v.ladder.$rung) {
        Write-Host "  $($p.Name): ladder has no '$rung'" -ForegroundColor Red; $fail++
      }
    }
  }
}
if ($fail -eq 0) { Write-Host "  every category states a position, an entitlement and a full ladder" }

Write-Host "`n=== 3. objections have answers ===" -ForegroundColor Cyan
$objCount = 0
foreach ($p in $pos.byCategory.PSObject.Properties) {
  foreach ($o in @($p.Value.objections)) {
    $objCount++
    if (-not $o.landlord -or $o.landlord.Length -lt 10) {
      Write-Host "  $($p.Name): an objection with no wording" -ForegroundColor Red; $fail++
    }
    if (-not $o.counter -or $o.counter.Length -lt 30) {
      Write-Host "  $($p.Name): '$($o.landlord)' has no usable counter" -ForegroundColor Red; $fail++
    }
  }
}
Write-Host "  $objCount objections, each with an answer"

Write-Host "`n=== 4. trades point somewhere ===" -ForegroundColor Cyan
foreach ($p in $pos.byCategory.PSObject.Properties) {
  foreach ($t in @($p.Value.tradeFor)) {
    if ($cats -notcontains $t) {
      Write-Host "  $($p.Name) trades for '$t', which has no clauses in the library" -ForegroundColor Red
      $fail++
    }
    if ($t -eq $p.Name) {
      Write-Host "  $($p.Name) trades for itself" -ForegroundColor Red; $fail++
    }
  }
}
if ($fail -eq 0) { Write-Host "  every trade names a category that exists" }

Write-Host "`n=== 5. strategy is stated ===" -ForegroundColor Cyan
foreach ($k in @('opening','sequencing','concession','doNotRaise','walkAway')) {
  if (-not $pos.strategy.$k) {
    Write-Host "  strategy.$k is missing" -ForegroundColor Red; $fail++
  }
}
if ($fail -eq 0) { Write-Host "  opening, sequencing, concession, do-not-raise and walk-away all stated" }

Write-Host "`n=== 6. status is honest ===" -ForegroundColor Cyan
# These arguments have not been through counsel. Saying so in the file is what
# stops them being quoted as settled house positions.
if ($pos.status -notmatch 'placeholder') {
  Write-Host "  status no longer says placeholder — has this been reviewed? If so, say by whom and when." -ForegroundColor Yellow
} else {
  Write-Host "  marked placeholder, not yet reviewed"
}

$bare = @($cats | Where-Object { $covered -notcontains $_ -and $_ -ne 'boilerplate' })
if ($bare.Count) {
  Write-Host "`n  categories with no position yet: $($bare -join ', ')" -ForegroundColor DarkGray
  Write-Host "  (additive — the playbook falls back to the audit finding where there is no position)" -ForegroundColor DarkGray
}

if ($fail -eq 0) {
  Write-Host "`nALL CHECKS PASS`n" -ForegroundColor Green; exit 0
} else {
  Write-Host "`n$fail PROBLEM(S)`n" -ForegroundColor Red; exit 1
}
