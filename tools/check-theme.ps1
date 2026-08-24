# =============================================================================
# Theme invariant check.
#
#   pwsh -File tools/check-theme.ps1
#
# Every single-file tool declares the same rule at the top of its stylesheet:
#
#     "Every colour below is a token — no raw hex should appear in the rules
#      that follow, otherwise it will not flip with the theme."
#
# That is exactly the kind of rule that holds until someone adds one button.
# The failure is quiet: the page still renders, and only the light-mode user
# sees a dark patch. This checks it.
#
# A raw hex is allowed in exactly two places:
#
#   1. A token-declaration block — :root or :root[data-theme=...].
#   2. Anywhere inside @media print. Paper is always white regardless of the
#      screen theme, so those colours are deliberately fixed.
#
# Anywhere else is a colour that cannot flip.
#
# tests.html is NOT checked. It has no theme tokens and is dark-only by design:
# it is a test runner, not something anyone reads for an hour under office
# lighting. Adding it here would mean either theming it for no benefit or
# carrying a permanent exception.
# =============================================================================

$ErrorActionPreference = 'Stop'
$root  = Split-Path -Parent $PSScriptRoot
# Every themed tool. This list is the check — a new tool that is not added here
# is not checked, which is the one way the invariant goes quiet again.
$files = @('Lease-Proposal-Comparator.html','market.html','market-builder.html',
           'draft.html','redline.html','report.html')
$fail  = 0

# Remove an at-rule and its whole body by matching braces, which a regex cannot
# do — @media print contains nested rules.
function Remove-Block([string]$text, [string]$startPattern) {
  while ($true) {
    $m = [regex]::Match($text, $startPattern)
    if (-not $m.Success) { return $text }
    $i = $text.IndexOf('{', $m.Index)
    if ($i -lt 0) { return $text }
    $depth = 0
    for ($j = $i; $j -lt $text.Length; $j++) {
      if ($text[$j] -eq '{') { $depth++ }
      elseif ($text[$j] -eq '}') { $depth--; if ($depth -eq 0) { break } }
    }
    if ($depth -ne 0) { return $text }   # unbalanced; leave it alone
    $text = $text.Remove($m.Index, $j - $m.Index + 1)
  }
}

foreach ($name in $files) {
  $path = Join-Path $root $name
  if (-not (Test-Path $path)) { Write-Host "  skip (absent): $name" -ForegroundColor DarkGray; continue }
  $html = Get-Content $path -Raw

  # Scripts come out FIRST. The export routines build a standalone document as
  # a string, and that string contains its own <style> — fixed colours for a
  # page that will be opened in Word and printed, which have nothing to do with
  # the screen theme. Without this, every tool that can export gets reported for
  # colours that are correct.
  # Tag-delimited, not brace-delimited, so this is a regex rather than
  # Remove-Block. Safe non-greedy: script elements cannot nest.
  $html = [regex]::Replace($html, '(?s)<script\b[^>]*>.*?</script>', '')

  # Take only the stylesheet(s).
  $css = ([regex]::Matches($html,'(?s)<style>(.*?)</style>') | ForEach-Object { $_.Groups[1].Value }) -join "`n"
  if (-not $css) { Write-Host "  skip (no <style>): $name" -ForegroundColor DarkGray; continue }

  # Strip @media print first — it re-declares the light tokens AND sets a few
  # fixed paper colours, all of which are meant to be immovable.
  $stripped = Remove-Block $css '@media\s+print'
  # Then the token-declaration blocks themselves.
  $stripped = [regex]::Replace($stripped, '(?s):root[^{]*\{[^}]*\}', '')

  $hits = [regex]::Matches($stripped, '#[0-9a-fA-F]{3,8}\b')
  if ($hits.Count) {
    Write-Host "  $name" -ForegroundColor Red
    foreach ($h in $hits) {
      # Report the whole declaration so the offender is findable.
      $start = [Math]::Max(0, $h.Index - 90)
      $ctx = ($stripped.Substring($start, [Math]::Min(120, $stripped.Length - $start)) -replace '\s+',' ').Trim()
      Write-Host "      $($h.Value)  ...$ctx..." -ForegroundColor Red
      $fail++
    }
  } else {
    Write-Host "  $name — no raw hex outside the token blocks" -ForegroundColor Green
  }
}

if ($fail -eq 0) { Write-Host "`nTHEME INVARIANT HOLDS`n" -ForegroundColor Green; exit 0 }
else { Write-Host "`n$fail raw colour(s) that will not flip with the theme`n" -ForegroundColor Red; exit 1 }
