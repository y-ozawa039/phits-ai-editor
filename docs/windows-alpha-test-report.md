# Windows alpha test report

Test date: 2026-09-05 (JST)

## Environment

- Windows 11 x64
- PHITS 3.370
- Codex CLI 0.153.1
- Test workspace: `.integration/lec01` (not tracked by Git)
- Input: `lec01.inp`, reduced to 50 histories per batch and 2 batches

## Results

| Test | Result | Evidence |
| --- | --- | --- |
| Release executable startup | PASS | The Tauri window opened and rendered the Japanese UI. |
| Workspace open and input display | PASS | `lec01.inp` opened in Monaco with PHITS syntax highlighting. |
| Runtime diagnosis | PASS | PHITS 3.370 and Codex CLI 0.153.1 were detected. |
| Normal PHITS run | PASS | The output panel streamed initialization and both batches, then reported successful completion. |
| Calculation-priority PHITS run | PASS | The editor exited immediately after detached spawn; PHITS updated its output without an editor process remaining. |
| Calculation-priority state restoration | PASS | On the next workspace open, the latest `RunManifestV1.restorationState` changed from `running` to `completed`. |
| Codex App Server connection | PASS | The app connected through stdio, obtained the model list, displayed model/reasoning controls, and disconnected cleanly. |
| Rust unit tests | PASS | 31 tests passed. |
| Rust formatting and Clippy | PASS | `cargo fmt -- --check` and Clippy with warnings denied passed. |
| Frontend unit tests | PASS | 5 tests passed. |

## Issue found and fixed

An Explorer-style desktop launch did not inherit the PATH entry containing the Codex CLI, so the first build displayed Codex as unavailable. The runtime now searches PATH first and then the installed Codex Desktop CLI location under `%LOCALAPPDATA%\OpenAI\Codex\bin`. Both diagnosis and App Server launch use the same resolved executable.

## Remaining acceptance work

- Run ANGEL, DCHAIN, and PHIG-3D against their known samples and verify output/GUI behavior.
- Perform the five-run official-wrapper versus calculation-priority timing comparison and confirm that median elapsed time differs by no more than 2%.
- Exercise Codex approval/rejection flows with a real thread, including file diff and command approvals.
- Test the installer on a clean Windows user profile or VM.

