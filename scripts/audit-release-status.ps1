param(
  [string]$Repository = "y-ozawa039/phits-ai-editor"
)

$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$packagePath = Join-Path $projectRoot "package.json"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI (gh) is required to audit publication status."
}

$packageVersion = (Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json).version
$headSha = (& git -C $projectRoot rev-parse HEAD).Trim()
$localTags = @(& git -C $projectRoot tag --points-at HEAD)
$remoteTags = @((gh api "repos/$Repository/tags?per_page=100" | ConvertFrom-Json) | ForEach-Object name)
$releases = @(gh release list --repo $Repository --limit 100 --json tagName,name,isDraft,isPrerelease,publishedAt | ConvertFrom-Json)
$artifactsResponse = gh api "repos/$Repository/actions/artifacts?per_page=100" | ConvertFrom-Json
$activeArtifacts = @($artifactsResponse.artifacts | Where-Object { -not $_.expired })
$versionTag = "v$packageVersion"

Write-Host "PHITS AI Editor release-state audit" -ForegroundColor Cyan
Write-Host "Repository:       $Repository"
Write-Host "HEAD:             $headSha"
Write-Host "Source version:   $packageVersion"
Write-Host "Local HEAD tags:  $(if ($localTags) { $localTags -join ', ' } else { '(none)' })"
Write-Host "Remote tag:       $(if ($remoteTags -contains $versionTag) { $versionTag } else { '(none)' })"

$matchingRelease = $releases | Where-Object tagName -eq $versionTag | Select-Object -First 1
if ($matchingRelease) {
  Write-Host "GitHub Release:   $($matchingRelease.name) [$($matchingRelease.tagName)]"
} else {
  Write-Host "GitHub Release:   (none)"
}

$headArtifacts = @($activeArtifacts | Where-Object { $_.workflow_run.head_sha -eq $headSha })
Write-Host "HEAD artifacts:   $(if ($headArtifacts) { $headArtifacts.name -join ', ' } else { '(none)' })"
Write-Host ""
Write-Host "Non-expired Actions artifacts (downloadable test builds)" -ForegroundColor Yellow
if ($activeArtifacts) {
  $activeArtifacts |
    Sort-Object created_at -Descending |
    Select-Object name, created_at, expires_at, @{Name="head_sha";Expression={$_.workflow_run.head_sha}} |
    Format-Table -AutoSize
} else {
  Write-Host "(none)"
}

Write-Host "Formal publication requires both a remote tag and a GitHub Release with attached assets."
