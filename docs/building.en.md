# Building PHITS AI Editor

[日本語](building.md) | English

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
pnpm docs:check
pnpm test:licenses
pnpm licenses:generate
pnpm licenses:audit
pnpm test:codex-schema
pnpm test:codex-request-coverage
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

## Manually preview PHITS Codex setup results

Preview all five static-inspection results in a debug build without changing
the development machine's real configuration:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preview-agent-setup-states.ps1
```

Connect to Codex in each window, inspect the result, and close the editor to
advance to the next case. The script creates only temporary workspaces and a
Codex home used by the inspector. The real App Server keeps using the normally
authenticated environment, and the inspection-home override is compiled only
into debug builds. Use `-Case Partial` for one state or
`-PrepareOnly -KeepFixtures` to create fixtures without launching the app.

## Manually preview Codex editing-environment diagnostics

Exercise the Sandbox diagnostic against five temporary workspace patterns
without modifying a research folder:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preview-sandbox-diagnostics.ps1 -Executable C:\path\to\phits-ai-editor.exe
```

| Case | What it checks |
|---|---|
| `HealthyExisting` | A normal non-empty workspace with a child directory |
| `ProtectedInheritance` | ACL inheritance is protected but functional writes still succeed |
| `OwnerOnly` | An ACL limited to the current user; this may reproduce a workspace-specific issue under `elevated`, while `unelevated` may remain available |
| `ExplicitWriteDeny` | An explicit write deny that should be classified as workspace permissions |
| `UnicodePath` | A path containing spaces and Japanese characters |

In each window, connect to Codex, refresh the runtime environment once, and
inspect the expanded details. Closing the editor advances to the next case.
Use a single case such as `-Case OwnerOnly` when needed.
`-ValidateFixturesOnly` checks the fixture ACLs and paths without launching the
editor.

The script creates a random dedicated folder below
`.integration/sandbox-diagnostic-preview`. On exit it resets modified ACLs to
inherit from their parent, checks both the absolute path and a safety marker,
and removes only that dedicated folder. It does not run PHITS or modify research
data, Codex configuration, or ACLs on a real workspace.

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
`src-tauri/target/release/release-candidate/v0.0.6-alpha/` and remains ignored.

## Approval lifecycle test

Test a real App Server with deterministic loopback model/MCP fixtures without
using your account. Supply the native `codex.exe` on Windows or Codex binary:

```powershell
node scripts/app-server-approval-smoke.mjs C:\path\to\codex.exe
```

This checks 12 cases: accept/decline/cancel for empty MCP confirmations, populated
forms (strings, choices, booleans, integers and numbers), and commands; plus
no-grant responses to network, filesystem and combined permission requests.
It also checks request-resolution notifications and result delivery. The
experimental permission tool is enabled only in the temporary environment.
It creates a temporary
Codex home, disables plugin sync/update checks, and removes only the temporary
environment afterwards. Commands only print a fixed marker; PHITS never runs.
This real-CLI protocol test complements, but does not replace, editor UI tests,
Rust boundary tests, or real-environment PHITS verification. Weekly latest-CLI
GitHub Actions runs the same test.

See [Codex confirmation request coverage](codex-request-coverage.en.md) for all
method classifications and unsupported formats. New unclassified requests fail
schema validation.

## PHITS detection

At runtime the application can use its saved application setting, a workspace
setting, `PHITSPATH`, or the standard installation location. The settings UI
does not modify the operating system's `PATH` or `PHITSPATH`.
