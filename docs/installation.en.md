# Installing and configuring PHITS AI Editor

[日本語](installation.md) | English

This guide covers the `0.0.7-alpha` distribution for Windows 11 x64. PHITS AI
Editor is an independently developed alpha application. Back up important
input files before use.

## 1. Choose a download

| Artifact | Recommended for | Windows integration |
| --- | --- | --- |
| `PHITS-AI-Editor-v0.0.7-alpha-windows-x64-setup.exe` | Normal use | Yes |
| `PHITS-AI-Editor-v0.0.7-alpha-windows-x64-portable.zip` | Evaluation, side-by-side versions, development, and investigation | No |

We recommend the installer for normal use. GitHub's automatically generated
`Source code (zip)` is not the portable Windows application. Although a bare
`phits-ai-editor.exe` can run on its own, it omits the accompanying licenses,
known issues, and build information. Use the complete portable ZIP when
redistributing or retaining a portable copy.

## 2. Prerequisites

- Windows 11 x64
- PHITS (the editor can still start without it for editing only)
- Codex CLI and valid authentication only when using AI assistance
- an internet connection if the installer must obtain WebView2

PHITS, Codex CLI, credentials, and MPI/OpenMP environments are not included.
PHITS AI Editor does not modify the system `PATH` or `PHITSPATH`.

## 3. Installer edition

1. Download `...windows-x64-setup.exe` and `SHA256SUMS.txt` from the GitHub
   Release.
2. Verify SHA-256 as described below.
3. Close PHITS AI Editor and run the installer.
4. Start PHITS AI Editor from the Start menu after installation.

The current installer uses a current-user installation that normally does not
require administrator privileges. It places the app under `%LOCALAPPDATA%` and
provides the following Windows integration:

- a Start menu entry
- registration under Windows **Installed apps**
- an uninstaller
- registration as an application that can open `.inp` and `.pht` files
- installed copies of LICENSE, NOTICE, third-party licenses, and release notes

Depending on existing associations and Windows state, you may need to choose
PHITS AI Editor once from **Open with** after installation. Explorer or Windows
may need to be restarted before a changed file icon appears.

## 4. Portable edition

1. Download `...windows-x64-portable.zip` and `SHA256SUMS.txt` from the GitHub
   Release.
2. Verify SHA-256, then extract the entire ZIP into a dedicated writable
   folder.
3. Run `phits-ai-editor.exe` inside that folder.

Keep the documents and SBOM from the ZIP beside the executable. The portable
edition does not create Start menu entries, an Installed apps entry, file
associations, or an uninstaller. To remove it, close the app and delete the
extracted folder.

## 5. First-run configuration

### PHITS

1. Open **Settings** from the top menu.
2. Select **PHITS runtime**.
3. Confirm automatic detection or select the PHITS root directory.
4. Select **Save settings and verify**.

A setting in the workspace's `.phits-editor/workspace.json` takes precedence
over the application-wide setting. To use MPI or OpenMP, prepare the execution
environment by following the official PHITS procedure.

### Codex

To use AI assistance, install and authenticate Codex CLI separately by
following the [official OpenAI Codex CLI guide](https://developers.openai.com/codex/cli).
At startup, the editor checks App Server compatibility and reports availability
for conversations, threads, file editing, and approvals. PHITS editing and
execution remain available without Codex.

When a workspace opens, the editor performs a static check relative to the PHITS
root resolved by the settings screen. It separately checks the PHITS AI
resource, the effective `AGENTS.md` or `AGENTS.override.md` at the PHITS root,
Codex global home, and current workspace, and consistency of the referenced
root. For partial, mismatched, missing, or unreadable results, expand **Files
checked and reasons** in the Codex panel. This does not guarantee that App
Server actually loaded an instruction file. Codex connection and chat remain
available for every result, and the editor never modifies these files. For a
problem result, review and edit the generated troubleshooting prompt, then
insert it into the in-editor Codex composer or copy it. If Codex cannot connect,
open a local Codex task in ChatGPT desktop on this PC and paste the prompt there.
A Cloud task may be unable to inspect local files.

For the workspace location, the editor checks drive and file-system type, UNC,
special folders, the read-only attribute, path length, and OneDrive scope without
recursively scanning the workspace. Existing diagnostic results and the generated
AI troubleshooting prompt remain available in the Codex panel. Save a diagnostic
report from a warning or **Help > Save diagnostic report...**. The default option
redacts known workspace, PHITS, Codex CLI, and user-profile paths, paths whose
characters were separated by command-output whitespace, and other detectable
local absolute paths; an explicit option preserves them. Relative folder names
and free-form error text may still contain personal information, so review the
contents carefully before sharing them externally.

After Codex connects, the editor checks not only App Server schema compatibility
but also a Sandbox command and three real workspace writes: creating a file at
the workspace root, changing an existing peer file, and creating a file in a
child folder. The writable policy that passes these checks is reused for actual
Codex turns. If the full write sequence cannot be verified, writable approval
modes are disabled and the Rust backend forces consultation-only operation.
When setup recovery is applicable, the UI offers the official App Server setup
path with **elevated (recommended where permitted)** and an explicit
**unelevated retry**. The editor does not directly take ownership of folders,
rewrite ACLs recursively, disable the Sandbox, or grant unrestricted access.

Diagnostic results are not cached in the workspace or settings. Required checks
for PHITS and workspace metadata run again at application start and workspace
changes. The deeper Sandbox execution and write checks run at Codex connection
and manual refresh. A size-limited startup log is stored at the location shown
as **Startup log** in the diagnostic report. It intentionally excludes
input-file contents and credentials and is never reused to decide feature
availability.
Use **Help > Diagnostic information details...** to see the log location, the
256 KiB limit, and the single rotated generation.

## 6. Open `.inp` and `.pht` files directly

With the installer edition, double-click a file in Explorer or select PHITS AI
Editor under **Open with**. The parent directory becomes the workspace, and the
file becomes the selected PHITS run target.

With the portable edition, you can:

- drag a file onto `phits-ai-editor.exe`
- select the extracted `phits-ai-editor.exe` under **Open with**
- start the application first and open the workspace

## 7. SmartScreen warning

`0.0.7-alpha` is not code-signed, so Windows SmartScreen may show a warning.
Do not run a file obtained outside the official GitHub Release or a file whose
SHA-256 does not match. Continue only after verifying the source and hash and
reading the warning yourself.

Use PowerShell to verify an artifact:

```powershell
Get-FileHash .\PHITS-AI-Editor-v0.0.7-alpha-windows-x64-setup.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

The displayed hash must exactly match the entry for the same filename in
`SHA256SUMS.txt`. Hexadecimal letter case does not matter.

## 8. Updating

The alpha has no automatic updater. Download each new release manually.

- Installer: close the app and run the new installer.
- Portable: extract the new release into a separate folder, verify it, and then
  retire the previous folder.

Verify SHA-256 for every release and retain backups of important inputs.

## 9. Uninstalling

Remove the installer edition from **Settings → Apps → Installed apps** in
Windows. Application files, registration, shortcuts, and file associations are
removed by the uninstaller.

Uninstalling does not delete PHITS, Codex CLI, workspaces, `.inp`/`.pht` files,
PHITS outputs, or workspace `.phits-editor` data. This alpha also does not
guarantee complete removal of UI settings, PHITS-path settings, or WebView data
under AppData. A verified full-reset procedure may be added in a future
release.

## 10. Before reporting a problem

- Review the [known issues](known-issues-v0.0.7-alpha.en.md).
- Record the application version, Windows version, reproduction steps,
  expected result, and actual result.
- Do not post credentials, personal information, unpublished research data, or
  PHITS material that you cannot redistribute in an Issue.
- Report security problems according to the
  [security policy](../SECURITY.en.md), not in a public Issue.

This alpha primarily targets users who can inspect logs and source and perform
their own investigation, workaround, and recovery. Individual support and
response times are not guaranteed.
