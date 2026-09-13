# PHITS AI Editor 0.0.3-alpha

[日本語](release-notes-v0.0.3-alpha.md) | English

`0.0.3-alpha` extends Codex connection checks with a live diagnostic that tests
command execution inside Windows Sandbox and writing to the current workspace.

## Which file should I download?

- For normal use, choose `PHITS-AI-Editor-v0.0.3-alpha-windows-x64-setup.exe`.
- For evaluation, side-by-side versions, development, or investigation, extract
  `PHITS-AI-Editor-v0.0.3-alpha-windows-x64-portable.zip` before running it.
- GitHub's generated `Source code (zip)` is not the portable Windows app.

Verify the selected artifact against `SHA256SUMS.txt` before running it.

## Changes

- The diagnostic reports Codex App Server connectivity, Windows Sandbox
  readiness, command execution inside the sandbox, and current-workspace writes
  separately.
- The live probe does not call a model. It writes a temporary marker in the
  workspace, verifies its content, and removes it. It does not run PHITS.
- Results are integrated into **Runtime environment** at the lower left. A
  successful result does not occupy the Codex panel; the existing Codex warning
  appears only when attention is needed.
- **Files checked and reasons** and **Show prompt for generative AI** expose the
  evidence behind the result and a troubleshooting prompt for self-service.
- If no usable thread exists when **Insert into Codex composer** is selected, the
  editor creates a new troubleshooting thread and then inserts the prompt. It
  never submits the prompt automatically.
- The output panel follows appended lines automatically. Scrolling upward pauses
  following, and returning to the bottom resumes it.
- The detailed PHITS Codex setup diagnostic introduced in `0.0.2-alpha` remains
  available.

## Safety and scope

Direct Codex execution of PHITS, ANGEL, DCHAIN, and PHIG-3D remains prohibited by
the safety boundary. Use **Normal run** or **Compute-priority run** in the editor
toolbar for PHITS calculations.

Official binaries target Windows 11 x64. PHITS, Codex CLI, and credentials are
not included. This alpha is unsigned and may trigger Windows SmartScreen. Always
back up important input files.

See the [installation guide](installation.en.md) and
[known issues](known-issues-v0.0.3-alpha.en.md) for details.
