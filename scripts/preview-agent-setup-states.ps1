param(
  [ValidateSet("All", "Confirmed", "Partial", "Mismatch", "Missing", "Unreadable")]
  [string]$Case = "All",
  [string]$Executable,
  [switch]$SkipBuild,
  [switch]$PrepareOnly,
  [switch]$KeepFixtures
)

$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$previewParent = [System.IO.Path]::GetFullPath((Join-Path ([System.IO.Path]::GetTempPath()) "phits-ai-editor-agent-setup-preview"))
$previewRoot = Join-Path $previewParent ([Guid]::NewGuid().ToString("N"))
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$policyRelative = "workbench\AI\reference_policy.md"
$originalPreviewHome = [Environment]::GetEnvironmentVariable("PHITS_AI_EDITOR_TEST_CODEX_HOME", "Process")

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $parent = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function New-PreviewCase(
  [string]$Name,
  [string]$Expected,
  [ValidateSet("Confirmed", "Partial", "Mismatch", "Missing", "Unreadable")]
  [string]$State
) {
  $caseRoot = Join-Path $previewRoot $Name.ToLowerInvariant()
  $phitsRoot = Join-Path $caseRoot "phits-current"
  $codexHome = Join-Path $caseRoot "codex-home-for-static-inspection"
  $workspace = if ($State -eq "Confirmed") {
    Join-Path $phitsRoot "user\preview-workspace"
  } else {
    Join-Path $caseRoot "external-workspace"
  }
  $input = Join-Path $workspace "preview.inp"
  New-Item -ItemType Directory -Path $phitsRoot, $codexHome, $workspace -Force | Out-Null
  Write-Utf8NoBom $input "[ Title ]`r`nPHITS Codex setup preview: $Name`r`n`r`n[ End ]`r`n"
  $workspaceSettings = @{ settings = @{ phitsRoot = $phitsRoot } } | ConvertTo-Json -Depth 4
  Write-Utf8NoBom (Join-Path $workspace ".phits-editor\workspace.json") $workspaceSettings

  if ($State -ne "Missing") {
    Write-Utf8NoBom (Join-Path $phitsRoot $policyRelative) "Preview-only PHITS reference policy fixture."
  }

  switch ($State) {
    "Confirmed" {
      Write-Utf8NoBom (Join-Path $phitsRoot "AGENTS.md") "Read <PHITSPATH>/workbench/AI/reference_policy.md before PHITS work."
    }
    "Partial" {
      Write-Utf8NoBom (Join-Path $phitsRoot "AGENTS.md") "Read <PHITSPATH>/workbench/AI/reference_policy.md before PHITS work."
    }
    "Mismatch" {
      $oldPolicy = Join-Path $caseRoot "phits-old\workbench\AI\reference_policy.md"
      Write-Utf8NoBom $oldPolicy "Old preview policy."
      Write-Utf8NoBom (Join-Path $codexHome "AGENTS.md") "Read ``$oldPolicy`` before PHITS work."
    }
    "Unreadable" {
      [System.IO.File]::WriteAllBytes((Join-Path $codexHome "AGENTS.md"), [byte[]](0xff, 0xfe, 0xfd))
    }
  }

  [PSCustomObject]@{
    Name = $Name
    Expected = $Expected
    Input = $input
    CodexHome = $codexHome
  }
}

try {
  New-Item -ItemType Directory -Path $previewRoot -Force | Out-Null
  $cases = @(
    New-PreviewCase "Confirmed" "No setup notice" "Confirmed"
    New-PreviewCase "Partial" "Blue informational partial-setup notice" "Partial"
    New-PreviewCase "Mismatch" "Warning about another PHITS root" "Mismatch"
    New-PreviewCase "Missing" "Warning about missing setup files" "Missing"
    New-PreviewCase "Unreadable" "Warning about an unreadable instruction file" "Unreadable"
  )
  if ($Case -ne "All") {
    $cases = @($cases | Where-Object Name -eq $Case)
  }

  Write-Host "Created temporary PHITS Codex setup preview fixtures." -ForegroundColor Cyan
  Write-Host "Location: $previewRoot"
  $cases | Format-Table Name, Expected, Input -AutoSize
  if ($PrepareOnly) {
    $KeepFixtures = $true
    return
  }

  if (-not $Executable) {
    $Executable = Join-Path $projectRoot "src-tauri\target\debug\phits-ai-editor.exe"
  }
  $Executable = [System.IO.Path]::GetFullPath($Executable)
  if (-not $SkipBuild) {
    Push-Location $projectRoot
    try {
      & pnpm tauri build --debug --no-bundle
      if ($LASTEXITCODE -ne 0) { throw "The Tauri debug build failed." }
    } finally {
      Pop-Location
    }
  }
  if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
    throw "Debug executable not found: $Executable"
  }
  if (Get-Process -Name "phits-ai-editor" -ErrorAction SilentlyContinue) {
    throw "PHITS AI Editor is already running. Close it before running this script."
  }

  $index = 0
  foreach ($previewCase in $cases) {
    $index++
    Write-Host ""
    Write-Host "[$index/$($cases.Count)] $($previewCase.Name)" -ForegroundColor Green
    Write-Host "Expected: $($previewCase.Expected)"
    Write-Host "Connect to Codex and expand the checked-files details when shown."
    Write-Host "Close the Editor after inspection to launch the next case."
    [Environment]::SetEnvironmentVariable("PHITS_AI_EDITOR_TEST_CODEX_HOME", $previewCase.CodexHome, "Process")
    Start-Process -FilePath $Executable -ArgumentList ('"{0}"' -f $previewCase.Input) -Wait
  }
} finally {
  [Environment]::SetEnvironmentVariable("PHITS_AI_EDITOR_TEST_CODEX_HOME", $originalPreviewHome, "Process")
  if (-not $KeepFixtures -and (Test-Path -LiteralPath $previewRoot)) {
    $resolvedPreviewRoot = [System.IO.Path]::GetFullPath($previewRoot)
    if ($resolvedPreviewRoot.StartsWith($previewParent, [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedPreviewRoot -Recurse -Force
    }
  } elseif (Test-Path -LiteralPath $previewRoot) {
    Write-Host "Kept preview fixtures: $previewRoot"
  }
}
