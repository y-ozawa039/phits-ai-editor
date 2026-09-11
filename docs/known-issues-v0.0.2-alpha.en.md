# Known issues and limitations for 0.0.2-alpha

[日本語](known-issues-v0.0.2-alpha.md) | English

- Official binaries target Windows 11 x64 only. Windows 10 and Linux have not
  completed acceptance as supported distributions.
- The build is unsigned and may trigger Windows SmartScreen.
- Users must provide PHITS, Codex CLI, MPI/OpenMP prerequisites, and licenses.
- PHITS Codex setup inspection is a static diagnostic. It cannot confirm that
  App Server actually loaded an instruction file.
- Codex App Server compatibility uses 0.153.1 as its baseline. A newer CLI is
  checked by feature and may operate in a limited mode until its schema passes.
- The alpha has no automatic updater. Install newer releases manually.
- Uninstall does not remove PHITS, Codex CLI, workspaces, PHITS inputs/outputs,
  or `.phits-editor` metadata.
- Interfaces, the provisional product name, and logo may change during alpha.
- Individual environment support, Issue response times, and compatibility of
  customized forks are not guaranteed.

Remove credentials, personal information, private research data, and
non-redistributable PHITS materials before reporting a reproducible GitHub
Issue. Report vulnerabilities privately under the
[security policy](../SECURITY.en.md).
