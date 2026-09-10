# Publication audit

Audit date: 2026-09-10 (JST)
Scope: local Git working tree and existing Git history
Product name status: provisional alpha name (`PHITS AI Editor`)

## Result

The current source tree is organized into reviewable commits without waiting
for a permanent product name. A private GitHub repository and remote exist; no
public repository, release, or release tag has been created.

No immediately blocking secret or research-data file was found in the current
publication candidates or existing Git history. This is a technical pattern and
file-inventory audit, not a legal guarantee; the release candidate must be
reviewed again before a repository is made public.

## Checks performed

- Checked tracked and untracked, non-ignored files for common OpenAI key,
  GitHub token, AWS access-key, and private-key patterns. No match was found.
- Checked all existing Git patches for the same secret patterns and Windows
  user-profile paths. No match was found.
- Checked publication candidates and Git history for `.inp`, `.pht`, `.out`,
  dump, log, archive, executable, private-key, and certificate files. No such
  candidate was found.
- Confirmed that local integration workspaces, build output, dependencies, and
  TypeScript build metadata are ignored.
- Added `.gitattributes` so source, workflow, schema, and documentation text
  consistently uses LF while icon assets remain binary across platforms.
- Added exclusions for Editor metadata, environment files, backups, dumps,
  private keys, and certificate containers. PHITS input/output extensions are
  deliberately not ignored globally so that future explicitly reviewed test
  fixtures can be committed in a dedicated location.
- Regenerated `THIRD_PARTY_NOTICES.md` from the installed pnpm dependency graph
  and Cargo metadata: 230 npm packages and 272 Rust crates were inventoried,
  with zero missing declared licenses.
- Found five MPL-2.0 Rust dependencies. MPL-2.0 is explicitly declared, but the
  corresponding license texts and binary-distribution notices still require a
  final packaging review.
- Removed a prospective duplicate copy of the 0.153.1 Codex schema baseline.
  The existing tracked `schemas/codex/0.153.1` directory remains the single
  baseline location and now contains a provenance README.

## Files intentionally excluded from Git

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- `.integration/`
- `.phits-editor/`
- local logs, coverage, TypeScript build metadata, environment files, backups,
  dumps, private keys, and certificate containers

## Items that remain before public release

- Decide the final product/repository name and the official-versus-fork naming
  and logo policy.
- Verify ownership and redistribution permission for the selected logo source.
- Review `SECURITY.md`, `TRADEMARKS.md`, architecture/build/customization/release
  documentation, and GitHub Issue/Pull Request templates after they are committed.
- Perform a human review for PHITS-distributed material and unpublished research
  content immediately before the first public push.
- Include required third-party license texts in the actual portable and installer
  distributions and generate an SBOM.
- Test install, update, uninstall, file association, settings retention, and data
  preservation in a clean Windows environment.
- Keep the repository private while reviewing the exact public diff. Normal CI
  has passed on Windows and Ubuntu; run the latest-Codex workflow manually once
  before the release candidate is tagged.
- Confirm that source, tag, executable, installer, and SHA-256 files all refer to
  the same release candidate.

## Re-run commands

```powershell
pnpm licenses:generate
pnpm check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
git diff --check
```
