# PHITS AI Editor

[日本語](README.md) | English

A Tauri desktop application that combines PHITS-Pad-style editing and
execution with AI assistance through Codex App Server.

## For Windows users

The first alpha release supports Windows 11 x64. For normal use, we recommend
`PHITS-AI-Editor-v0.0.1-alpha-windows-x64-setup.exe`, which registers the app
with Windows, associates `.inp` and `.pht` files, and provides an uninstaller.
For evaluation, side-by-side versions, development, or investigation, use
`PHITS-AI-Editor-v0.0.1-alpha-windows-x64-portable.zip`.

GitHub's automatically generated `Source code (zip)` is not the portable
Windows application. Download either the installer or the portable ZIP with
its required documents, rather than a bare executable. See the
[installation and first-run guide](docs/installation.en.md) for details about
setup, updates, uninstalling, SmartScreen, and SHA-256 verification.

PHITS and Codex CLI are not bundled. You can launch the editor without a PHITS
configuration when editing only. Codex CLI is required only for AI assistance.

## Development environment

- Windows 11 x64 (official binary target for `0.0.1-alpha`)
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

## Windows alpha release (`0.0.1-alpha`)

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

Acceptance on the current Windows 11 x64 development PC includes real App
Server approvals, PHITS and utility execution, and a five-run comparison with
the official wrapper. The remaining pre-release acceptance item is an
installer test in a clean Windows environment. Ubuntu support and Linux
packages are future portability work and are not release requirements for the
first alpha. See the [Windows alpha test report](docs/windows-alpha-test-report.md).

See the [release notes](docs/release-notes-v0.0.1-alpha.en.md),
[known issues](docs/known-issues-v0.0.1-alpha.en.md), and
[release procedure](docs/releasing.md).
