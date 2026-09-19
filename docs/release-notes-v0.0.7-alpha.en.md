# PHITS AI Editor 0.0.7-alpha

[日本語](release-notes-v0.0.7-alpha.md) | English

`0.0.7-alpha` connects live Sandbox diagnostics to editing availability, so a
compatible App Server schema is no longer enough to mark a workspace writable.

## Main changes

- The Sandbox diagnostic first checks an explicit writable root and also checks
  the current-working-directory policy when the explicit form is unsupported.
- Only a write policy that passes command execution, workspace-root creation,
  existing-file-equivalent changes, and child-folder creation is reused for
  normal turns in the same Codex connection.
- A connection without verified live writes is fixed to consultation-only under
  **Action approval**. The Rust boundary, not only the UI, prevents writable
  turns from starting.
- When live writes fail under `unelevated`, users can choose **Set up elevated
  (recommended)** or **Set up unelevated**, subject to organization policy.
- Setup uses the official Codex App Server request. The editor never recursively
  changes folder access rules, takes ownership, disables the Sandbox, or grants
  full access.
- Path-redacted diagnostic reports also replace known paths altered by inserted
  whitespace and other detectable local absolute paths.

## Privacy and safety boundaries

Relative folder names and free-form text can still contain personal information
after path redaction. Review a report before sharing it externally. Diagnostic
results remain uncached, and live Sandbox checks run on Codex connection and
manual re-diagnosis.
