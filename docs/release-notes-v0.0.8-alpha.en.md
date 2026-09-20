# PHITS AI Editor 0.0.8-alpha

[日本語](release-notes-v0.0.8-alpha.md) | English

`0.0.8-alpha` separates the editor's role of diagnosing Sandbox problems and
helping users decide what to do from the role of changing machine-wide
configuration. PHITS AI Editor now provides diagnosis and guidance only; it
does not directly change Codex Sandbox or Windows security settings.

## Main changes

- When Sandbox preparation fails, the editor offers a fixed link to official
  OpenAI guidance, re-diagnosis, a diagnostic report, and a prompt for asking
  a generative AI for help.
- Buttons that started `elevated` or `unelevated` setup from the editor were
  removed. The editor does not change local users, firewall rules, local
  policies, ownership, or access rules.
- Folder-specific access problems provide diagnostic details, an AI consultation
  prompt, and a retry without suggesting a machine-wide configuration change.
- The generated consultation prompt asks the AI to investigate read-only first
  and, before any change, explain its effect and rollback method and request the
  user's decision.
- **Help > Diagnostic information details... > Open log folder** now opens only
  the backend-managed, fixed startup-log location.
- Windows test artifacts produced by GitHub Actions include the application
  version and commit ID, making them easier to distinguish from formal GitHub
  Releases.

## Privacy and safety boundaries

Diagnostic results are not cached. The current environment is checked on Codex
connection and manual re-diagnosis. Redacting the user name from paths does not
guarantee that relative folder names or free-form text contain no personal
information. Review the content carefully before sharing it externally.
