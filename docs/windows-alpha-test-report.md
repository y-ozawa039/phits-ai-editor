# Windows alpha test report

Test date: 2026-09-05 (JST)

## Environment

- Windows 11 x64
- PHITS 3.370
- Codex CLI 0.153.1
- Test workspaces: `.integration/lec01`, `.integration/phig3d`, `.integration/dchain`, `.integration/codex`, and `.integration/benchmark` (not tracked by Git)
- Inputs: reduced `lec01.inp`, the PHIG-3D lecture sample `lecture/advanced/PHIG-3D/test.inp`, and the DCHAIN standalone sample

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
| PHIG-3D particle tracks | PASS | `track.out` generated from the official PHIG-3D lecture sample was opened in the Particle tracks pane. Electron, positron, and photon tracks were parsed and rendered over the geometry. |
| PHIG-3D reload | PASS | Reload completed without an error or crash and rebuilt the geometry. A full reload clears the separately selected track overlay, which must then be selected again. |
| PHIG-3D XYZ mesh tally | PASS | The current PHIG-3D executable loaded and rendered the official `SimpleGEO/deposit-xy.out` sample from the retained PHITS 3.35 installation backup. The current PHITS tree does not contain this old sample, so the reader was verified but sample availability remains an installation-content issue. |
| ANGEL through the editor | FAIL | Selecting the generated `track_xz.out` and invoking ANGEL returned exit code 1 and did not regenerate output. The same target succeeded through `bin/angel.bat`, produced `track_xz.eps` (96,799 bytes), and exited successfully after its interactive pause. |
| DCHAIN through the editor | FAIL | Selecting the standalone sample and invoking DCHAIN returned exit code 1 and produced no output. The same target succeeded through `dchain-sp/bin/dchain.bat` and produced `.act`, `.alr`, `.dcs`, and `.lst` outputs. |
| Codex file/command rejection | PASS | A requested creation of `approval-test.txt` displayed an approval card. Rejecting it left the file absent and returned a rejection result to the Codex turn. |
| Codex file/command approval | PASS | Retrying the same request and approving it created `approval-test.txt` with the exact content `approved`. A separately approved 30-second PowerShell wait also completed. |
| Codex approval details | PARTIAL | The approval card exposes the method and expandable parameters, but the expanded command details are raw JSON rather than the specified concise executable/arguments/cwd/permission presentation. A file diff view was not shown because the agent used a PowerShell write command. |
| Codex thread persistence/resume | PASS | The created thread ID and model settings were saved in `.phits-editor/codex/threads.json`; after disconnect/reconnect, selecting the saved thread restored its conversation history. |
| Codex turn interruption | FAIL | During an approved `Start-Sleep -Seconds 30`, the composer returned to the normal Send state and never exposed the Interrupt button. The command ran to completion. The frontend completion matching is broad enough to treat an item-completed notification as a turn-completed notification, which is consistent with the observed premature busy-state reset. |
| Five-run launch-path timing (reference) | FAIL | Fresh official-wrapper process median: 1,214.2 ms (1,366.2, 1,214.2, 1,232.8, 1,212.8, 1,212.2). Calculation-priority-like hidden child median: 1,240.8 ms (1,410.8, 1,230.4, 1,231.8, 1,240.8, 1,254.5), a +2.19% difference. This narrowly misses the 2% target and is a launch-path reference, not the still-required five-run full editor end-to-end acceptance test. |
| Clean-profile/VM installer test | BLOCKED | No Hyper-V cmdlets or WSL environment were available, and the Windows Sandbox feature state could not be queried without administrator privileges. No isolated clean Windows environment was therefore available. The NSIS artifact itself exists (2,816,342 bytes; SHA-256 `68AFFA0831CFD210C68D8E2359D018E5F4B5FDA97449914C5C0D4CB0FFC217E1`). |
| Rust unit tests | PASS | 31 tests passed. |
| Rust formatting and Clippy | PASS | `cargo fmt -- --check` and Clippy with warnings denied passed. |
| Frontend unit tests | PASS | 5 tests passed. |

## Issue found and fixed

An Explorer-style desktop launch did not inherit the PATH entry containing the Codex CLI, so the first build displayed Codex as unavailable. The runtime now searches PATH first and then the installed Codex Desktop CLI location under `%LOCALAPPDATA%\OpenAI\Codex\bin`. Both diagnosis and App Server launch use the same resolved executable.

## Issues found in the additional tests

### ANGEL and DCHAIN batch invocation

Both official batch files detect their command-line launch mode and finish with an interactive `pause`. The editor currently invokes them through `cmd.exe` with null stdin and waits for an exit status. In this mode both editor calls return code 1, while running the official wrappers directly succeeds. The Windows utility adapter needs a batch-compatible launch strategy and a regression test for the real wrappers.

### Codex interruption state

The frontend clears its busy state when a Codex event method contains `completed`, `complete`, `failed`, or `interrupted`. Item-level completion can therefore hide the Interrupt button before the whole turn finishes. Completion handling should be restricted to turn-level events, and the command execution itself should be checked after an interrupt.

### Approval presentation

Approval and rejection routing work, but command details are currently displayed as raw JSON and ANSI escape sequences from rejected commands remain visible in the conversation. These are usability defects rather than approval-boundary failures.

## Remaining acceptance work after this pass

- Fix and retest ANGEL and DCHAIN through the editor.
- Fix and retest Codex turn interruption, approval detail formatting, file-diff approval, and ANSI stripping.
- Perform the formal five-run full editor end-to-end timing comparison; the reference launch-path measurement missed the target by 0.19 percentage points.
- Test the installer on a clean Windows user profile, Windows Sandbox, or VM.
