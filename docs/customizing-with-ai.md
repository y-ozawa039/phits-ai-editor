# Customizing with generative AI

PHITS AI Editor is published as a starting point for users who want to adapt an
editor to their own workflow without rebuilding every feature from zero. The
alpha project assumes that you can inspect a diff, run tests, and restore a
working revision yourself. An AI-generated change is a proposal, not evidence
that the program remains safe.

## Give the agent the right context

Ask the agent to read, in this order:

1. `AGENTS.md`
2. `ARCHITECTURE.md`
3. `docs/safety-boundaries.md`
4. the files and focused tests for the feature being changed

Keep each request narrow. Ask for the expected UI behavior, affected files,
tests, and known trade-offs. Review the patch before running it, especially when
it touches Rust commands, paths, saving, execution, or approvals.

## Good first customizations

- change neutral colors or font-size presets in the UI
- add a toolbar command that operates only on the active Monaco model
- add a PHITS keyword hover backed by redistributable local metadata
- add a Composer prompt template without adding a new privileged tool
- persist a harmless display preference using the existing preference pattern

For each, add or update a focused frontend test and run the full frontend check.

## Advanced changes

Treat these as high risk:

- document save, backup, encoding, or line-ending logic
- workspace path normalization or symlink handling
- PHITS input selection, launch, stop, or process recovery
- Codex sandbox, approval decisions, session authorization, or file changes
- conflict detection, history snapshots, revert, or Monaco disk synchronization
- installers, file association, or user-data removal

Before merging such a change, add a regression test for rejection and failure as
well as success. Re-read `docs/safety-boundaries.md` and perform the relevant
manual Windows acceptance test in a disposable workspace.

## Keep a recovery path

- work on a branch and commit a known-good state first
- never test with the only copy of an input or research output
- inspect `git diff` and test output yourself
- keep changes small enough to revert
- return to an official tag when a customized build becomes unreliable

Modified distributions should follow `TRADEMARKS.md`: clearly identify the
different maintainer and use a distinct visible name/logo when needed to avoid
confusion with the original alpha distribution.
