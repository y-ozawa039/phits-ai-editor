# PHITS AI Editor 0.0.2-alpha

[日本語](release-notes-v0.0.2-alpha.md) | English

`0.0.2-alpha` fixes a false missing-setup result that could be shown for a
correctly configured PHITS Codex environment.

## Which file should I download?

- For normal use, choose `PHITS-AI-Editor-v0.0.2-alpha-windows-x64-setup.exe`.
- For evaluation, side-by-side versions, development, or investigation, extract
  `PHITS-AI-Editor-v0.0.2-alpha-windows-x64-portable.zip` before running it.
- GitHub's generated `Source code (zip)` is not the portable Windows app.

Verify the selected artifact against `SHA256SUMS.txt` before running it.

## Changes

- Detection now uses the PHITS root resolved by the **PHITS runtime** setting.
- The effective `AGENTS.md` or `AGENTS.override.md` at the PHITS root, Codex
  global home, and current workspace are checked separately.
- Official variable forms such as `<PHITSPATH>`, `%PHITSPATH%`, and `$PHITSPATH`,
  absolute paths, case and separator differences are recognized. Existing
  absolute paths are canonicalized to account for aliases such as junctions.
- The AI resource, instruction files, and consistency with the current PHITS
  root are reported individually.
- Aggregate results are separated into confirmed, partial, mismatched, missing,
  and unreadable states. Partial results are information rather than warnings.
- Codex connection and chat are never blocked by this inspection.
- A state-specific troubleshooting prompt can be reviewed, edited, copied, or
  inserted into the connected Codex composer. When connection is unavailable,
  the UI explains how to paste it into a local Codex task in ChatGPT desktop.

This is a static file inspection and does not prove that Codex App Server
actually loaded an instruction. The editor does not modify configuration files.

## Scope

Official binaries remain limited to Windows 11 x64. PHITS, Codex CLI, and
credentials are not included. This alpha is unsigned and may trigger Windows
SmartScreen. Always back up important input files.

See the [installation guide](installation.en.md) and
[known issues](known-issues-v0.0.2-alpha.en.md) for details.
