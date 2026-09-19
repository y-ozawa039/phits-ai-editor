# Known issues and limitations for 0.0.6-alpha

[日本語](known-issues-v0.0.6-alpha.md) | English

- This is an unsigned alpha release for Windows 11 x64. SmartScreen may show a
  warning.
- Users must provide PHITS, Codex CLI, MPI/OpenMP environments, and the
  applicable licenses.
- Diagnostics help isolate problems but do not automatically change
  organization policy, security-software settings, or existing folder access
  rules.
- Even a path-redacted diagnostic report may retain personal information in an
  error message or folder name. Review it before sharing it externally.
- The startup log retains only minimal diagnostic stages and does not record
  PHITS input contents or detailed Codex responses. It may therefore be
  insufficient to determine a cause by itself.
- Codex can request only a normal PHITS run. Calculation-priority execution
  must be started explicitly from the toolbar. Codex cannot directly run
  ANGEL, DCHAIN, or PHIG-3D.
- `run_phits` accepts only the currently selected, saved `.inp` or `.pht` file.
  It does not run unsaved contents or silently choose a different input.
- File changes allowed in autonomous mode are still recorded in the normal
  Codex change history and diff review.
- Uninstalling the editor does not remove PHITS, Codex CLI, workspaces, inputs,
  or outputs.

