# Safety boundaries

This document describes behavior that must remain true even when the UI, PHITS
support, or Codex integration is customized.

## Workspace filesystem

- Frontend paths are hints only. Rust accepts workspace-relative paths,
  normalizes them, canonicalizes existing targets, and rejects traversal or
  escape outside the active workspace.
- Symlinks, junctions, alternate path spellings, and Windows short names must
  not bypass containment checks.
- Saving uses atomic replacement. Existing content is copied to the existing
  one-generation backup area before overwrite.
- Supported encodings and line endings are preserved: UTF-8, UTF-8 BOM,
  Windows-31J, CRLF, and LF.
- Dirty Monaco content is not silently replaced by a disk, external, or Codex
  change. Revision disagreement enters an explicit conflict flow.

## PHITS and utility execution

- The user or editor explicitly selects one `.inp` or `.pht` input. File-system
  enumeration order must never select a different input implicitly.
- Concurrent runs in the same working folder are blocked because PHITS uses
  fixed output and temporary names.
- Normal execution uses the validated local PHITS wrapper/environment. ANGEL,
  DCHAIN, and PHIG-3D use fixed validated application paths.
- Codex turns cannot directly start PHITS or its utilities.
- PHITS, its manuals and assets, and user input/output are not redistributed
  under this project's Apache license.

## Codex

- Codex CLI runs locally and is not bundled. Its authentication data must never
  enter logs, Editor Context, Git, or release archives.
- The exposed modes are confirm-first, consultation-only, and on-request.
  Unrestricted filesystem access and unconditional approval are not exposed.
- Network access and writes outside the workspace remain unavailable in every
  mode.
- An approval response must be one of the decisions offered by App Server.
  Unknown decisions are rejected. Consultation-only file or permission requests
  are rejected by Rust.
- Session approvals expire when the App Server connection ends.
- Only App Server file-change/diff events establish that Codex edited a file.
  A Markdown patch in chat is display text.
- Before/after snapshots and document revisions connect each edit to a review
  group. Automatic or session-approved edits use the same history and conflict
  path as manually approved edits.

## Release and privacy

- Never package `.integration`, `.phits-editor`, user settings, logs, credentials,
  PHITS files, or research data.
- A release executable and installer must be built from the commit carrying the
  matching version/tag. Publish hashes and do not replace assets under an
  existing tag.
- Unsigned alpha builds may trigger Windows SmartScreen. Do not instruct users
  to disable platform security globally.

Changes that weaken these boundaries require an explicit design decision,
tests, documentation, and a clear warning. They must not be introduced as a
minor customization.
