## Purpose

<!-- What problem does this change solve? -->

## Main changes

<!-- Keep the patch focused and list user-visible behavior. -->

## Verification

- [ ] Focused tests were added or updated.
- [ ] `pnpm test` passed.
- [ ] `pnpm test:codex-schema` passed, or the change does not affect Codex contracts.
- [ ] `pnpm build` passed.
- [ ] Rust format, Clippy with warnings denied, and Rust tests passed.
- [ ] I manually checked the relevant success, rejection, failure, and conflict paths.

## Safety and distribution

- [ ] The change preserves workspace path checks, atomic saving, backups, encodings, and line endings, or documents and tests an intentional change.
- [ ] The change does not let Codex launch PHITS utilities or write outside the workspace.
- [ ] No credentials, private research data, user input/output, PHITS-distributed material, or unlicensed third-party assets are included.
- [ ] AI-generated content, if any, was reviewed and I can explain and license the contribution.

## Screenshots / known limitations

<!-- Add sanitized screenshots for UI changes and describe anything not verified. -->
