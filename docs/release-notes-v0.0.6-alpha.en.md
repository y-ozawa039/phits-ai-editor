# PHITS AI Editor 0.0.6-alpha

[日本語](release-notes-v0.0.6-alpha.md) | English

`0.0.6-alpha` expands runtime diagnostics, workspace-location checks,
diagnostic reports, and startup logging so problems on unfamiliar Windows
environments can be isolated more easily.

## Main changes

- The Sandbox probe now reports command execution, creation at the workspace
  root, modification of an existing-file equivalent, creation in a child
  directory, and folder access rules as separate checks.
- Command execution that does not write files is separated from three write
  checks, making it easier to distinguish command startup failures from denied
  workspace writes.
- The explicit Sandbox repair action appears only when repair is considered
  applicable.
- The editor inspects drive kind, filesystem, UNC paths, special folders,
  read-only attributes, path length, and OneDrive scope without recursively
  scanning the workspace.
- Windows command output that is prone to mojibake is decoded as Unicode, and
  long diagnostic results can be scrolled.
- A diagnostic report can be saved as text or Markdown from a problem notice or
  from **Help > Save diagnostic report...**. Known paths such as the user
  profile and workspace are redacted by default.
- **Help > Diagnostic information...** shows the startup-log location and
  retention rules. The log is limited to 256 KiB with one rotated generation.
- Diagnostic results are not cached. Lightweight environment checks run at
  startup and on workspace changes; live Sandbox checks run when Codex connects
  and when diagnostics are refreshed manually.
- Diagnostic and settings dialogs receive initial focus and can be closed with
  Escape.

## Quality assurance

- Reproducible Sandbox diagnostic scenarios are validated in Windows CI. This
  is a development-time regression test, not an end-user feature.

## Privacy and safety boundaries

The startup log does not record workspace paths, PHITS input contents, or
authentication data. Connection failures are logged only as categories; raw
error text is not copied into the startup log. Path redaction replaces known
local paths, but paths altered by inserted line breaks or spaces inside error
text may remain. Error messages or folder names may also contain personal
information. Review a report carefully before sharing it externally.

Diagnostics never widen permissions automatically. Codex file operations and
PHITS execution continue to use the approval modes and editor-owned validated
execution path introduced in `0.0.5-alpha`.
