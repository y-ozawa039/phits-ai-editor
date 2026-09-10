# PHITS AI Editor 0.0.1-alpha

This is the first public alpha candidate of an independent, Windows-focused
PHITS input editor with optional local Codex CLI integration.

## Which file should I download?

- For normal use, download
  `PHITS-AI-Editor-v0.0.1-alpha-windows-x64-setup.exe`.
  It installs for the current Windows user, adds the Start menu and uninstall
  entries, and registers the app as a handler for `.inp` and `.pht` files.
- For evaluation, side-by-side versions, or development, download
  `PHITS-AI-Editor-v0.0.1-alpha-windows-x64-portable.zip` and extract the whole
  archive before running it.
- GitHub's automatically generated `Source code (zip)` is not the portable
  Windows application. A bare executable is not offered as a release asset.

Download `SHA256SUMS.txt` as well and verify the selected artifact before
running it. Full Japanese installation, first-run, update, and uninstall
instructions are available in the
[`installation.md` guide](https://github.com/y-ozawa039/phits-ai-editor/blob/v0.0.1-alpha/docs/installation.md).

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
- PHITS AI Editor does not modify the system `PATH` or `PHITSPATH`.
- The installer uses Tauri's current-user mode and normally does not require
  administrator privileges. Its default WebView2 bootstrapper mode may require
  an internet connection if the runtime must be installed.

## First launch

1. Open **Settings → PHITS runtime** and confirm automatic detection or select
   the PHITS root directory.
2. If AI assistance is needed, install and authenticate Codex CLI separately,
   then confirm the four compatibility capabilities shown by the editor.
3. Open an `.inp` or `.pht` file from Explorer, drag it onto the executable, or
   open its parent workspace from the application.

The alpha has no automatic updater. Close the application and run a newer
installer manually, or extract a newer portable release into a separate
directory.

## Alpha warning

Back up important inputs before use. This release is intended for users who can
inspect logs and source, test modifications, and recover their own environment.
It is not warranted for production or safety-critical work, and individual
support or response times are not guaranteed.

See the
[`installation.md` guide](https://github.com/y-ozawa039/phits-ai-editor/blob/v0.0.1-alpha/docs/installation.md)
and
[`known issues`](https://github.com/y-ozawa039/phits-ai-editor/blob/v0.0.1-alpha/docs/known-issues-v0.0.1-alpha.md),
and verify the published SHA-256 values before running a downloaded artifact.
