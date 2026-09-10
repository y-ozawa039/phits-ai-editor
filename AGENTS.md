# Agent instructions for PHITS AI Editor

## Purpose

This repository is an independently developed Tauri desktop editor for PHITS
input files. It combines Monaco editing, local PHITS execution, and optional
Codex App Server assistance. PHITS and Codex CLI are external programs and are
never part of this repository or a release bundle.

The project is an alpha foundation intended for people who can inspect, test,
and recover their own environment. Prefer small, reviewable changes. Preserve
unrelated and uncommitted user work.

## Architecture boundaries

- React/TypeScript under `src/` owns the UI, Monaco models, editor context,
  review presentation, and user preferences.
- Rust under `src-tauri/src/` owns filesystem and process boundaries, encoding,
  atomic writes, backups, PHITS launch policy, App Server lifecycle, approvals,
  and persistent Codex change history.
- `src/api.ts` and the serializable types in `src/types.ts` and
  `src-tauri/src/contracts.rs` form the Tauri command boundary. Keep both sides
  aligned and test unknown or rejected values.
- Generated compatibility schemas under `schemas/codex/0.153.1/` are a pinned
  test baseline, not application source to edit casually.

Read [`ARCHITECTURE.md`](ARCHITECTURE.md) before changing a cross-boundary flow
and [`docs/safety-boundaries.md`](docs/safety-boundaries.md) before changing
execution, saving, path handling, or Codex approvals.

## Non-negotiable safety rules

- Normalize and validate every frontend-supplied path in Rust. Accept only
  workspace-relative paths and reject traversal, symlink escape, and writes
  outside the active workspace.
- Preserve UTF-8, UTF-8 with BOM, Windows-31J, CRLF, and LF behavior. Continue
  using atomic replacement and the existing one-generation backup mechanism.
- Keep PHITS run selection explicit. Multiple `.inp` or `.pht` files in one
  folder must never cause an arbitrary input to run.
- Do not launch PHITS, ANGEL, DCHAIN, or PHIG-3D from Codex turns. Application
  toolbar actions must use the validated official executable or wrapper paths.
- Keep network access and workspace-external writes unavailable to Codex in all
  exposed approval modes. Consultation-only turns must reject modifications in
  Rust, not merely hide an approval button.
- Record and review Codex edits through App Server file-change events and the
  change-history/diff flow. Chat-formatted patches are not proof that a file was
  edited.
- Compare document revisions before applying a Codex change. Never overwrite a
  dirty Monaco buffer or an externally changed file without the conflict flow.
- Do not commit PHITS executables, manuals, licensed distribution assets, user
  input/output, research data, Codex credentials, local logs, or build output.

## Verification

For ordinary source changes run the relevant focused test, then the full checks
before presenting a release candidate:

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm test:codex-schema
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
git diff --check
```

Do not run a real PHITS calculation merely to validate UI or documentation.
When a PHITS integration test is actually required, use a disposable workspace,
the repository's validated runner path, and the locally installed PHITS license.

## Release changes

Follow [`docs/releasing.md`](docs/releasing.md). A release must be generated from
a clean, tested commit. Do not publish, tag, push, or change repository
visibility unless the user explicitly authorizes that external action.
