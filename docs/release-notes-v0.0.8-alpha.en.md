# PHITS AI Editor 0.0.8-alpha

[日本語](release-notes-v0.0.8-alpha.md) | English

`0.0.8-alpha` separates the editor's role of diagnosing Sandbox problems and
helping users decide what to do from the role of changing machine-wide
configuration. PHITS AI Editor now provides diagnosis and guidance only; it
does not directly change Codex Sandbox or Windows security settings.

## Main changes

- When automatic writes cannot be verified, the user can run an optional
  real-edit diagnostic that uses the selected model and reasoning effort to
  modify only a dedicated temporary file. The editor explains creation, the
  one-line edit, and cleanup before it starts. After the user starts the test,
  Rust accepts only a change verified to target that diagnostic file; no second
  approval card is shown for the same change.
- A successful real-edit diagnostic enables editing only for the same
  connection. The user may alternatively select **Allow editing regardless of
  diagnostic result** to remove only the editor's diagnostic gate for the
  current workspace and connection. Neither choice changes the
  Sandbox, approval settings, workspace boundary, or PHITS-run validation.
- When Codex cannot connect, the UI explains how to paste the diagnostic prompt
  into a local Codex task in the ChatGPT desktop app.
- The buttons, introduced experimentally in v0.0.7-alpha, that started
  `elevated` or `unelevated` setup from the editor have been removed. The
  editor does not change local users, firewall rules, local policies,
  ownership, or access rules.
- Folder-specific access problems provide diagnostic details, an AI consultation
  prompt, and a retry without suggesting a machine-wide configuration change.
- The generated consultation prompt asks the AI to investigate read-only first
  and, before any change, explain its effect and rollback method and request the
  user's decision.
- **Help > Diagnostic information details... > Open log folder**, introduced
  experimentally in v0.0.6-alpha, now opens only the backend-managed, fixed
  startup-log location.
- Windows test artifacts produced by GitHub Actions include the application
  version and commit ID, making them easier to distinguish from formal GitHub
  Releases.

## Privacy and safety boundaries

Diagnostic results are not cached. The current environment is checked on Codex
connection and manual re-diagnosis. Redacting the user name from paths does not
guarantee that relative folder names or free-form text contain no personal
information. Review the content carefully before sharing it externally.
