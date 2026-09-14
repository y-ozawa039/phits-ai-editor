# PHITS AI Editor 0.0.4-alpha

[日本語](release-notes-v0.0.4-alpha.md) | English

`0.0.4-alpha` adapts the live Codex sandbox diagnostic to real workspace
layouts and improves diagnostic presentation and file-editing workflows.

## Which file should I download?

- For normal use, choose `PHITS-AI-Editor-v0.0.4-alpha-windows-x64-setup.exe`.
- For evaluation, side-by-side versions, development, or investigation, extract
  `PHITS-AI-Editor-v0.0.4-alpha-windows-x64-portable.zip` before running it.
- GitHub's generated `Source code (zip)` is not the portable Windows app.

Verify the selected artifact against `SHA256SUMS.txt` before running it.

## Changes

- If Codex rejects a sandbox policy with explicit writable roots, the editor
  retries the workspace-write probe with a safe alternative policy without ever
  falling back to unsandboxed execution. This avoids false warnings when PHITS
  and the workspace are on different drives.
- The UI now uses the generic label **Sandbox** to avoid confusion with the
  optional Windows feature. Diagnostic details show the implementation actually
  used by Codex (such as `elevated` or `unelevated`) and the implementations
  allowed by organization policy.
- The generated-AI troubleshooting prompt no longer assumes that enabling the
  Windows **Windows Sandbox** feature is the solution. It asks the AI to diagnose
  the observed implementation and live-probe result instead.
- When Codex creates a file, files represented in the diff review are opened as
  editor tabs so the generated file remains easy to reach after closing the diff.
- The Explorer panel can be resized by dragging, remembers its width, and returns
  to the default width when its divider is double-clicked.
- The output panel follows appended lines automatically. Scrolling upward pauses
  following, and returning to the bottom resumes it.
- A manually triggered GitHub Actions workflow now runs checks and creates the
  portable package, NSIS installer, SBOM, and SHA-256 checksums in a clean Windows
  environment.

## Safety and scope

Direct Codex execution of PHITS, ANGEL, DCHAIN, and PHIG-3D remains prohibited by
the safety boundary. Use **Normal run** or **Compute-priority run** in the editor
toolbar for PHITS calculations.

Official binaries target Windows 11 x64. PHITS, Codex CLI, and credentials are
not included. This alpha is unsigned and may trigger Windows SmartScreen. Always
back up important input files.

See the [installation guide](installation.en.md) and
[known issues](known-issues-v0.0.4-alpha.en.md) for details.
