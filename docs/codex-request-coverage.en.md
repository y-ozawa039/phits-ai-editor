# Codex confirmation request coverage

English | [日本語](codex-request-coverage.md)

This inventory covers all 10 `ServerRequest` methods in the pinned CLI 0.153.1
schema and the development machine's CLI 0.153.4 schema. It does not enumerate
client requests or notifications, or promise support for every Codex feature.

## Method classification

| Request | Classification | Behavior or reason |
| --- | --- | --- |
| `item/commandExecution/requestApproval` | Supported | Existing approval queue and command checks; network and workspace-external writes remain restricted. |
| `item/fileChange/requestApproval` | Supported | Path, revision and approval-mode checks with change review. |
| `item/tool/requestUserInput` | Supported | Original questions/options and explicit answers; closing without answering is supported. |
| `mcpServer/elicitation/request` | Supported, limited formats | Basic input forms and empty confirmations; see format coverage below. |
| `item/permissions/requestApproval` | Intentionally restricted | Returns no additional permissions with `turn` scope; logs editor policy denial, not user refusal. |
| `item/tool/call` | Out of scope | Editor registers no dynamic tools; PHITS uses the editor-owned MCP bridge. |
| `account/chatgptAuthTokens/refresh` | Out of scope | Editor supplies no externally managed ChatGPT tokens; ordinary CLI authentication is used. |
| `attestation/generate` | Out of scope | Editor does not opt in to `requestAttestation`. |
| `applyPatchApproval` | Out of scope | Legacy protocol; editor uses v2 thread/turn APIs. |
| `execCommandApproval` | Out of scope | Legacy protocol; editor uses v2 thread/turn APIs. |

The compatibility alias `tool/requestUserInput` is also supported, but is not
one of the 10 methods in the generated schema. New unclassified requests are
unsupported and never automatically approved. An out-of-scope request received
at runtime also produces an unsupported-request diagnostic.

## Format and field classification

| Format or field | Classification | Behavior or reason |
| --- | --- | --- |
| MCP `form`: empty confirmation | Supported | Accept/decline/cancel. Only an entry matching the dedicated `run_phits` item and arguments in the same turn is forwarded to editor review; actual PHITS authorization is checked separately. |
| MCP `form`: string, string enum, boolean, number, integer | Supported | Rust validates required fields, numeric ranges and string length. Empty optional values are omitted. |
| MCP `url` | Intentionally restricted | Does not automatically open external URLs; reports unsupported format. |
| MCP `openai/form` | Out of scope | Editor does not opt in to extended-form capability; never auto-accepts if received. |
| Arrays, nested objects, unknown schema constraints | Unsupported | Does not ignore constraints; stops with a diagnostic reason. |
| Tool question `autoResolutionMs` | Intentionally restricted | Does not select or send an answer after a timeout. |

Forms are limited to 20 fields and 16,384 bytes per answer. Answers are never
preselected. Rust rejects invalid answers and keeps the request pending for
correction. Unsupported diagnostics do not contain question text, answers or
credentials.

## Automated checks and limitations

The machine-readable policy lives in `scripts/codex-request-coverage.mjs`.
Schema validation checks the complete request inventory and fails on new
methods, missing required methods, missing referenced parameters or an unknown
schema layout. It does not detect every optional field's type or semantic change.
Rust enforces basic form constraints and rejects unknown formats at runtime.

```powershell
pnpm test:codex-request-coverage
pnpm test:codex-schema
```

The real CLI with loopback model/MCP fixtures exercises accept/decline/cancel
for empty MCP confirmations, populated input forms and command approvals, plus
a no-grant response to additional-permission requests. It uses no real account,
PHITS calculation or global configuration. UI and Rust boundary tests run
separately. A mock client test alone does not validate the editor executable;
Windows CI Rust tests and real-machine checks remain necessary.

[Build and test instructions](building.en.md) | [Safety boundaries](safety-boundaries.en.md)

Protocol reference: [Official OpenAI App Server specification](https://learn.chatgpt.com/docs/app-server)
