# Known issues and limitations for 0.0.1-alpha

- Only Windows 11 x64 is targeted for the first binary release. Windows 10 and
  Linux packages are not yet accepted as supported distributions.
- Builds are unsigned, so Windows SmartScreen may display a warning.
- PHITS, Codex CLI, WebView2/runtime prerequisites, and their licenses remain the
  user's responsibility and are not bundled.
- Codex App Server compatibility is pinned to a 0.153.1 baseline. Newer CLIs are
  probed by feature and may run in a limited mode until their schema is reviewed.
- Diagnostic Editor Context is reserved for future real diagnostics; an empty
  diagnostic chip is intentionally not shown.
- The alpha update channel is manual. A newer release must be downloaded and
  installed explicitly.
- Interface details and the provisional product name/logo may change during the
  alpha period.
- The project does not promise individual setup support, issue response times,
  or backward compatibility for customized forks.

Report reproducible problems through the appropriate GitHub Issue form after
removing credentials, personal information, private research data, and PHITS
material that cannot be redistributed. Report vulnerabilities privately as
described in [`../SECURITY.md`](../SECURITY.md).
