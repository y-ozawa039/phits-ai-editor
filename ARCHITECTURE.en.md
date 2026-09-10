# Architecture

[日本語](ARCHITECTURE.md) | English

## Overview

PHITS AI Editor is a Tauri 2 desktop application. A React frontend presents a
Monaco-based editor; a Rust backend controls filesystem access, PHITS process
launching, diagnostics, settings, and the Codex App Server subprocess.

```text
React UI / Monaco models
        |
        | typed Tauri commands and events
        v
Rust boundary layer
  | documents | runner | diagnostics | settings | startup
  | codex App Server client | Codex change history
        |
        +--> user-selected workspace files
        +--> local PHITS installation (not bundled)
        +--> local Codex CLI / App Server (not bundled)
```

## Frontend

`src/App.tsx` currently coordinates workspace state, tabs, execution, Codex
turns, conflicts, and settings. Supporting modules keep the more testable rules
outside that component:

- `src/api.ts`: typed wrappers for Tauri commands
- `src/types.ts`: frontend contracts
- `src/phitsLanguage.ts`: Monaco language registration and PHITS presentation
- `src/codexContext.ts`: bounded `PHITS_EDITOR_CONTEXT_V1` construction
- `src/codexApproval.ts`: approval normalization and identity
- `src/codexRevision.ts`: revision-conflict decisions
- `src/diffReview.ts`: Codex review models and multi-file grouping
- `src/editorHistory.ts`: Monaco Undo/Redo availability integration
- `src/uiPreferences.ts` and `src/workspaceSession.ts`: persisted UI/session state
- `src/components/`: conversation, approval, diff, tabs, and dialogs

Monaco remains the source of truth for an unsaved buffer. Disk content is the
source of truth for saved files and for completed Codex writes. Reconciliation
must compare both rather than silently choosing one.

## Rust backend

The Tauri command registration is in `src-tauri/src/lib.rs`:

- `workspace.rs`: workspace discovery and containment
- `documents.rs`: decoding, encoding, save/save-as, atomic writes, and backups
- `runner.rs`: PHITS and utility launch policy and run manifests
- `diagnostics.rs`: PHITS/Codex discovery and App Server schema probe
- `settings.rs`: application-wide PHITS path setting
- `startup.rs`: command-line/direct-open requests and single-instance transfer
- `codex.rs`: App Server lifecycle, threads, turns, events, and approvals
- `codex_history.rs`: before/after snapshots, pending review groups, and revert
- `contracts.rs`: serializable Rust boundary types
- `state.rs`: synchronized application process state

The backend is the security boundary. UI validation improves usability but must
not be treated as authorization.

## Document lifecycle

1. Rust resolves a workspace and returns relative file names.
2. Rust reads bytes, detects the supported encoding and line ending, and returns
   a `DocumentData` value.
3. Monaco edits an in-memory model and marks it dirty relative to the last
   loaded/saved document.
4. Save normalizes only the selected line-ending convention, re-encodes to the
   original encoding, records a one-generation backup, and atomically replaces
   the target.
5. External or Codex changes are re-read from disk. A dirty or revision-mismatched
   buffer enters the conflict UI instead of being overwritten.

## Codex edit lifecycle

Each user turn may carry a separate `PHITS_EDITOR_CONTEXT_V1` item containing
relative paths, cursor/selection, dirty state, open tabs, diagnostics metadata,
and bounded selected or unsaved content. Context is not rendered as the user's
chat message.

When Codex connects, Rust checks whether the resolved PHITS installation's
`workbench/AI/reference_policy.md` is referenced by the effective global or
workspace `AGENTS.md`. The typed connection result exposes this status to the
UI, which shows the official AI-agent setup guidance only when the pointer is
missing. The check never changes the user's configuration automatically.

App Server `fileChange` and diff events identify real edits. Before a change,
the backend validates paths and records before snapshots. After completion it
records after snapshots and emits a reviewable multi-file history group. The UI
re-reads disk content, detects conflicts, and shows an inline or side-by-side
Monaco diff. Undo/Redo applies to Monaco editing; persistent Codex review history
supports reopening and reverting completed changes.

## PHITS execution lifecycle

Only the input selected by the editor is run. The runner validates the relative
path, resolves the installed PHITS environment, prevents unsafe duplicate runs,
and writes a run manifest so state can be restored conservatively after an
application restart. Normal and calculation-priority modes differ in how much
of the editor/Codex environment remains active, but both preserve explicit input
ownership.

## Compatibility strategy

Codex CLI 0.153.1 App Server schemas are the minimum pinned contract. Startup
generates and probes the installed CLI schema, then exposes availability for
chat, threads, file editing, and approvals separately. New fields are tolerated
where safe; missing required methods or unknown approval decisions are not.
The scheduled GitHub workflow repeats this probe against the latest CLI.
