# Known issues and limitations for 0.0.5-alpha

[日本語](known-issues-v0.0.5-alpha.md) | English

- This is an unsigned alpha build for Windows 11 x64. SmartScreen may warn.
- Users must provide PHITS, Codex CLI, MPI/OpenMP prerequisites, and licenses.
- Codex can request only a normal PHITS run. Start calculation-priority mode
  explicitly from the toolbar. Codex cannot directly run ANGEL, DCHAIN, or
  PHIG-3D.
- `run_phits` accepts only the currently selected, saved `.inp`/`.pht` input.
  It never runs an unsaved buffer or silently selects another input.
- The Codex turn waits for PHITS to finish before receiving the result. For a
  long calculation, use the editor's stop action or calculation-priority mode
  when appropriate.
- The temporary local MCP server is added only to the current Codex connection
  and does not modify global Codex settings. A future Codex CLI MCP protocol
  incompatibility may disable only this feature.
- File changes allowed by autonomous mode are still recorded in the normal
  Codex change history and diff-review flow.
- Uninstall does not remove PHITS, Codex CLI, workspaces, inputs, or outputs.

