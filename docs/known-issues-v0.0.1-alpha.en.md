# Known issues and limitations for 0.0.1-alpha

[日本語](known-issues-v0.0.1-alpha.md) | English

- Only Windows 11 x64 is targeted for the first binary release. Windows 10 and
  Linux packages are not yet accepted as supported distributions.
- Builds are unsigned, so Windows SmartScreen may display a warning.
- PHITS, Codex CLI, MPI/OpenMP prerequisites, and their licenses remain the
  user's responsibility and are not bundled. The portable build requires an
  existing WebView2 runtime; the NSIS installer uses Tauri's default online
  bootstrapper mode if WebView2 must be installed.
- Codex App Server compatibility is pinned to a 0.153.1 baseline. Newer CLIs are
  probed by feature and may run in a limited mode until their schema is reviewed.
- Diagnostic Editor Context is reserved for future real diagnostics; an empty
  diagnostic chip is intentionally not shown.
- The alpha update channel is manual. A newer release must be downloaded and
  installed explicitly.
- Uninstalling does not remove PHITS, Codex CLI, workspaces, PHITS inputs or
  outputs, or workspace `.phits-editor` metadata. Complete removal of saved UI,
  PHITS-path, and WebView data from AppData is not guaranteed in this alpha.
- Interface details and the provisional product name/logo may change during the
  alpha period.
- The project does not promise individual setup support, issue response times,
  or backward compatibility for customized forks.

Report reproducible problems through the appropriate GitHub Issue form after
removing credentials, personal information, private research data, and PHITS
material that cannot be redistributed. Report vulnerabilities privately as
described in [`../SECURITY.en.md`](../SECURITY.en.md).
