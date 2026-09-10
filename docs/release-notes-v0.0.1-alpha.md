# PHITS AI Editor 0.0.1-alpha

This is the first public alpha candidate of an independent, Windows-focused
PHITS input editor with optional local Codex CLI integration.

## Highlights

- Monaco editing for multiple PHITS inputs with encoding and line-ending
  preservation, atomic saving, backups, search, Undo, and Redo
- explicit selection of one PHITS run target, normal/calculation-priority modes,
  conservative run recovery, and fixed ANGEL/DCHAIN/PHIG-3D launch paths
- direct `.inp`/`.pht` opening from Explorer, drag-and-drop, and single-instance
  forwarding
- PHITS installation detection and application-level manual path setting
- Codex App Server conversations, thread management, bounded Editor Context,
  three approval modes, file-change history, conflict protection, and Monaco
  inline/side-by-side review
- startup Codex compatibility probe and a scheduled latest-CLI contract check

## Requirements and scope

- Windows 11 x64 is the first supported binary target.
- PHITS is not included. Install and license PHITS separately.
- Codex CLI and authentication are not included. They are required only for AI
  features.
- The installer is not code-signed and may trigger Windows SmartScreen.

## Alpha warning

Back up important inputs before use. This release is intended for users who can
inspect logs and source, test modifications, and recover their own environment.
It is not warranted for production or safety-critical work, and individual
support or response times are not guaranteed.

See [`known-issues-v0.0.1-alpha.md`](known-issues-v0.0.1-alpha.md) and verify the
published SHA-256 values before running a downloaded artifact.
