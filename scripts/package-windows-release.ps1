param(
  [string]$Version
)

$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw | ConvertFrom-Json
if (-not $Version) { $Version = [string]$manifest.version }
if ($Version -ne [string]$manifest.version) {
  throw "Requested version $Version does not match package.json version $($manifest.version)."
}
$releaseRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "src-tauri\target\release\release-candidate\v$Version"))
$allowedRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "src-tauri\target\release"))
if (-not $releaseRoot.StartsWith($allowedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Release output resolved outside the expected target directory."
}

$application = Join-Path $allowedRoot "phits-ai-editor.exe"
$installer = Join-Path $allowedRoot "bundle\nsis\PHITS AI Editor_${Version}_x64-setup.exe"
if (-not (Test-Path -LiteralPath $application -PathType Leaf)) { throw "Release application is missing: $application" }
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw "NSIS installer is missing: $installer" }

New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
$staging = Join-Path $releaseRoot ("portable-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $staging | Out-Null

$portableName = "PHITS-AI-Editor-v${Version}-windows-x64-portable.zip"
$setupName = "PHITS-AI-Editor-v${Version}-windows-x64-setup.exe"
$sbomName = "SBOM.cdx.json"

function Get-Sha256Hex([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = $algorithm.ComputeHash($stream)
    return ([System.BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
  } finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }
}

try {
  Copy-Item -LiteralPath $application -Destination (Join-Path $staging "phits-ai-editor.exe")
  $documents = @(
    @{ Source = "README.md"; Destination = "README.md" },
    @{ Source = "LICENSE"; Destination = "LICENSE" },
    @{ Source = "NOTICE"; Destination = "NOTICE" },
    @{ Source = "THIRD_PARTY_NOTICES.md"; Destination = "THIRD_PARTY_NOTICES.md" },
    @{ Source = "TRADEMARKS.md"; Destination = "TRADEMARKS.md" },
    @{ Source = "SECURITY.md"; Destination = "SECURITY.md" },
    @{ Source = "docs\known-issues-v$Version.md"; Destination = "KNOWN_ISSUES.md" },
    @{ Source = "docs\release-notes-v$Version.md"; Destination = "RELEASE_NOTES.md" }
  )
  foreach ($document in $documents) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $document.Source) -Destination (Join-Path $staging $document.Destination)
  }

  $commit = (git -C $projectRoot rev-parse HEAD).Trim()
  $dirty = if (git -C $projectRoot status --porcelain) { "dirty working tree" } else { "clean working tree" }
  @(
    "PHITS AI Editor $Version"
    "Source commit: $commit"
    "Packaging state: $dirty"
    "Built at (UTC): $([DateTime]::UtcNow.ToString('o'))"
  ) | Set-Content -LiteralPath (Join-Path $staging "BUILD_INFO.txt") -Encoding utf8

  $sbomPath = Join-Path $releaseRoot $sbomName
  & node (Join-Path $projectRoot "scripts\generate-sbom.mjs") $sbomPath
  if ($LASTEXITCODE -ne 0) { throw "SBOM generation failed." }
  Copy-Item -LiteralPath $sbomPath -Destination (Join-Path $staging $sbomName)

  $portablePath = Join-Path $releaseRoot $portableName
  $setupPath = Join-Path $releaseRoot $setupName
  if (Test-Path -LiteralPath $portablePath) { Remove-Item -LiteralPath $portablePath -Force }
  Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $portablePath -CompressionLevel Optimal
  Copy-Item -LiteralPath $installer -Destination $setupPath -Force

  $hashTargets = @($portablePath, $setupPath, $sbomPath)
  $hashLines = foreach ($target in $hashTargets) {
    "$(Get-Sha256Hex $target)  $([System.IO.Path]::GetFileName($target))"
  }
  $hashLines | Set-Content -LiteralPath (Join-Path $releaseRoot "SHA256SUMS.txt") -Encoding ascii
} finally {
  $resolvedStaging = [System.IO.Path]::GetFullPath($staging)
  if ($resolvedStaging.StartsWith($releaseRoot, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedStaging)) {
    Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
  }
}

Write-Output "Release candidate: $releaseRoot"
Get-ChildItem -LiteralPath $releaseRoot -File | Select-Object Name, Length, LastWriteTime
