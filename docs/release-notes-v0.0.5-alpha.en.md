# PHITS AI Editor 0.0.5-alpha

[日本語](release-notes-v0.0.5-alpha.md) | English

`0.0.5-alpha` adds a bounded autonomous approval mode and routes Codex requests
for a normal PHITS run through an editor-owned execution path.

## Main changes

- Added **Autonomous (workspace only)**. File changes that the Rust boundary
  validates inside the workspace, and normal runs of the currently selected,
  saved PHITS input, may proceed without per-action confirmation.
- When Codex is asked to run PHITS, it does not start PHITS through the shell.
  It calls the temporary `run_phits` tool provided by the editor. The editor
  validates the request, invokes the existing Rust Runner and official PHITS
  wrapper, and returns the result to the same Codex turn.
- **Confirm first** asks before every PHITS run. **Confirm when needed** can
  grant permission once or for the current Codex connection. **Consultation
  only** rejects the run.
- The approval card shows the input, working directory, PHITS root and version,
  and Codex's reason for requesting the run.
- Unsaved inputs, a target other than the currently selected input,
  workspace-external paths, unresolved prior runs, and duplicate runs in the
  same folder are rejected regardless of approval mode.
- Approval cards explain file changes, PHITS runs, and supported read/list/search
  commands in plain language. Other commands prompt users to check the complete
  command and reason. Proposed command-prefix rules are separate from additional
  permissions, with an explanation of how they differ from one-time approval.
- Added MCP tool approvals (`mcpServer/elicitation/request`) and tool questions.
  Entry to the editor-owned `run_phits` bridge is forwarded to the editor's run
  review only when matched to the tool item and arguments in the same turn.
  Passing this gate alone does not start PHITS.
- User declines/cancellations, editor policy denials, and unsupported requests
  are distinguished in the Codex panel and output. Unsupported diagnostics record
  the method, request ID, thread ID, turn ID, and reason, not answers or credentials.
- Weekly latest-CLI CI now tests approval, decline, cancellation, and result
  delivery using a real App Server and loopback model/MCP fixtures. It requires
  neither real PHITS calculations nor a user's account.
- Added a bilingual [complete request coverage inventory](codex-request-coverage.en.md).
  Schema checks detect new unclassified requests and missing required parameters.
  Real-CLI tests now cover 12 cases, including populated forms and permission requests.

## Codex confirmation request coverage

Confirmation requests are classified as supported, intentionally restricted,
out of scope, or unsupported. The inventory covers both method names and MCP
form formats/constraints, including the policy of granting no additional permissions.
A successful connection does not mean every request format is supported.

Coverage inventory: [日本語](https://github.com/y-ozawa039/phits-ai-editor/blob/v0.0.5-alpha/docs/codex-request-coverage.md) /
[English](https://github.com/y-ozawa039/phits-ai-editor/blob/v0.0.5-alpha/docs/codex-request-coverage.en.md)

The inventory is also included in the source tree and the portable ZIP's `docs`
folder. CI detects newly added unclassified requests so their support can be reviewed.

## Safety boundary

Codex is not given unrestricted shell access. Direct commands for PHITS,
ANGEL, DCHAIN, and PHIG-3D, network access, and workspace-external writes remain
restricted. Autonomous mode does not use `dangerFullAccess` or unconditional
command approval. Calculation-priority mode still closes the editor and Codex,
so users continue to start it explicitly from the toolbar.

PHITS, Codex CLI, and credentials are not bundled. Official binaries target
Windows 11 x64.

MCP forms support basic strings, choices, booleans, and numbers. URL requests,
extended forms, and unsupported constraints are not automatically accepted;
the editor reports why they are unsupported. Separate permission requests grant
no new permissions. A successful connection does not guarantee support for
every future interaction format.
