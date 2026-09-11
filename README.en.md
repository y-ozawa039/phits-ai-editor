# PHITS AI Editor

[日本語](README.md) | English

A Tauri desktop application that combines PHITS-Pad-style editing and
execution with AI assistance through Codex App Server.

## Download for Windows

The first alpha release supports Windows 11 x64.

- **Regular use (recommended):**
  [Download the installer](https://github.com/y-ozawa039/phits-ai-editor/releases/download/v0.0.2-alpha/PHITS-AI-Editor-v0.0.2-alpha-windows-x64-setup.exe)
- **Evaluation, portable use, or comparing versions:**
  [Download the portable ZIP](https://github.com/y-ozawa039/phits-ai-editor/releases/download/v0.0.2-alpha/PHITS-AI-Editor-v0.0.2-alpha-windows-x64-portable.zip)
- **Verify after downloading:**
  [SHA-256 checksums](https://github.com/y-ozawa039/phits-ai-editor/releases/download/v0.0.2-alpha/SHA256SUMS.txt)

| Purpose | Choose | Why |
|---|---|---|
| Edit PHITS inputs regularly | Installer | Adds Start menu and uninstall entries and registers `.inp`/`.pht` associations. It is the best choice for opening inputs directly from Explorer. |
| Try the editor first | Portable ZIP | No installation is required. Extract the entire ZIP to a folder and run `phits-ai-editor.exe`. |
| Compare multiple versions or carry it on removable storage | Portable ZIP | Extract each version to a separate folder without registering additional Windows applications. |
| Customize or develop the source with generative AI or other tools | Source code | Intended for development. It cannot be launched as downloaded and must be built using Node.js, pnpm, Rust, and the other development prerequisites. |

> **Important:** GitHub's automatically generated `Source code (zip)` and
> `Source code (tar.gz)` are not the portable Windows application. A ZIP that
> contains `index.html` after extraction is the source archive. To run the
> editor, select the installer or portable ZIP linked above.

See the [installation and first-run guide](docs/installation.en.md) for details
about setup, updates, uninstalling, SmartScreen, and SHA-256 verification.

PHITS and Codex CLI are not bundled. You can launch the editor without a PHITS
configuration when editing only. Codex CLI is required only for AI assistance.

## Interface and workflow demo

PHITS input editing, Codex conversations, and review of changes proposed by
Codex are available in one workspace.

![Reviewing a Codex change in PHITS AI Editor](docs/assets/demos/phits-ai-editor-overview.png)

The following demo shows the workflow from asking Codex about the opened PHITS
input through applying the resulting edit in the editor.

![Codex editing a PHITS input](docs/assets/demos/codex-editing-demo.gif)

## Before using AI assistance

Before first use, follow the official PHITS AI-agent setup in
`<PHITSPATH>\workbench\README-jp.docx` so Codex can find the local PHITS manuals
and safety notes. After installing and signing in to Codex CLI, ask Codex:

> Prepare your environment to run PHITS. Read
> workbench/execution_setup_for_agent.md under the directory identified by the
> PHITSPATH environment variable, and follow its instructions.

Confirm that the setup finishes with
`Setup AI agent environment to PHITS is successfully finished.` before
connecting from PHITS AI Editor. The setup registers a pointer to the PHITS
reference policy in Codex's `AGENTS.md`. Starting with `0.0.2-alpha`, the editor
performs a static check when a workspace opens. Relative to the PHITS root resolved
by **PHITS runtime** settings, it separately reports the PHITS AI resource, the
effective `AGENTS.md` or `AGENTS.override.md` at the PHITS root, Codex global
home, and current workspace, plus consistency with the current PHITS root. Both
official variable forms such as `<PHITSPATH>` and absolute paths are accepted.
This check does not prove that App Server loaded an instruction file, change
the user's files, or block Codex connection and chat. For a problem result, the
user can review and edit a generated troubleshooting prompt, insert it into the
in-editor Codex composer, or copy it. If the Editor cannot connect to Codex, the
prompt can be pasted into a local Codex task in ChatGPT desktop; a Cloud task may
not be able to inspect files on the PC. Prompts are never sent automatically and
configuration is never repaired automatically.

## Development environment

- Windows 11 x64 (official binary target for `0.0.2-alpha`)
- Node.js 24 / pnpm 11
- Rust stable / MSVC
- PHITS 3.37 (automatically detected from `PHITSPATH`, or selected under
  **Settings → PHITS runtime**)
- Codex CLI 0.153.1 or later (only when using AI features)

```powershell
pnpm install
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
pnpm tauri:dev
```

PHITS, Codex CLI, credentials, and PHITS language assets are not included.

See the [MVP specification](docs/mvp-specification.md),
[architecture](ARCHITECTURE.en.md), [build instructions](docs/building.en.md),
[AI customization guide](docs/customizing-with-ai.en.md), and
[safety boundaries](docs/safety-boundaries.en.md). Application users should
start with [installation and first-run setup](docs/installation.en.md).

## License and citation

PHITS AI Editor is released under the [Apache License 2.0](LICENSE). See
[AUTHORS.md](AUTHORS.md) for author and researcher identifiers, and
[CITATION.cff](CITATION.cff) for machine-readable citation metadata. The
dependency inventory is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md),
and the license, copyright, and NOTICE texts included with the distribution
are in [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt). See
[TRADEMARKS.md](TRADEMARKS.en.md) for name, original-logo, and modified-build
display policies, and [SECURITY.md](SECURITY.en.md) for private vulnerability
reporting.

General user documentation is provided in Japanese and English, with a language
switch at the top of each document. Legal originals and machine-readable files,
including `LICENSE`, `NOTICE`, third-party license texts, generated inventories,
and `CITATION.cff`, are not translated so that their meaning and effect are not
altered.
Internal maintainer records—such as the MVP design specification, publication
audit, release-maintainer procedure, and test evidence—are distinct from user
documentation and retain their source language as the authoritative version.

Citation is not a condition of ordinary use. If PHITS AI Editor makes a
substantial contribution to published research, an optional acknowledgment or
citation using `CITATION.cff` is welcome.

This is an independent personal project. It does not imply development,
approval, or warranty by the author's affiliated institution. PHITS and Codex
CLI are separate products, are not included in this repository or its
distributions, and must be obtained from their official providers under their
own terms.

The project is published as a customizable alpha foundation for people who
want to adapt an editor with generative AI or other tools. It primarily targets
users who can inspect logs and source and perform their own investigation,
workaround, and recovery. Individual support and response times are not
guaranteed. See [CONTRIBUTING.md](CONTRIBUTING.en.md) for the Issue and Pull
Request policy.

`PHITS AI Editor` and the green P logo are provisional alpha names and marks.
This is not an official product developed, approved, sponsored, endorsed, or
warranted by JAEA, the PHITS development team, OpenAI, or the author's
affiliated institution.

## Windows alpha release (`0.0.2-alpha`)

Implemented features include:

- Monaco multi-tab editing, search and replace, Undo/Redo, new file, save, and
  Save As
- direct `.inp`/`.pht` opening from Explorer or drag-and-drop onto the
  executable; the parent folder becomes the workspace and the file becomes the
  selected run target; second launches are forwarded to the existing window,
  while normal startup restores the previous workspace and saved tabs
- View-menu toggles for Explorer, Codex, and Output panels; individual 12–28 px
  font settings for Explorer, Editor, and Codex, with application-wide saved
  defaults
- preservation of UTF-8, UTF-8 BOM, Windows-31J, CRLF, and LF; atomic saving
  and a one-generation backup
- syntax highlighting, completion, and Japanese/English hover documentation
  from external redistributable `phits-spec.json`
- normal PHITS execution through the official wrapper and a
  calculation-priority mode that closes Editor/Codex processes
- ANGEL, DCHAIN, and PHIG-3D launching through fixed official paths
- lazy Codex App Server startup with a 0.153.1 minimum schema baseline,
  per-feature compatibility display and safe degradation, named thread resume,
  rename and permanent delete, model selection, Markdown conversation display,
  and safe HTTP/HTTPS links
- bounded 128 KiB Editor Context for the current file, selection, and unsaved
  state; three approval modes, session approvals, full Monaco diff review,
  per-turn checkpoints, post-Codex reload, and conflict protection
- a Codex panel that defaults to one third of the window and can be resized
  between 360 px and one half of the window
- explicit instructions requiring App Server `fileChange` events for edits;
  a patch shown only in chat is not treated as an applied edit
- automatic conversation scrolling unless the user scrolls back to read older
  content
- explicit selection of exactly one `.inp`/`.pht` run target even when the
  workspace contains several, plus conservative production-run recovery and
  duplicate-run prevention when state is uncertain

Generate the unsigned NSIS installer with:

```powershell
pnpm tauri build --bundles nsis
```

The personal alpha release is not code-signed, so Windows SmartScreen may show
a warning. PHITS, Codex, language assets, and credentials are not included.

## Verification

```powershell
pnpm test
pnpm docs:check
pnpm test:licenses
pnpm licenses:generate
pnpm licenses:audit
pnpm test:codex-schema
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-targets
node scripts/app-server-edit-smoke.mjs (Get-Command codex).Source .integration
```

`.github/workflows/codex-cli-compatibility.yml` generates the App Server schema
from the latest Codex CLI each week and checks the four contracts used by the
editor. An ordinary CLI update does not require a new editor release; a failed
check triggers a compatibility review.

Acceptance on the Windows 11 x64 development PC includes real App Server
approvals, PHITS and utility execution, and a five-run comparison with the
official wrapper. A separate Windows 11 x64 PC was also used to verify
installation, opening an `.inp` file through **Open with**, overwriting edited
content, and uninstallation. On that PC, Codex connected successfully, edited
the opened `.inp` file, displayed and accepted its diff, reverted the change
with Ctrl+Z, and reopened the latest Codex change from the Edit menu. PHIG-3D
integration is verified on the development PC; the result on the separate PC
is inconclusive because PHIG-3D itself could not start there. Ubuntu support
and Linux packages are future portability work and are not release
requirements for the first alpha. See the
[Windows alpha test report](docs/windows-alpha-test-report.md).

See the [release notes](docs/release-notes-v0.0.2-alpha.en.md),
[known issues](docs/known-issues-v0.0.2-alpha.en.md), and
[release procedure](docs/releasing.md).
