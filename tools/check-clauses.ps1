# =============================================================================
# Clause library checks. Run before committing any change under clauses/.
#
#   pwsh -File tools/check-clauses.ps1
#
# Ten gates. The ones that earn their place:
#
#   4. SANITIZATION  no currency amount, formatted percentage, spelled-out date
#                    or long digit run survives in any clause text
#   8. GRAPH         every conflictsWith and `requires: clause:` resolves, and
#                    conflicts are MUTUAL
#   9. RESOLVABLE    every {{Placeholder}} is one buildResolutionMap supplies
#  10. IMPACTS       every impact category has clauses behind it
#
# Gate 4 is the confidentiality gate and the original reason this script exists.
# The amendment template those clauses came from stored CACHED MERGE RESULTS
# inline -- a real landlord name, site address, FAN, rent and escalator sat
# inside the .docx with no merge run -- so a naive extraction carried all of it
# into the clause files. Those clauses have since been removed entirely, but the
# gate stays: the next person to paste drafting in from a real document will hit
# it, and that is the point.
#
# Note what gate 4 is NOT: it is not a denylist of real names. A file listing
# real landlord names would itself be the leak. It looks for the SHAPE of a
# merged value where a placeholder belongs, which is why it catches values it
# has never seen. It cannot catch a bare proper noun carrying no digits -- that
# is what the manual read-through is for, and why short files were chosen over
# one large one.
#
# Gates 8 and 9 were added when 33 clauses were swapped out at once, and both
# found real damage immediately: three self-conflicts, three one-way conflicts
# that made a swap depend on click order, and five clauses referencing
# placeholders nothing supplied -- each of which had blocked the drafter every
# time, for every deal, since the day it was written.
# =============================================================================

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$clauseDir = Join-Path $root 'clauses'
$json = Get-Content (Join-Path $clauseDir 'clauses.json') -Raw | ConvertFrom-Json -Depth 20
$fail = 0

# The ten defined terms are declared in definedTerms, not placeholders.
$definedTerms = @('RentName','TermName','ExtensionName','AreaName','PropertyName','EquipmentName',
                  'LandlordTitle','TenantTitle','DocumentType','LeaseDocument')

Write-Host "`n=== 1. completeness ===" -ForegroundColor Cyan
foreach ($c in $json.clauses) {
  if (-not (Test-Path (Join-Path $clauseDir $c.textFile))) {
    Write-Host "  MISSING text file: $($c.textFile)" -ForegroundColor Red; $fail++
  }
}
$files = Get-ChildItem (Join-Path $clauseDir 'text') -Filter *.txt
foreach ($f in $files) {
  if ($json.clauses.textFile -notcontains "text/$($f.Name)") {
    Write-Host "  ORPHAN text file: $($f.Name)" -ForegroundColor Red; $fail++
  }
}
Write-Host "  $($json.clauses.Count) clauses, $($files.Count) text files"

Write-Host "`n=== 2. placeholder parity ===" -ForegroundColor Cyan
foreach ($c in $json.clauses) {
  $txt = Get-Content (Join-Path $clauseDir $c.textFile) -Raw
  $used = [regex]::Matches($txt, '\{\{([A-Za-z0-9_\.]+)\}\}') |
          ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
  foreach ($p in $used) {
    if ($p -like 'sectionMap.*') { continue }          # resolved from the deal file
    if ($definedTerms -contains $p) {
      if ($c.definedTerms -notcontains $p) {
        Write-Host "  $($c.id): uses {{$p}}, not declared in definedTerms" -ForegroundColor Red; $fail++ }
      continue
    }
    # A _Words suffix is the same merge field rendered with Word's \* CardText
    # switch -- "two thousand two hundred fifty" beside "2,250.00". One field,
    # two renderings, so it resolves to the same declaration.
    $base = $p -replace '_Words$',''
    if ($c.placeholders -notcontains $base -and $c.placeholders -notcontains $p) {
      Write-Host "  $($c.id): uses {{$p}}, not declared in placeholders" -ForegroundColor Red; $fail++
    }
  }
  # Declared but unused is a weaker signal -- report it, do not fail on it.
  foreach ($m in $c.placeholders) {
    if ($txt -notmatch [regex]::Escape("{{$m}}") -and $txt -notmatch [regex]::Escape("{{${m}_Words}}")) {
      Write-Host "  $($c.id): declares $m but never uses it" -ForegroundColor Yellow
    }
  }
}

Write-Host "`n=== 3. placeholder names are role-based ===" -ForegroundColor Cyan
# A client name must not appear anywhere -- not in a value, not in a FIELD NAME.
# The original template named the tenant field after the client; placeholders here
# are named for the role instead. Anything outside the known set fails, so a new
# party-named placeholder cannot be introduced quietly.
$knownFields = @('RentProposal','EscalatorProposal','Proposed_Amendment','Lease_Commencement_Date',
                 'Current_Term_End_Date','Extension_Term_Start_Date','Rent_Guarantee_End_Date',
                 'SiteName','FAN','Landlord_Name','Landlord_Address',
                 'Tenant_Notice_Entity','Tenant_Notice_Address',
                 'Insurance_CGL_Limit','RAD_Center_Feet','Colocation_Share_Pct',
                 'ROFR_Notice_Days','Governing_Jurisdiction')
foreach ($f in $files) {
  $t = Get-Content $f.FullName -Raw
  foreach ($m in [regex]::Matches($t, '\{\{([A-Za-z0-9_\.]+)\}\}')) {
    $p = $m.Groups[1].Value
    if ($p -like 'sectionMap.*') { continue }
    $base = $p -replace '_Words$',''
    if ($definedTerms -notcontains $base -and $knownFields -notcontains $base) {
      Write-Host "  $($f.Name): unrecognised placeholder {{$p}} -- if this names a party rather than a role, rename it" -ForegroundColor Red
      $fail++
    }
  }
}
if ($fail -eq 0) { Write-Host "  all placeholders are role-based and recognised" }

Write-Host "`n=== 4. sanitization ===" -ForegroundColor Cyan
$patterns = [ordered]@{
  'currency amount'         = '\$\s?\d[\d,]*\.?\d*'
  'formatted percentage'    = '\b\d+\.\d{2}\s?%'
  'spelled-out date'        = '\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b'
  'long digit run (FAN/ID)' = '\b\d{7,}\b'
}
foreach ($f in $files) {
  $t = Get-Content $f.FullName -Raw
  foreach ($k in $patterns.Keys) {
    foreach ($m in [regex]::Matches($t, $patterns[$k])) {
      if ($m.Value -eq '$[AMOUNT]') { continue }        # intentional hand-fill blank
      Write-Host "  $($f.Name): $k -> '$($m.Value)'" -ForegroundColor Red; $fail++
    }
  }
}
if ($fail -eq 0) { Write-Host "  no merged values found in clause text" }

Write-Host "`n=== 5. provenance ===" -ForegroundColor Cyan
# Clauses composed from market research have NOT been used and have NOT been
# reviewed by counsel. They must be distinguishable from language lifted out of
# a document that has actually been signed, or the library quietly launders one
# into the other.
$researched = @($json.clauses | Where-Object { $_.provenance -eq 'researched' })
$sample     = @($json.clauses | Where-Object { -not $_.provenance })
foreach ($c in $researched) {
  if ($c.status -ne 'draft') {
    Write-Host "  $($c.id): provenance is researched but status is '$($c.status)' - researched clauses must stay 'draft' until reviewed" -ForegroundColor Red
    $fail++
  }
}
foreach ($c in $json.clauses) {
  if ($c.provenance -and $c.provenance -ne 'researched' -and $c.provenance -ne 'sample-document') {
    Write-Host "  $($c.id): unknown provenance '$($c.provenance)'" -ForegroundColor Red; $fail++
  }
}
Write-Host "  $($sample.Count) from the sample document (vetted), $($researched.Count) researched (draft, unreviewed)"

Write-Host "`n=== 6. tenant-benefit scoring ===" -ForegroundColor Cyan
# Every clause must carry a score. An unscored clause is invisible to the audit's
# terms analysis — it would silently never appear in a gap, which is worse than
# being scored wrongly, because nothing surfaces it.
foreach ($c in $json.clauses) {
  if ($null -eq $c.tenantBenefit) {
    Write-Host "  $($c.id): no tenantBenefit — the terms analysis cannot see it" -ForegroundColor Red; $fail++
  } elseif ($c.tenantBenefit -lt -2 -or $c.tenantBenefit -gt 3) {
    Write-Host "  $($c.id): tenantBenefit $($c.tenantBenefit) outside -2..3" -ForegroundColor Red; $fail++
  }
}
$dist = $json.clauses | Group-Object tenantBenefit | Sort-Object { [int]$_.Name } -Descending
Write-Host ("  " + (($dist | ForEach-Object { "$($_.Name):$($_.Count)" }) -join "  "))

Write-Host "`n=== 7. generated bundle is current ===" -ForegroundColor Cyan
# draft.html reads clauses/clause-data.js, not clauses.json, because fetch() is
# blocked over file://. A stale bundle means the drafter silently uses old clause
# text while the repository shows the new. Timestamps are a coarse guard, but the
# failure they catch — forgetting to regenerate — is the only one that happens.
$bundle = Join-Path $clauseDir 'clause-data.js'
if (-not (Test-Path $bundle)) {
  Write-Host "  clause-data.js missing — run tools/build-clause-data.ps1" -ForegroundColor Red; $fail++
} else {
  $bundleTime = (Get-Item $bundle).LastWriteTimeUtc
  $newer = @(Get-ChildItem (Join-Path $clauseDir 'clauses.json'),(Join-Path $clauseDir 'impacts.json'),
                           (Join-Path $clauseDir 'text') -Recurse -File |
            Where-Object { $_.LastWriteTimeUtc -gt $bundleTime })
  if ($newer.Count) {
    Write-Host "  clause-data.js is STALE — $($newer.Count) source file(s) newer. Run tools/build-clause-data.ps1" -ForegroundColor Red
    $newer | Select-Object -First 5 | ForEach-Object { Write-Host "      $($_.Name)" -ForegroundColor Red }
    $fail++
  } else {
    Write-Host "  clause-data.js is current"
  }
}

Write-Host "`n=== 8. the relationship graph resolves ===" -ForegroundColor Cyan
# Every conflictsWith and every `requires: clause:` must name a clause that
# exists, and conflicts must be MUTUAL.
#
# A dangling reference is what clause churn produces: remove a variant and the
# ones that pointed at it keep pointing. An ASYMMETRIC conflict is worse,
# because it half-works -- draft.html deselects a conflicting clause when you
# tick the one that declares the conflict, so the swap happens or does not
# depending purely on which order you clicked. Both were found when the 33
# template clauses were replaced.
$ids = @($json.clauses | ForEach-Object { $_.id })
$conf = @{}
foreach ($c in $json.clauses) { $conf[$c.id] = @($c.conflictsWith) }
foreach ($c in $json.clauses) {
  foreach ($x in @($c.conflictsWith)) {
    if ($ids -notcontains $x) {
      Write-Host "  $($c.id): conflictsWith '$x', which does not exist" -ForegroundColor Red; $fail++
    } elseif ($conf[$x] -notcontains $c.id) {
      Write-Host "  $($c.id) -> $x is one-way. Whether the swap happens then depends on click order." -ForegroundColor Red
      $fail++
    }
    if ($x -eq $c.id) { Write-Host "  $($c.id) conflicts with itself" -ForegroundColor Red; $fail++ }
  }
  foreach ($r in @($c.requires)) {
    if ($r -like 'clause:*') {
      $t = $r.Substring(7)
      if ($ids -notcontains $t) {
        Write-Host "  $($c.id): requires clause '$t', which does not exist" -ForegroundColor Red; $fail++
      }
    }
  }
}
$pairs = 0
foreach ($c in $json.clauses) { $pairs += @($c.conflictsWith).Count }
Write-Host "  $($pairs / 2) mutually exclusive pairs, every reference resolves"

Write-Host "`n=== 9. every placeholder can actually be resolved ===" -ForegroundColor Cyan
# A clause using a placeholder nothing supplies can never be assembled -- the
# drafter blocks on it every time, for every deal. boilerplate.governing-law
# was in exactly that state and nobody noticed, because nothing had selected
# every boilerplate clause at once before.
$resolvable = @('RentName','TermName','ExtensionName','AreaName','PropertyName','EquipmentName',
                'LandlordTitle','TenantTitle','DocumentType','LeaseDocument',
                'SiteName','FAN','Landlord_Name','Landlord_Address',
                'Tenant_Notice_Entity','Tenant_Notice_Address','Governing_Jurisdiction',
                'Lease_Commencement_Date','Current_Term_End_Date','Extension_Term_Start_Date',
                'Proposed_Amendment','RentProposal','RentProposal_Words',
                'EscalatorProposal','EscalatorProposal_Words',
                'Rent_Guarantee_End_Date','Insurance_CGL_Limit','Colocation_Share_Pct',
                'ROFR_Notice_Days','RAD_Center_Feet')
foreach ($f in $files) {
  $t = Get-Content $f.FullName -Raw
  foreach ($m in [regex]::Matches($t, '\{\{([A-Za-z0-9_\.]+)\}\}')) {
    $ph = $m.Groups[1].Value
    if ($ph -like 'sectionMap.*') { continue }
    if ($resolvable -notcontains $ph) {
      Write-Host "  $($f.Name): {{$ph}} is not supplied by buildResolutionMap - this clause can never assemble" -ForegroundColor Red
      $fail++
    }
  }
}
if ($fail -eq 0) { Write-Host "  every placeholder in every clause resolves from a deal file" }

Write-Host "`n=== 10. every placeholder has sample language ===" -ForegroundColor Cyan
# A placeholder value is dropped VERBATIM into legal prose, and nothing about
# the field name says what form it should take. 3000000 and "Three Million
# Dollars ($3,000,000.00)" both load, both validate, and one of them reads as
# "limits of not less than 3000000" in an executed document.
$phFile = Join-Path $clauseDir 'placeholders.json'
if (-not (Test-Path $phFile)) {
  Write-Host "  placeholders.json missing" -ForegroundColor Red; $fail++
} else {
  $ph = Get-Content $phFile -Raw | ConvertFrom-Json -Depth 20
  $documented = @($ph.placeholders | ForEach-Object { $_.name })

  foreach ($p in $ph.placeholders) {
    if (-not $p.sample)  { Write-Host "  $($p.name): no sample value" -ForegroundColor Red; $fail++ }
    if (-not $p.renders) { Write-Host "  $($p.name): no rendered example - the sample alone does not show how the sentence reads" -ForegroundColor Red; $fail++ }
    if (-not $p.source)  { Write-Host "  $($p.name): no source - say which deal-file field supplies it" -ForegroundColor Red; $fail++ }
  }

  # Every placeholder actually used must be documented.
  $used = @()
  foreach ($f in $files) {
    $t = Get-Content $f.FullName -Raw
    foreach ($m in [regex]::Matches($t, '\{\{([A-Za-z0-9_\.]+)\}\}')) {
      $n = $m.Groups[1].Value
      if ($n -like 'sectionMap.*') { continue }
      if ($used -notcontains $n) { $used += $n }
    }
  }
  foreach ($u in $used) {
    if ($documented -notcontains $u) {
      Write-Host "  {{$u}} is used but has no sample language - whoever fills it has to guess the form" -ForegroundColor Red
      $fail++
    }
  }
  # Documented but unused is fine: a placeholder may be written ahead of the
  # clause that will use it, which is the state Rent_Guarantee_End_Date is in.
  $unused = @($documented | Where-Object { $used -notcontains $_ })
  if ($unused.Count) {
    Write-Host "  documented but not yet used: $($unused -join ', ')" -ForegroundColor DarkGray
  }
  Write-Host "  $($used.Count) placeholders in use, $($documented.Count) documented"
}

Write-Host "`n=== 11. impact map ===" -ForegroundColor Cyan
# The soft relationships that put a related term on the table when the audit
# never flagged it. An impact pointing at a category with no clauses in it is
# a prompt the drafter can never act on — it says "consider X" and then offers
# nothing, which is worse than staying quiet.
$impactFile = Join-Path $clauseDir 'impacts.json'
if (-not (Test-Path $impactFile)) {
  Write-Host "  impacts.json missing" -ForegroundColor Red; $fail++
} else {
  $imp = Get-Content $impactFile -Raw | ConvertFrom-Json -Depth 20
  $cats = @($json.clauses | ForEach-Object { $_.category } | Sort-Object -Unique)
  $pairs = 0
  foreach ($p in $imp.byCategory.PSObject.Properties) {
    if ($cats -notcontains $p.Name) {
      Write-Host "  source category '$($p.Name)' has no clauses in the library" -ForegroundColor Red; $fail++
    }
    foreach ($t in $p.Value) {
      $pairs++
      if ($cats -notcontains $t.category) {
        Write-Host "  $($p.Name) -> '$($t.category)' — no clauses in that category, so the prompt offers nothing" -ForegroundColor Red
        $fail++
      }
      if ($t.category -eq $p.Name) {
        Write-Host "  $($p.Name) impacts itself" -ForegroundColor Red; $fail++
      }
      if (-not $t.because -or $t.because.Length -lt 30) {
        Write-Host "  $($p.Name) -> $($t.category): no usable reason. A list of ids tells a drafter nothing they can act on." -ForegroundColor Red
        $fail++
      }
    }
  }
  $covered = @($imp.byCategory.PSObject.Properties | ForEach-Object { $_.Name })
  $bare = @($cats | Where-Object { $covered -notcontains $_ -and $_ -ne 'boilerplate' })
  if ($bare.Count) {
    Write-Host "  categories with no impacts declared: $($bare -join ', ')" -ForegroundColor Yellow
  }
  Write-Host "  $($covered.Count) categories, $pairs relationships"
}

if ($fail -eq 0) {
  Write-Host "`nALL CHECKS PASS`n" -ForegroundColor Green; exit 0
} else {
  Write-Host "`n$fail PROBLEM(S)`n" -ForegroundColor Red; exit 1
}
