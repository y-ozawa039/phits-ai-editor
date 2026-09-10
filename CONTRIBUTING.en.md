# Contributing to PHITS AI Editor

[日本語](CONTRIBUTING.md) | English

PHITS AI Editor is an independently developed alpha application that combines
PHITS input editing and execution with AI assistance. The project does not aim
to provide support equivalent to a finished commercial product. It publishes
a customizable foundation so that users can adapt an editor to their research
and working environment with generative AI or other tools instead of building
everything from zero.

## Intended users and support policy

The source and alpha binaries primarily target people who can inspect logs,
source, and documentation and perform their own investigation, workaround, and
recovery, using generative AI or development tools when helpful.

- Individual help with usage or environment setup is not guaranteed.
- Response times, fix schedules, and acceptance of Issues or Pull Requests are
  not guaranteed.
- Users are responsible for backing up research data and input files.
- Alpha releases may contain undiscovered defects and breaking changes.
- Reproducible bug reports and improvement proposals are welcome.

The maintainer uses OpenAI Codex where practical for investigation, review,
implementation, testing, and documentation. The maintainer makes the final
decision about project direction and whether to accept a change.

## Before opening an Issue

Review existing Issues and documentation and, when possible, check whether the
problem occurs in the latest version. Include:

- PHITS AI Editor version
- operating system and version
- PHITS and Codex CLI versions, when relevant
- reproduction steps
- expected and actual results
- error messages or logs
- the smallest sample that reproduces the problem

Do not attach credentials, personal information, unpublished research data, or
PHITS-related files that cannot be redistributed. Before sharing an input,
remove confidential information and confirm that you have the right to share
it.

## Pull Requests

Prefer small Pull Requests with a single clear purpose. Propose large features
or architectural changes in an Issue before starting work.

Run as many of the following checks as practical before submitting:

```powershell
pnpm test
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-targets
```

Describe the purpose, main changes, verification, and known limitations. For
changes involving PHITS execution, file saving, Codex approvals, or workspace
boundaries, verify that the original remains safe and document rejection,
failure, and conflict behavior as well as success.

## Contributions made with generative AI

AI-assisted Issues, documentation, and code contributions are accepted. The
submitter must review generated work and confirm that:

- they can explain the change and its purpose
- they have checked the test results
- it does not include third-party copyrighted material without permission
- it does not contain secrets or private data
- it does not include PHITS executables, manuals, training material, or other
  assets with different redistribution terms

Naming the AI tool is optional unless its use materially affects a decision or
the verification, in which case disclose it in the Pull Request.

## Separation from PHITS, Codex, and third-party assets

Do not add PHITS executables, source, manuals, training material, user inputs or
outputs, Codex CLI, or credentials to this repository. When adding third-party
code or assets, identify the source and license and verify that redistribution
is permitted.

## Contribution license

Unless stated otherwise, intentionally submitted and accepted contributions
are provided under the Apache License 2.0. Submitters must have the right to
provide their contribution. The project currently requires no separate
Contributor License Agreement (CLA).

## Acceptance decisions

Even a technically correct change may require revision or be declined because
of alpha scope, maintenance cost, safety, PHITS boundaries, or project
direction. Forking the project for clearly identified custom versions is also
welcome.
