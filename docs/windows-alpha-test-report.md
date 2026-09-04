# Windows alpha test report

Test date: 2026-09-05 (JST)

## Environment

- Windows 11 x64
- PHITS 3.370
- Codex CLI 0.153.1
- Test workspaces: `.integration/lec01` and `.integration/phig3d` (not tracked by Git)
- Inputs: reduced `lec01.inp` and the PHIG-3D lecture sample `lecture/advanced/PHIG-3D/test.inp`

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
| PHIG-3D launch and rendering | PASS | The editor launched the official `utility/phig3d/windows-x64/phig3d.exe` for `test.inp`. PHIG-3D showed the exact input/workspace in its title, loaded cells 101, 102, 103, 998, and 999, and rendered the geometry after `描画(D)`. Closing PHIG-3D returned control to the editor and left no PHIG-3D process behind. |
| Rust unit tests | PASS | 31 tests passed. |
| Rust formatting and Clippy | PASS | `cargo fmt -- --check` and Clippy with warnings denied passed. |
| Frontend unit tests | PASS | 5 tests passed. |

## Issue found and fixed

An Explorer-style desktop launch did not inherit the PATH entry containing the Codex CLI, so the first build displayed Codex as unavailable. The runtime now searches PATH first and then the installed Codex Desktop CLI location under `%LOCALAPPDATA%\OpenAI\Codex\bin`. Both diagnosis and App Server launch use the same resolved executable.

## Remaining acceptance work

- Run ANGEL and DCHAIN against their known samples and verify output/GUI behavior.
- Perform the five-run official-wrapper versus calculation-priority timing comparison and confirm that median elapsed time differs by no more than 2%.
- Exercise Codex approval/rejection flows with a real thread, including file diff and command approvals.
- Test the installer on a clean Windows user profile or VM.
