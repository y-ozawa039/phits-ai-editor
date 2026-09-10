# Security policy

[日本語](SECURITY.md) | English

## Supported versions

Until a stable release exists, security fixes are made only on the latest
published alpha version and the current `main` branch. Older alpha builds are
not supported.

## Reporting a vulnerability

Do not publish credentials, private PHITS inputs or outputs, unpublished
research data, or vulnerability details in a public Issue.

Use GitHub's **Security → Report a vulnerability** form for this repository.
If private vulnerability reporting is not available, do not disclose the
details publicly; open a minimal Issue asking the maintainer to enable a private
reporting channel, without describing the vulnerability.

Include only the information needed to reproduce and assess the problem:

- PHITS AI Editor version and commit, if known
- operating system
- affected feature and expected security boundary
- minimal reproduction steps
- impact and whether data was modified or disclosed
- a sanitized log or sample, when it can be shared safely

Receipt, response, fix, or publication deadlines are not guaranteed for this
personal alpha project. Reports are assessed according to impact and available
maintainer time. Please allow the maintainer an opportunity to investigate
before public disclosure.

## Security boundaries

The most important application boundaries are documented in
[`docs/safety-boundaries.en.md`](docs/safety-boundaries.en.md). A report is
especially useful when it demonstrates workspace escape, unapproved Codex
changes, unintended PHITS execution, credential exposure, or input-file
corruption.
