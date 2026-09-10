# Windows alpha test report

Test dates: 2026-09-08 through 2026-09-10 (JST)

## Environment

- Windows 11 x64
- PHITS 3.370
- Codex CLI 0.153.4（固定基準Schemaは0.153.1）
- Test workspaces: `.integration/lec01`, `.integration/phig3d`, `.integration/dchain`, `.integration/codex`, `.integration/benchmark`, and `.integration/benchmark-full` (not tracked by Git)
- Inputs: reduced `lec01.inp`, a performance variant with `maxcas = 5000` and `maxbch = 10`, the PHIG-3D lecture sample `lecture/advanced/PHIG-3D/test.inp`, and the DCHAIN standalone sample

## Results

| Test | Result | Evidence |
| --- | --- | --- |
| Release executable startup | PASS | The Tauri window opened and rendered the Japanese UI. |
| Workspace open and input display | PASS | `lec01.inp` opened in Monaco with PHITS syntax highlighting. |
| Direct file launch and single-instance routing | PASS | The release executable was started with `C:\phits\user\ide_setup_check\lec01.inp`, then invoked again with `C:\phits\user\lec01\lec01.inp`. The second process exited after forwarding its argument and exactly one Editor process remained. The 2026-09-10 installed-build retest opened an isolated `.inp` directly, kept one process after a second invocation, returned exit code 0 from the forwarding process, and left the input byte-for-byte unchanged. Startup-target unit tests also cover relative paths, mixed-case `.inp`, `.pht`, missing targets, and unsupported extensions. |
| NSIS current-user install and uninstall | PASS | The unsigned NSIS candidate installed silently into an isolated directory with exit code 0. The application, uninstaller, all required Japanese/English documents, LICENSE, NOTICE, and third-party notices were present. During installation the HKCU `.inp`/`.pht` classes changed to the Editor and retained `PHITS-INP`/`PHITS-PHT` as backups. Uninstall returned exit code 0, removed the install directory, uninstall entry, application file class, desktop shortcut, and Start-menu shortcut, then restored both prior phitspad classes. A post-uninstall hook was added after the first rehearsal exposed two harmless backup registry values left by Tauri's standard macro; the rebuilt installer removed those values as well, with no association residue. |
| Runtime diagnosis | PASS | PHITS 3.370 and Codex CLI 0.153.4 were detected. |
| Codex startup compatibility probe | PASS | 起動時にインストール済みCLI 0.153.4からApp Server JSON Schemaを一時生成し、会話、スレッド、ファイル編集、承認の4機能を個別判定した。全機能が固定基準0.153.1と互換だった。固定Schemaに対するローカル検査と、最新版CLIを毎週検査するGitHub Actions workflowも追加した。 |
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
| Codex file-diff approval UI | PASS | With the real App Server, a file-change tool request displayed `approval-test.txt`, its change kind, and the exact `approved` to `rejected-probe`/`accepted-probe` red-green inline diff in a read-only Monaco diff editor. Rejecting kept the disk content unchanged; approving applied the exact requested content. |
| Codex command approval UI | PASS | With the real App Server, the card separately displayed the PowerShell executable and arguments, workspace cwd, inferred read operation, and proposed execution-policy tokens. No raw JSON or ANSI control sequence was shown. The command was rejected for this presentation test and the turn completed without execution. |
| Codex thread persistence/resume | PASS | The created thread ID and model settings were saved in `.phits-editor/codex/threads.json`; after disconnect/reconnect, selecting the saved thread restored its conversation history. |
| Codex turn interruption | PASS | During an approved `Start-Sleep -Seconds 60`, the Interrupt button remained available. Interrupting removed the running `pwsh.exe` PID 27832 before the 60-second timeout, restored the composer, and kept the App Server usable for a successful follow-up turn. |
| View, font settings, and 12 px floor | PASS | The Settings menu exposes independent Explorer, Editor, and Codex controls, each bounded to 12–28 px with a 14 px factory default. The PowerPoint-style numeric field, integrated dropdown, and A↑/A↓ controls displayed without overlap; the preset list contained 12, 14, 16, 18, 20, 24, and 28. A source audit and regression test found no application-owned pixel font declaration below 12 px, and explicit overrides cover Monaco's smaller auxiliary labels and font-based glyphs. In the temporary release GUI, the 44 px toolbar row, 35 px editor tab row, at least 34 px file rows, at least 72 px Codex composer, output panel, and 24 px status bar showed no clipping or overlap at the 14 px default. The user default remains application-wide local storage rather than workspace `.phits-editor` data. |
| Top-menu exclusivity | PASS | Opening File, Edit, View, and Settings in sequence left exactly one popover visible at each step. Clicking outside the menu bar and pressing Escape both closed the active popover. Selecting a normal menu command also closes its popover, while controls inside Settings remain open for consecutive font adjustments. |
| Neutral chrome, semantic colors, targeted black text, and font-size icons | PASS | The whole-surface grayscale filter was removed. Application backgrounds, borders, general controls, and non-semantic text use a neutral gray palette, while PHITS syntax highlighting and normal/warning/error indicators retain their original semantic colors. Opening `lec01.inp` confirmed the blue/brown/green token styles, green PHITS and Codex availability dots, neutral surrounding panels, and gray line numbers (`#8A8A8A`, active `#555555`). `#000000` remains assigned to the requested top menu, toolbar and search labels, Explorer heading, editor tab name, file-list text, `ワークスペースなし`, and `入力を一緒に仕上げましょう`. The large and small P marks, primary workspace/Codex buttons, active Codex toggle, and Codex sparkle marks use the original blue accents. The grow A is 17 px, the shrink A is 14 px, and both arrows remain at the 12 px floor. |
| Codex Markdown message presentation | PASS | Agent-message text is rendered as safe Markdown with headings, emphasis, strikethrough, inline/fenced code, quotes, lists, task lists, tables, and links. HTTP/HTTPS links use a Codex-style blue semantic color and open only after a user click through the Tauri opener permission; malformed URLs and other schemes are non-clickable, and raw HTML is never interpreted. Automated tests cover formatting, safe-link dispatch, and unsafe-scheme rejection. |
| Codex Editor integration visual smoke test | PASS | The rebuilt 2026-09-06 release executable started successfully. At a 1444 px window width, the responsive Codex panel, 14 px default typography, context chip, neutral chrome, and Editor/Explorer/output layout rendered without clipping or overlap. Native App Server interactions still require the separate updated GUI acceptance listed below. |
| Codex 0.153.1 protocol smoke test | PASS | The pinned CLI completed `initialize`/`initialized`, returned five entries from `model/list`, created a temporary read-only thread, reflected `thread/name/set` through `thread/read`, and permanently removed the temporary thread with `thread/delete`. The reusable harness is `scripts/app-server-smoke.mjs`. Non-fatal local skill-icon and PowerShell snapshot warnings were emitted by the CLI. |
| Codex active-document edit routing | PASS | An isolated real App Server 0.153.1 turn reproduced the reported Japanese request with `activeDocumentPath: context-edit.inp`, cursor line 1/column 1, PHITS 3.370, and no dirty buffer. The revised developer instructions caused the built-in editor to emit `item/fileChange/requestApproval`; the harness declined it and verified the original file remained byte-for-byte unchanged. The reusable harness is `scripts/app-server-edit-smoke.mjs`. |
| Codex absolute file-change path normalization | PASS | The reported failed turn was identified in the local App Server rollout: its `FileChange` targeted an absolute path under the active `D:\experiment\...\chamber1.0_black_1.7` workspace and completed as `declined`. The backend now canonicalizes in-workspace absolute targets to relative paths before conflict checks, approval presentation, backup, and Monaco synchronization. Automated tests accept an in-workspace absolute target and reject an equally valid absolute target outside the workspace. |
| Codex transcript auto-follow | PASS | Component tests verify that streamed text moves the transcript to the latest position while it is following, and that scrolling more than 48 px away from the bottom suspends follow mode so older text can be read. Sending a message or changing threads resumes following. |
| Central Monaco diff review | PASS (automated) | The App Server unified diff is strictly reconstructed against the complete disk document and displayed in the main Editor area. Tests cover first-line insertion, multi-hunk reconstruction, CRLF preservation, stale-diff rejection, whole-request apply/reject controls, and disabled acceptance when reconstruction fails. The review provides inline/side-by-side modes, previous/next hunk navigation, multiple-file navigation, and retains the applied diff until dismissed. An updated real-App-Server GUI acceptance remains to be performed interactively. |
| Responsive Codex panel width | PASS | The application-wide default is one third of the current window, clamped to a 360 px minimum and one-half maximum. In the rebuilt release GUI at 1444 px window width, the panel opened at approximately 481 px, stopped at approximately 722 px when dragged wider, and returned to approximately 481 px when the divider was double-clicked. The stored value is a ratio and follows window resize. Component and preference tests cover the clamp and reset behavior. |
| Full-editor five-run calculation-priority timing | PASS | The official standalone path and the real Editor production button were each run five times with the same input and working directory. Official wall times were 6,314.9, 6,183.1, 6,165.9, 6,176.1, and 6,181.2 ms (median 6,181.2 ms). Editor wall times from `RunManifestV1.requestedAt` through the observed normal-completion write were 6,198.8, 6,170.8, 6,246.1, 6,188.6, and 6,176.0 ms (median 6,188.6 ms), a +0.12% difference. Official PHITS CPU times were 5.59, 5.59, 5.59, 5.62, and 5.60 s (median 5.59 s); Editor PHITS CPU times were 5.67, 5.64, 5.71, 5.66, and 5.64 s (median 5.66 s), a +1.25% difference. Both medians satisfy the provisional 2% target. All ten calculations finished normally. All five Editor manifests restored to `completed`, and no Editor, PHITS, wrapper, or Codex App Server process remained after the final run. |
| Final release executable startup | PASS | The final rebuilt executable opened to the Japanese start screen and exited normally. No `phits-ai-editor.exe` process remained. |
| Norton malware scan | PASS (candidate commit `8817fec`) | After Norton LiveUpdate, the maintainer manually scanned `C:\phits\user\phits-ai-editor`; Norton reported no threats. This covered the clean `8817fec` release candidate. The final candidate rebuilt after the NSIS cleanup hook must be scanned again before publication. |
| Current-PC Windows acceptance | PASS | All rows above were completed on the current Windows 11 x64 PC. Runner and utility code did not change during the approval-UI pass; its earlier same-day execution evidence therefore remains applicable to the final source state. |
| Clean-profile/VM installer test | BLOCKED | No Hyper-V cmdlets or WSL environment were available, and the Windows Sandbox feature state could not be queried without administrator privileges. No isolated clean Windows environment was therefore available. A newer local packaging rehearsal is recorded below, but it does not replace this clean-environment test. |
| Rust unit tests | PASS | 63 tests passed, including startup-target resolution, multiple-input selection, approval-mode mapping, Codex feature-schema compatibility, schema fixture decisions, title fallback, raw-byte disk revision hashing, relative and absolute file-path validation, network rejection, PHITS-family command rejection, the Editor Context envelope, grouped Codex-change history, and the requirement to use App Server file-change events for edit requests. |
| Rust formatting and Clippy | PASS | `cargo fmt -- --check` and Clippy with warnings denied passed. |
| Frontend unit tests | PASS | 86 tests passed, including workspace-session normalization, Editor Context size/history rules, document-revision conflict detection, 3-mode global preference persistence, feature-specific Codex availability display and safe degradation, thread menu behavior, context-chip removal, approval decisions, transcript auto-follow and manual-scroll suspension, full-document diff reconstruction/rejection, stale/truncated proposal blocking, main Editor review controls, Undo/Redo history, unsaved-change dialogs, responsive panel width, Markdown formatting, safe links, font controls, and menu behavior. |

## Issues found and fixed

An Explorer-style desktop launch did not inherit the PATH entry containing the Codex CLI, so the first build displayed Codex as unavailable. The runtime now searches PATH first and then the installed Codex Desktop CLI location under `%LOCALAPPDATA%\OpenAI\Codex\bin`. Both diagnosis and App Server launch use the same resolved executable.

### ANGEL and DCHAIN batch invocation

Both official batch files inspect the original `cmd.exe` command line to distinguish a drag-and-drop invocation. Passing the batch path directly through `cmd.exe /C` made the wrappers mistake the editor launch for drag-and-drop, reach an interactive `pause`, and exit with code 1 because the editor intentionally supplies null stdin. The Windows utility adapter now places the validated fixed wrapper command in a private environment variable and invokes it through `cmd.exe /D /S /C`. The original command line no longer contains the wrapper path, while the official batch file, target filename-only argument, and target-parent working directory remain unchanged. A Windows regression test executes both real wrappers with null stdin.

### Codex interruption state

The frontend previously treated item-level completion as turn completion and hid the Interrupt button too early. It now captures the turn ID from the exact `turn/started` notification and clears busy state only on the exact `turn/completed` notification. On Windows, the backend also snapshots App Server descendants when a turn starts and, after `turn/interrupt` succeeds, terminates only descendants created during that turn. This prevents a command shell from remaining alive while preserving pre-existing App Server helper processes and the connection itself.

The first UI-only retest confirmed the corrected button lifecycle but exposed a remaining `Start-Sleep` child after the turn had been interrupted. The Windows process-tree cleanup was then added and the final retest verified both PID removal and a successful follow-up turn on the same connection.

### Codex approval event correlation and presentation

The backend now correlates `item/started`, `item/fileChange/patchUpdated`, and `turn/diff/updated` with each approval request by thread, turn, and item ID. It emits a typed presentation payload rather than raw App Server parameters. The frontend queues concurrent requests, rejects malformed or mismatched approval events without execution, bounds very large diffs, strips terminal control sequences, and shows file changes or command scope in dedicated layouts. The live rejection and approval tests used Codex CLI 0.153.1 through the application's stdio App Server connection.

### Active-document requests stopping at a chat diff

The original App Server developer instruction said to "propose file changes for user review." A model could satisfy that wording by printing a unified diff in its chat response without invoking Codex's built-in file editor, so no `fileChange` item or approval UI existed for the client to display. The instruction now defines `PHITS_EDITOR_CONTEXT_V1.activeDocumentPath` as the open file and requires writable edit requests to use the built-in file-editing capability. It explicitly forbids treating a chat-only patch as completion unless the user asked only for a proposal. A real 0.153.1 protocol regression test observes the resulting file-change approval request and declines it to keep the fixture unchanged.

The subsequent user retest did invoke the built-in editor, but App Server reported the target as an absolute path. The client still enforced its frontend-facing relative-path contract directly on this trusted protocol event and therefore auto-declined the otherwise valid in-workspace edit before displaying the approval card. App Server paths are now normalized at the Rust boundary: absolute paths are accepted only after canonical containment validation, converted to relative paths, and then passed through the existing conflict, backup, approval, and Monaco synchronization flow. Rejection diagnostics are also emitted as visible system messages; the App Server file-change decision schema itself has no free-form rejection-reason field.

### Unsaved changes during tab close, workspace switch, and application exit

The release WebView did not reliably present the browser-native confirmation used by the original tab-close path, allowing a dirty scratch tab to close without a visible choice. Tab close, workspace switch, and application exit now share an application-owned three-choice dialog: cancel, discard, or save and continue. The application-exit path uses Tauri's explicit window-destroy command only after the user's choice, with the narrowly scoped `core:window:allow-destroy` capability. If that command fails, the dialog is restored and an error is shown instead of silently abandoning the choice.

### App Server edit-smoke process cleanup

The live edit smoke test passed its file-change approval and byte-preservation assertions but remained alive because a completed `Promise.race` left its 120-second timeout registered. The harness now clears every timeout after settlement and bounds best-effort thread deletion and App Server shutdown. The final rerun observed the file-change approval, declined it, preserved the fixture byte-for-byte, and exited with code 0.

### NSIS file-association backup cleanup

Tauri's standard NSIS file-association macro correctly backed up the existing
`PHITS-INP` and `PHITS-PHT` classes and restored them during uninstall, but it
left the two temporary `PHITS input file_backup` values under the extension
keys. A Tauri-supported `NSIS_HOOK_POSTUNINSTALL` now deletes only those backup
values after the original classes have been restored. A second isolated
install/uninstall rehearsal verified complete application removal, restored
phitspad associations, no backup values, and no remaining shortcuts.

## Remaining work outside current-PC acceptance

- Install and exercise the unsigned NSIS package in a clean Windows user profile, Windows Sandbox, or VM.
- Perform the Ubuntu 24.04/26.04 port and `.deb` acceptance after checking the supported ChatGPT Linux LTS versions at distribution time.
- Re-run the real App Server GUI acceptance rows after the 2026-09-06 Editor Context, thread-management, three-mode approval, and Monaco conflict-synchronization enhancement. The implementation is covered by frontend/Rust automated tests, but the updated end-to-end GUI path is not marked accepted until exercised interactively.
- Recheck the final discard-and-exit click path once native UI automation is available again. The custom dialog was exercised in the release GUI, and the corrected destroy capability is schema-validated and release-built, but UI automation became unavailable before the post-capability click-through.

## Full-editor performance comparison method

The official baseline launched a fresh `powershell.exe` with the same `-NoLogo`, `-NoProfile`, `-NonInteractive`, `-ExecutionPolicy Bypass`, wrapper path, filename-only input argument, working directory, and `PHITSPATH` contract used by the Rust Runner. Calling the wrapper inside the already-running test shell was rejected as an asymmetric baseline because it omits PowerShell process startup.

Each Editor measurement used the release executable and the visible UI: launch the Editor, select `.integration/benchmark-full`, press the production-run button, allow the Editor to exit, and wait for PHITS normal completion. A `FileSystemWatcher` observed file changes without leaving an Editor-side supervisor or polling process. The comparison wall interval starts at the persisted `RunManifestV1.requestedAt` timestamp and ends when the changed `phits.out` contains the PHITS 3.37 normal-completion record. PHITS CPU time comes from the corresponding `total cpu time` field. Runs were sequential, never concurrent, and used the same input hash `edf0f1ff7f1dd88aab1c53014d513265e3024d8bdfa647c5e0245ce220acb9e1`.

## Local packaging rehearsal (2026-09-10)

The following ignored artifacts were regenerated after adding bundled public
documentation, portable packaging, a 502-component CycloneDX SBOM, and a
SHA-256 list. The embedded `BUILD_INFO.txt` intentionally records a dirty
working tree because the publication documentation had not yet been committed.
These are verification artifacts, not the final public release; rebuild them
from the clean release commit before tagging.

- Release executable: `src-tauri/target/release/phits-ai-editor.exe` (13,363,200 bytes; SHA-256 `0DF574C9BD0B4CFCCE4BC8DD66A0024C6448DA056D3DA75A3DE9CBC57E63418A`)
- NSIS installer: `PHITS-AI-Editor-v0.0.1-alpha-windows-x64-setup.exe` (3,041,432 bytes; SHA-256 `85D45CCAA08C225F59349845148117069EAF2CEB04D709FB29C367F59885E375`)
- Portable ZIP: `PHITS-AI-Editor-v0.0.1-alpha-windows-x64-portable.zip` (4,217,427 bytes; SHA-256 `BF0B98286EFF5696ED279073FECC4EE0B19291886FF02601E5A023D3E7A88667`)
- CycloneDX SBOM: `SBOM.cdx.json` (192,670 bytes; SHA-256 `8386BEAB857D632D810A461BD118A1F560AD8729673FE7D0AB041D82190EEE29`)
