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
| ANGEL through the editor | PASS | Selecting the generated `track_xz.out` and invoking ANGEL launched the official `bin/angel.bat`, returned successfully, and regenerated `track_xz.eps` (96,799 bytes). |
| DCHAIN through the editor | PASS | Selecting the standalone sample and invoking DCHAIN launched the official `dchain-sp/bin/dchain.bat`, returned successfully, and generated `.act` (62,826 bytes), `.alr`, `.dcs` (147,402 bytes), and `.lst` (32,875 bytes). |
| Codex file/command rejection | PASS | A requested creation of `approval-test.txt` displayed an approval card. Rejecting it left the file absent and returned a rejection result to the Codex turn. |
| Codex file/command approval | PASS | Retrying the same request and approving it created `approval-test.txt` with the exact content `approved`. A separately approved 30-second PowerShell wait also completed. |
| Codex approval details | PARTIAL | The approval card exposes the method and expandable parameters, but the expanded command details are raw JSON rather than the specified concise executable/arguments/cwd/permission presentation. A file diff view was not shown because the agent used a PowerShell write command. |
| Codex thread persistence/resume | PASS | The created thread ID and model settings were saved in `.phits-editor/codex/threads.json`; after disconnect/reconnect, selecting the saved thread restored its conversation history. |
| Codex turn interruption | PASS | During an approved `Start-Sleep -Seconds 60`, the Interrupt button remained available. Interrupting removed the running `pwsh.exe` PID 27832 before the 60-second timeout, restored the composer, and kept the App Server usable for a successful follow-up turn. |
| Five-run launch-path timing (reference) | FAIL | Fresh official-wrapper process median: 1,214.2 ms (1,366.2, 1,214.2, 1,232.8, 1,212.8, 1,212.2). Calculation-priority-like hidden child median: 1,240.8 ms (1,410.8, 1,230.4, 1,231.8, 1,240.8, 1,254.5), a +2.19% difference. This narrowly misses the 2% target and is a launch-path reference, not the still-required five-run full editor end-to-end acceptance test. |
| Clean-profile/VM installer test | BLOCKED | No Hyper-V cmdlets or WSL environment were available, and the Windows Sandbox feature state could not be queried without administrator privileges. No isolated clean Windows environment was therefore available. The rebuilt NSIS artifact exists (2,824,187 bytes; SHA-256 `3C2854C651D38971B0E3A912953B0B8E288DF2E0D2BEFAE0937D56D72C57336E`). |
| Rust unit tests | PASS | 33 tests passed. |
| Rust formatting and Clippy | PASS | `cargo fmt -- --check` and Clippy with warnings denied passed. |
| Frontend unit tests | PASS | 7 tests passed. |

## Issues found and fixed

An Explorer-style desktop launch did not inherit the PATH entry containing the Codex CLI, so the first build displayed Codex as unavailable. The runtime now searches PATH first and then the installed Codex Desktop CLI location under `%LOCALAPPDATA%\OpenAI\Codex\bin`. Both diagnosis and App Server launch use the same resolved executable.

### ANGEL and DCHAIN batch invocation

Both official batch files inspect the original `cmd.exe` command line to distinguish a drag-and-drop invocation. Passing the batch path directly through `cmd.exe /C` made the wrappers mistake the editor launch for drag-and-drop, reach an interactive `pause`, and exit with code 1 because the editor intentionally supplies null stdin. The Windows utility adapter now places the validated fixed wrapper command in a private environment variable and invokes it through `cmd.exe /D /S /C`. The original command line no longer contains the wrapper path, while the official batch file, target filename-only argument, and target-parent working directory remain unchanged. A Windows regression test executes both real wrappers with null stdin.

### Codex interruption state

The frontend previously treated item-level completion as turn completion and hid the Interrupt button too early. It now captures the turn ID from the exact `turn/started` notification and clears busy state only on the exact `turn/completed` notification. On Windows, the backend also snapshots App Server descendants when a turn starts and, after `turn/interrupt` succeeds, terminates only descendants created during that turn. This prevents a command shell from remaining alive while preserving pre-existing App Server helper processes and the connection itself.

The first UI-only retest confirmed the corrected button lifecycle but exposed a remaining `Start-Sleep` child after the turn had been interrupted. The Windows process-tree cleanup was then added and the final retest verified both PID removal and a successful follow-up turn on the same connection.

## Issues remaining after the additional tests

### Approval presentation

Approval and rejection routing work, but command details are currently displayed as raw JSON and ANSI escape sequences from rejected commands remain visible in the conversation. These are usability defects rather than approval-boundary failures.

## Remaining acceptance work after this pass

- Improve and retest Codex approval detail formatting, file-diff approval, and ANSI stripping.
- Perform the formal five-run full editor end-to-end timing comparison; the reference launch-path measurement missed the target by 0.19 percentage points.
- Test the installer on a clean Windows user profile, Windows Sandbox, or VM.
