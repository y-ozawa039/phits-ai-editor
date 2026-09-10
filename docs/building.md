# Building PHITS AI Editor

## Supported development environment

The first binary distribution target is Windows 11 x64. CI also compiles and
tests the source on Ubuntu, but an official Linux binary is not yet published.

Install:

- Node.js 24
- pnpm 11.19.0
- the current stable Rust toolchain
- Microsoft C++ Build Tools and WebView2 requirements for Tauri on Windows

PHITS and Codex CLI are optional for compiling. They are needed only for their
respective integration tests and must be installed separately under their own
terms.

## Development setup

```powershell
git clone https://github.com/y-ozawa039/phits-ai-editor.git
Set-Location phits-ai-editor
pnpm install --frozen-lockfile
pnpm tauri:dev
```

If Cargo is not already on `PATH` in the current shell:

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
```

## Checks

```powershell
pnpm test
pnpm test:licenses
pnpm licenses:generate
pnpm licenses:audit
pnpm test:codex-schema
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
git diff --check
```

The optional real App Server edit smoke test writes only to a disposable
`.integration` workspace:

```powershell
node scripts/app-server-edit-smoke.mjs (Get-Command codex).Source .integration
```

Do not point this smoke test at research data.

## Release build

```powershell
pnpm tauri build --bundles nsis
```

The unpackaged executable is written under `src-tauri/target/release/` and the
NSIS installer under `src-tauri/target/release/bundle/nsis/`. Both locations are
ignored by Git. A local build is not an official release until it has passed the
release checks and is attached to the matching Git tag.

After a successful build, prepare the portable archive, normalized installer
name, CycloneDX SBOM, and SHA-256 list with:

```powershell
pnpm release:package:windows
```

Draft output is written below
`src-tauri/target/release/release-candidate/v0.0.1-alpha/` and remains ignored.

## PHITS detection

At runtime the application can use its saved application setting, a workspace
setting, `PHITSPATH`, or the standard installation location. The settings UI
does not modify the operating system's `PATH` or `PHITSPATH`.
