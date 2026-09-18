param(
  [ValidateSet("All", "HealthyExisting", "ProtectedInheritance", "OwnerOnly", "ExplicitWriteDeny", "UnicodePath")]
  [string]$Case = "All",
  [string]$Executable,
  [switch]$SkipBuild,
  [switch]$ValidateFixturesOnly
)

$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$previewParent = [System.IO.Path]::GetFullPath((Join-Path $projectRoot ".integration\sandbox-diagnostic-preview"))
$previewRoot = Join-Path $previewParent ([Guid]::NewGuid().ToString("N"))
$markerPath = Join-Path $previewRoot ".phits-ai-editor-sandbox-preview"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$aclSnapshots = [System.Collections.Generic.List[object]]::new()

function Assert-PreviewPath([string]$Path) {
  $resolved = [System.IO.Path]::GetFullPath($Path)
  $prefix = $previewRoot.TrimEnd('\') + '\'
  if (-not $resolved.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify a path outside the preview root: $resolved"
  }
  return $resolved
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $resolved = Assert-PreviewPath $Path
  $parent = Split-Path -Parent $resolved
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  [System.IO.File]::WriteAllText($resolved, $Content, $utf8NoBom)
}

function Save-AclSnapshot([string]$Path) {
  $resolved = Assert-PreviewPath $Path
  $aclSnapshots.Add([PSCustomObject]@{
    Path = $resolved
  })
}

function Protect-InheritanceAndKeepRules([string]$Path) {
  $resolved = Assert-PreviewPath $Path
  Save-AclSnapshot $resolved
  $acl = Get-Acl -LiteralPath $resolved
  $acl.SetAccessRuleProtection($true, $true)
  Set-Acl -LiteralPath $resolved -AclObject $acl
}

function Set-OwnerOnlyAcl([string]$Path) {
  $resolved = Assert-PreviewPath $Path
  Save-AclSnapshot $resolved
  $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $systemSid = [System.Security.Principal.SecurityIdentifier]::new("S-1-5-18")
  $administratorsSid = [System.Security.Principal.SecurityIdentifier]::new("S-1-5-32-544")
  $inheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
    [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  $acl = [System.Security.AccessControl.DirectorySecurity]::new()
  $acl.SetOwner($currentSid)
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($sid in @($currentSid, $systemSid, $administratorsSid)) {
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
      $sid,
      [System.Security.AccessControl.FileSystemRights]::FullControl,
      $inheritance,
      [System.Security.AccessControl.PropagationFlags]::None,
      [System.Security.AccessControl.AccessControlType]::Allow
    )
    [void]$acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $resolved -AclObject $acl
}

function Add-ExplicitWriteDeny([string]$Path) {
  $resolved = Assert-PreviewPath $Path
  Save-AclSnapshot $resolved
  $authenticatedUsersSid = [System.Security.Principal.SecurityIdentifier]::new("S-1-5-11")
  $inheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
    [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
    $authenticatedUsersSid,
    [System.Security.AccessControl.FileSystemRights]::Write,
    $inheritance,
    [System.Security.AccessControl.PropagationFlags]::None,
    [System.Security.AccessControl.AccessControlType]::Deny
  )
  $acl = Get-Acl -LiteralPath $resolved
  [void]$acl.AddAccessRule($rule)
  Set-Acl -LiteralPath $resolved -AclObject $acl
}

function New-PreviewCase(
  [string]$Name,
  [string]$DirectoryName,
  [string]$Expected,
  [ValidateSet("None", "ProtectedInheritance", "OwnerOnly", "ExplicitWriteDeny")]
  [string]$AclMode = "None"
) {
  $caseRoot = Assert-PreviewPath (Join-Path $previewRoot $DirectoryName)
  New-Item -ItemType Directory -Path $caseRoot -Force | Out-Null
  Write-Utf8NoBom (Join-Path $caseRoot "preview.inp") "[ Title ]`r`nSandbox diagnostic preview: $Name`r`n`r`n[ End ]`r`n"
  Write-Utf8NoBom (Join-Path $caseRoot "existing-note.txt") "This existing file makes the fixture non-empty.`r`n"
  Write-Utf8NoBom (Join-Path $caseRoot "input\material.inc") "c Preview-only nested file.`r`n"

  switch ($AclMode) {
    "ProtectedInheritance" { Protect-InheritanceAndKeepRules $caseRoot }
    "OwnerOnly" { Set-OwnerOnlyAcl $caseRoot }
    "ExplicitWriteDeny" { Add-ExplicitWriteDeny $caseRoot }
  }

  [PSCustomObject]@{
    Name = $Name
    Expected = $Expected
    Input = Join-Path $caseRoot "preview.inp"
  }
}

try {
  New-Item -ItemType Directory -Path $previewRoot -Force | Out-Null
  [System.IO.File]::WriteAllText($markerPath, "Temporary PHITS AI Editor sandbox diagnostic fixtures.", $utf8NoBom)

  $unicodeDirectoryName = "05-" + (-join @(
    [char]0x7A7A, [char]0x767D, [char]0x0020, [char]0x3068, [char]0x0020,
    [char]0x65E5, [char]0x672C, [char]0x8A9E, [char]0x002D, [char]0x0070,
    [char]0x0061, [char]0x0074, [char]0x0068
  ))
  $allCases = @(
    New-PreviewCase "HealthyExisting" "01-healthy-existing" "All functional checks available; no warning"
    New-PreviewCase "ProtectedInheritance" "02-protected-inheritance" "Writes succeed; access-rule detail notes protected inheritance without an overall warning" "ProtectedInheritance"
    New-PreviewCase "OwnerOnly" "03-owner-only" "Elevated mode should expose a workspace-specific access problem; unelevated may remain available" "OwnerOnly"
    New-PreviewCase "ExplicitWriteDeny" "04-explicit-write-deny" "Workspace write checks fail and the result is classified as workspace permissions" "ExplicitWriteDeny"
    New-PreviewCase "UnicodePath" $unicodeDirectoryName "All functional checks available through a path containing spaces and Japanese characters"
  )
  $cases = $allCases
  if ($Case -ne "All") {
    $cases = @($cases | Where-Object Name -eq $Case)
  }

  Write-Host "Created temporary Sandbox diagnostic fixtures." -ForegroundColor Cyan
  Write-Host "Location: $previewRoot"
  $cases | Format-Table Name, Expected -Wrap -AutoSize

  if ($ValidateFixturesOnly) {
    $protected = Get-Acl -LiteralPath (Split-Path -Parent ($allCases | Where-Object Name -eq "ProtectedInheritance").Input)
    $ownerOnly = Get-Acl -LiteralPath (Split-Path -Parent ($allCases | Where-Object Name -eq "OwnerOnly").Input)
    $explicitDeny = Get-Acl -LiteralPath (Split-Path -Parent ($allCases | Where-Object Name -eq "ExplicitWriteDeny").Input)
    $explicitDenyCount = @($explicitDeny.Access | Where-Object {
      -not $_.IsInherited -and $_.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Deny
    }).Count
    if (-not $protected.AreAccessRulesProtected) { throw "ProtectedInheritance fixture did not protect inheritance." }
    if (-not $ownerOnly.AreAccessRulesProtected) { throw "OwnerOnly fixture did not protect inheritance." }
    if ($explicitDenyCount -lt 1) { throw "ExplicitWriteDeny fixture has no explicit deny rule." }
    if (-not (Test-Path -LiteralPath ($allCases | Where-Object Name -eq "UnicodePath").Input -PathType Leaf)) {
      throw "UnicodePath fixture was not created."
    }
    Write-Host "Fixture ACL and path validation passed; no Editor was launched." -ForegroundColor Green
    return
  }

  $explicitExecutable = $PSBoundParameters.ContainsKey("Executable")
  if (-not $Executable) {
    $Executable = Join-Path $projectRoot "src-tauri\target\debug\phits-ai-editor.exe"
  }
  $Executable = [System.IO.Path]::GetFullPath($Executable)
  if (-not $SkipBuild -and -not $explicitExecutable) {
    Push-Location $projectRoot
    try {
      & pnpm tauri build --debug --no-bundle
      if ($LASTEXITCODE -ne 0) { throw "The Tauri debug build failed." }
    } finally {
      Pop-Location
    }
  }
  if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
    throw "Editor executable not found: $Executable"
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
    Write-Host "Connect to Codex, run the environment refresh once, and expand the diagnostic details."
    Write-Host "Close the Editor after inspection to launch the next case."
    Start-Process -FilePath $Executable -ArgumentList ('"{0}"' -f $previewCase.Input) -Wait
  }
} finally {
  for ($index = $aclSnapshots.Count - 1; $index -ge 0; $index--) {
    $snapshot = $aclSnapshots[$index]
    try {
      & icacls.exe $snapshot.Path /reset /T /C /Q | Out-Null
      if ($LASTEXITCODE -ne 0) {
        throw "icacls exited with code $LASTEXITCODE"
      }
    } catch {
      Write-Warning "Could not restore access rules for $($snapshot.Path): $($_.Exception.Message)"
    }
  }

  if (Test-Path -LiteralPath $previewRoot -PathType Container) {
    $resolvedRoot = [System.IO.Path]::GetFullPath($previewRoot)
    $expectedPrefix = $previewParent.TrimEnd('\') + '\'
    if (
      $resolvedRoot.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
      (Test-Path -LiteralPath $markerPath -PathType Leaf)
    ) {
      Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
    } else {
      Write-Warning "Preview cleanup was skipped because the safety marker or path check failed: $resolvedRoot"
    }
  }
}
