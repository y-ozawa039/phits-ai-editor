# Known issues and limitations for 0.0.8-alpha

[日本語](known-issues-v0.0.8-alpha.md) | English

- This is an unsigned alpha release for Windows 11 x64. SmartScreen may show a
  warning.
- Users must provide PHITS, Codex CLI, MPI/OpenMP environments, and the
  applicable licenses.
- Official OpenAI guidance cannot guarantee that organization policy, security
  software, or a folder-specific restriction will be resolved. The editor does
  not change Sandbox configuration, access rules, ownership, firewall rules,
  or local policies.
- Codex chat remains available when live writes cannot be verified, but file
  editing and Codex-requested PHITS runs do not run in consultation-only mode.
  Toolbar PHITS execution uses a separate path.
- Diagnostic temporary files and child folders are removed after a probe. An
  abnormal exit can leave probe entries whose names begin with
  `.phits-editor-codex-`.
- A report that redacts the user name from paths can still contain personal
  information in relative folder names or free-form text. Review it carefully
  before sharing it externally.
- Codex can request only a normal PHITS run. Calculation-priority execution
  must be started explicitly from the toolbar. Codex cannot directly run
  ANGEL, DCHAIN, or PHIG-3D.
- `run_phits` accepts only the currently selected, saved `.inp` or `.pht` file.
- Uninstalling the editor does not remove PHITS, Codex CLI, workspaces, inputs,
  or outputs.
