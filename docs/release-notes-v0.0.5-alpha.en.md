# PHITS AI Editor 0.0.5-alpha

[日本語](release-notes-v0.0.5-alpha.md) | English

`0.0.5-alpha` adds a bounded autonomous approval mode and routes Codex requests
for a normal PHITS run through an editor-owned execution path.

## Main changes

- Added **Autonomous (workspace only)**. File changes that the Rust boundary
  validates inside the workspace, and normal runs of the currently selected,
  saved PHITS input, may proceed without per-action confirmation.
- When Codex is asked to run PHITS, it does not start PHITS through the shell.
  It calls the temporary `run_phits` tool provided by the editor. The editor
  validates the request, invokes the existing Rust Runner and official PHITS
  wrapper, and returns the result to the same Codex turn.
- **Confirm first** asks before every PHITS run. **Confirm when needed** can
  grant permission once or for the current Codex connection. **Consultation
  only** rejects the run.
- The approval card shows the input, working directory, PHITS root and version,
  and Codex's reason for requesting the run.
- Unsaved inputs, a target other than the currently selected input,
  workspace-external paths, unresolved prior runs, and duplicate runs in the
  same folder are rejected regardless of approval mode.

## Safety boundary

Codex is not given unrestricted shell access. Direct commands for PHITS,
ANGEL, DCHAIN, and PHIG-3D, network access, and workspace-external writes remain
restricted. Autonomous mode does not use `dangerFullAccess` or unconditional
command approval. Calculation-priority mode still closes the editor and Codex,
so users continue to start it explicitly from the toolbar.

PHITS, Codex CLI, and credentials are not bundled. Official binaries target
Windows 11 x64.

