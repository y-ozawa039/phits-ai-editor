# Release procedure

The first planned release is `v0.0.1-alpha`, published as a GitHub Pre-release
for Windows 11 x64. Repository visibility changes, tags, pushes, and GitHub
Release publication require explicit maintainer approval.

## 1. Freeze and audit

1. Confirm that `package.json`, `src-tauri/Cargo.toml`,
   `src-tauri/tauri.conf.json`, `CITATION.cff`, README, and release notes use the
   same version.
2. Require a clean worktree and record the release commit.
3. Review tracked files and Git history for credentials, user paths, private
   PHITS/research data, third-party material, executables, archives, and logs.
4. Regenerate `THIRD_PARTY_NOTICES.md` and `THIRD_PARTY_LICENSES.txt`, run the
   license audit, and inspect their diff.
5. Confirm the name/logo policy and source asset in `assets/branding/`.

## 2. Automated checks

```powershell
pnpm install --frozen-lockfile
pnpm licenses:generate
pnpm licenses:audit
pnpm check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
git diff --check
```

Push the candidate to the private repository and require the normal CI and the
manually triggered latest-Codex compatibility workflow to finish successfully.

## 3. Build from the candidate commit

```powershell
pnpm tauri build --bundles nsis
pnpm release:package:windows
```

Create these release assets without modifying their contents afterward:

- `PHITS-AI-Editor-v0.0.1-alpha-windows-x64-portable.zip`
- `PHITS-AI-Editor-v0.0.1-alpha-windows-x64-setup.exe`
- `SHA256SUMS.txt`
- `SBOM.spdx.json` or an equivalent SBOM
- `THIRD_PARTY_NOTICES.md` and `THIRD_PARTY_LICENSES.txt`
- `docs/installation.md`
- release notes and known issues

The portable archive includes the executable, README, LICENSE, NOTICE,
THIRD_PARTY_NOTICES, THIRD_PARTY_LICENSES, the `docs/installation.md` user
guide, TRADEMARKS, SECURITY, and known limitations. It must not include PHITS,
Codex CLI, authentication data, workspaces, or build caches.

## 4. Clean Windows acceptance

On a clean Windows 11 x64 VM or user profile, verify:

- portable startup and NSIS install/update/uninstall
- application and Explorer icons
- `.inp`/`.pht` direct open and single-instance forwarding
- PHITS absent, auto-detected, and manually configured states
- Codex absent, unauthenticated, compatible, and limited states
- save/backup/encoding/line-ending preservation
- Codex approve/decline, diff review, conflict handling, Undo/Redo, and revert
- uninstall removes application files and associations without deleting PHITS,
  workspaces, inputs, outputs, `.phits-editor`, or unrelated user data

Record the exact artifact hashes and results in the Windows alpha test report.

## 5. Publish

1. Confirm the artifacts' recorded commit equals the intended `main` commit.
2. Create the annotated `v0.0.1-alpha` tag.
3. Change the repository to public only after the exact public file list has
   been reviewed.
4. Create a GitHub Release marked **Pre-release**, attach every asset, and copy
   the SHA-256 values into the notes.
5. From another machine or clean directory, clone/build the public source,
   download both Windows packages, verify hashes, and launch them.

Never move a release tag or replace an asset silently. Publish a new prerelease
version when a binary changes.
