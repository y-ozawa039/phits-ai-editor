use std::{
    ffi::OsString,
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Component, Path, PathBuf},
    process::Stdio,
    time::{SystemTime, UNIX_EPOCH},
};

use chrono::Utc;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::{io::AsyncReadExt, process::Command};
use uuid::Uuid;

use crate::{
    contracts::{
        Compatibility, ExecutionMode, FileFingerprintV1, PhitsOutputEvent, RunManifestV1, RunState,
        RunStatus, UtilityKind,
    },
    diagnostics::{
        phits_compatibility, phits_wrapper_path, read_phits_version, resolve_phits_root,
    },
    error::{AppError, AppResult},
    state::AppState,
    workspace::inspect_workspace,
};

const EVENT_OUTPUT: &str = "phits://output";
const EVENT_STATE: &str = "phits://state";
const MAX_EVENT_BYTES: usize = 16 * 1024;
const FINGERPRINT_TAIL_BYTES: u64 = 64 * 1024;
type CommandEnvironment = Vec<(OsString, OsString)>;

#[cfg(windows)]
type WindowsBatchSpec = (PathBuf, Vec<OsString>, CommandEnvironment);

#[derive(Debug, Clone)]
struct CommandSpec {
    program: PathBuf,
    args: Vec<OsString>,
    environment: CommandEnvironment,
    cwd: PathBuf,
    phits_root: PathBuf,
}

struct RunContext {
    workspace: PathBuf,
    input: PathBuf,
    input_relative: PathBuf,
    work_dir: PathBuf,
    phits_root: PathBuf,
    phits_version: Option<String>,
    wrapper: PathBuf,
}

struct PreparedRun {
    manifest: RunManifestV1,
    manifest_path: PathBuf,
}

#[tauri::command]
pub async fn run_phits_normal(
    app: AppHandle,
    state: State<'_, AppState>,
    workspace_root: String,
    override_unresolved: Option<bool>,
) -> AppResult<RunStatus> {
    let context = resolve_run_context(&workspace_root, override_unresolved.unwrap_or(false))?;
    let spec = phits_command_spec(&context)?;
    acquire_run_lock(&state, &context.work_dir).await?;

    let prepared = match prepare_run(&context, ExecutionMode::Normal) {
        Ok(prepared) => prepared,
        Err(error) => {
            release_run_lock(&state, &context.work_dir).await;
            return Err(error);
        }
    };
    let mut command = command_from_spec(&spec, false);
    command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            let message = format!("PHITSを起動できませんでした: {error}");
            mark_manifest_failed(&prepared.manifest_path, &prepared.manifest, &message);
            release_run_lock(&state, &context.work_dir).await;
            return Err(AppError::Message(message));
        }
    };

    let running = RunStatus {
        run_id: prepared.manifest.run_id.clone(),
        mode: ExecutionMode::Normal,
        state: RunState::Running,
        message: "PHITSを通常実行しています。".into(),
    };
    let _ = app.emit(EVENT_STATE, &running);

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let run_id = prepared.manifest.run_id.clone();
    let work_dir = context.work_dir.clone();
    let app_for_task = app.clone();
    tauri::async_runtime::spawn(async move {
        let stdout_task = stdout.map(|stream| {
            let app = app_for_task.clone();
            let run_id = run_id.clone();
            tokio::spawn(async move { stream_output(app, run_id, "stdout", stream).await })
        });
        let stderr_task = stderr.map(|stream| {
            let app = app_for_task.clone();
            let run_id = run_id.clone();
            tokio::spawn(async move { stream_output(app, run_id, "stderr", stream).await })
        });

        let outcome = child.wait().await;
        if let Some(task) = stdout_task {
            let _ = task.await;
        }
        if let Some(task) = stderr_task {
            let _ = task.await;
        }

        let (run_state, message) = match outcome {
            Ok(status) if status.success() => (
                RunState::Completed,
                "PHITSが正常に終了しました。".to_owned(),
            ),
            Ok(status) => (
                RunState::Failed,
                format!("PHITSが終了コード{:?}で終了しました。", status.code()),
            ),
            Err(error) => (
                RunState::Failed,
                format!("PHITSの終了を確認できませんでした: {error}"),
            ),
        };
        update_manifest_state(
            &prepared.manifest_path,
            &prepared.manifest,
            run_state.clone(),
            (run_state == RunState::Failed).then(|| message.clone()),
        );
        let final_status = RunStatus {
            run_id,
            mode: ExecutionMode::Normal,
            state: run_state,
            message,
        };
        let _ = app_for_task.emit(EVENT_STATE, final_status);
        let managed_state = app_for_task.state::<AppState>();
        release_run_lock(&managed_state, &work_dir).await;
    });

    Ok(running)
}

#[tauri::command]
pub async fn run_phits_production(
    app: AppHandle,
    state: State<'_, AppState>,
    workspace_root: String,
    override_unresolved: Option<bool>,
) -> AppResult<RunStatus> {
    let context = resolve_run_context(&workspace_root, override_unresolved.unwrap_or(false))?;
    let spec = phits_command_spec(&context)?;
    acquire_run_lock(&state, &context.work_dir).await?;

    let prepared = match prepare_run(&context, ExecutionMode::CalculationPriority) {
        Ok(prepared) => prepared,
        Err(error) => {
            release_run_lock(&state, &context.work_dir).await;
            return Err(error);
        }
    };

    if let Err(error) = crate::codex::disconnect_internal().await {
        let message = format!("Codex App Serverを終了できないため本番実行を開始しません: {error}");
        mark_manifest_failed(&prepared.manifest_path, &prepared.manifest, &message);
        release_run_lock(&state, &context.work_dir).await;
        return Err(AppError::Message(message));
    }

    let mut command = command_from_spec(&spec, true);
    command
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null());
    if let Err(error) = command.spawn() {
        let message = format!("本番PHITSプロセスを生成できませんでした: {error}");
        mark_manifest_failed(&prepared.manifest_path, &prepared.manifest, &message);
        release_run_lock(&state, &context.work_dir).await;
        return Err(AppError::Message(message));
    }

    update_manifest_state(
        &prepared.manifest_path,
        &prepared.manifest,
        RunState::Running,
        None,
    );

    let status = RunStatus {
        run_id: prepared.manifest.run_id,
        mode: ExecutionMode::CalculationPriority,
        state: RunState::Running,
        message: "本番PHITSを起動しました。エディターを終了します。".into(),
    };
    let _ = app.emit(EVENT_STATE, &status);
    app.exit(0);
    Ok(status)
}

#[tauri::command]
pub fn run_phits_stop_graceful(workspace_root: String) -> AppResult<()> {
    let context = resolve_run_context_core(&workspace_root)?;
    let batch_path = context.work_dir.join("batch.out");
    let batch_path = canonical_workspace_file(&context.workspace, &batch_path)?;
    let original = fs::read(&batch_path)?;
    let replacement = replace_first_batch_count(&original).ok_or_else(|| {
        AppError::Message("batch.outの先頭行に残りバッチ数が見つかりません。".into())
    })?;
    let mut file = OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(&batch_path)?;
    file.write_all(&replacement)?;
    file.sync_all()?;
    Ok(())
}

#[tauri::command]
pub async fn run_utility(
    _app: AppHandle,
    workspace_root: String,
    kind: UtilityKind,
    relative_path: String,
) -> AppResult<()> {
    let workspace = canonical_workspace(Path::new(&workspace_root))?;
    let target = resolve_relative_file(&workspace, Path::new(&relative_path))?;
    let work_dir = target
        .parent()
        .ok_or_else(|| AppError::Message("入力ファイルの親フォルダがありません。".into()))?
        .to_path_buf();
    let mut messages = Vec::new();
    let phits_root = resolve_phits_root(Some(&workspace), &mut messages)
        .ok_or_else(|| AppError::Message(messages.join(" ")))?;
    let spec = utility_command_spec(&phits_root, &work_dir, &target, kind)?;
    let status = command_from_spec(&spec, false)
        .stdin(Stdio::null())
        .status()
        .await?;
    if status.success() {
        Ok(())
    } else {
        Err(AppError::Message(format!(
            "ユーティリティが終了コード{:?}で終了しました。",
            status.code()
        )))
    }
}

async fn acquire_run_lock(state: &AppState, work_dir: &Path) -> AppResult<()> {
    if !state
        .try_acquire_run_directory(work_dir.to_path_buf())
        .await
    {
        return Err(AppError::Message(
            "同じフォルダですでにPHITSを実行しています。".into(),
        ));
    }
    Ok(())
}

async fn release_run_lock(state: &AppState, work_dir: &Path) {
    state.release_run_directory(work_dir).await;
}

fn resolve_run_context(workspace_root: &str, override_unresolved: bool) -> AppResult<RunContext> {
    let workspace = canonical_workspace(Path::new(workspace_root))?;
    handle_unresolved_runs(&workspace, override_unresolved)?;
    resolve_run_context_core(workspace_root)
}

fn resolve_run_context_core(workspace_root: &str) -> AppResult<RunContext> {
    let workspace = canonical_workspace(Path::new(workspace_root))?;
    let info = inspect_workspace(workspace.to_string_lossy().into_owned())?;
    let relative = info.primary_input.ok_or_else(|| {
        if info.candidate_inputs.is_empty() {
            AppError::Message("ワークスペース直下に主入力(.inp/.pht)がありません。".into())
        } else {
            AppError::Message("主入力候補が複数あります。1ファイルに絞ってください。".into())
        }
    })?;
    let input_relative = PathBuf::from(relative);
    let input = resolve_relative_file(&workspace, &input_relative)?;
    let work_dir = input
        .parent()
        .ok_or_else(|| AppError::Message("主入力の親フォルダがありません。".into()))?
        .to_path_buf();

    let mut messages = Vec::new();
    let phits_root = resolve_phits_root(Some(&workspace), &mut messages)
        .ok_or_else(|| AppError::Message(messages.join(" ")))?;
    let wrapper = phits_wrapper_path(&phits_root);
    if !wrapper.is_file() {
        return Err(AppError::Message(format!(
            "公式PHITSラッパーがありません: {}",
            wrapper.display()
        )));
    }
    #[cfg(windows)]
    if !phits_root.join("bin/phits.bat").is_file() {
        return Err(AppError::Message(
            "PHITS公式bin/phits.batがありません。".into(),
        ));
    }

    let phits_version = read_phits_version(&phits_root).ok();
    if phits_version
        .as_deref()
        .is_some_and(|version| phits_compatibility(version) == Compatibility::UnsupportedOlder)
    {
        return Err(AppError::Message(
            "PHITS 3.37より古い版は実行できません。".into(),
        ));
    }

    Ok(RunContext {
        workspace,
        input,
        input_relative,
        work_dir,
        phits_root,
        phits_version,
        wrapper,
    })
}

pub(crate) fn restore_last_run(workspace_root: &str) -> AppResult<Option<RunStatus>> {
    let workspace = canonical_workspace(Path::new(workspace_root))?;
    let runs = workspace.join(".phits-editor/runs");
    if !runs.is_dir() {
        return Ok(None);
    }
    let mut manifests = Vec::new();
    for path in run_manifest_paths(&runs)? {
        if let Ok(manifest) = serde_json::from_slice::<RunManifestV1>(&fs::read(&path)?) {
            manifests.push((manifest.requested_at.clone(), path, manifest));
        }
    }
    manifests.sort_by(|left, right| right.0.cmp(&left.0));
    let Some((_, path, mut manifest)) = manifests.into_iter().next() else {
        return Ok(None);
    };
    if matches!(
        manifest.restoration_state,
        RunState::Completed | RunState::Failed
    ) {
        return Ok(Some(status_from_manifest(&manifest)));
    }

    let input = workspace.join(&manifest.input_relative_path);
    let work_dir = input.parent().unwrap_or(&workspace);
    let phits_path = work_dir.join("phits.out");
    let phits_changed = output_changed(&workspace, &phits_path, &manifest.pre_run_files)?;
    let completed = phits_changed && tail_has_normal_completion(&phits_path)?;
    let geo_changed = fs::read_dir(work_dir)?.filter_map(Result::ok).any(|entry| {
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        name.ends_with("_geo.out")
            && output_changed(&workspace, &entry.path(), &manifest.pre_run_files).unwrap_or(false)
    });

    manifest.restoration_state = if completed {
        RunState::Completed
    } else {
        RunState::Unresolved
    };
    manifest.failure_message = None;
    write_manifest(&path, &manifest)?;
    let message = if completed && geo_changed {
        "PHITSの正常終了を確認しました。形状診断出力も更新されています。"
    } else if completed {
        "PHITS 3.37形式の正常終了記録を確認しました。"
    } else if geo_changed {
        "形状診断出力が更新されています。計算は実行中・中断・状態不明のいずれかです。"
    } else {
        "正常終了を確認できません。計算は実行中・中断・状態不明のいずれかです。"
    };
    Ok(Some(RunStatus {
        run_id: manifest.run_id,
        mode: manifest.mode,
        state: manifest.restoration_state,
        message: message.to_owned(),
    }))
}

fn status_from_manifest(manifest: &RunManifestV1) -> RunStatus {
    RunStatus {
        run_id: manifest.run_id.clone(),
        mode: manifest.mode.clone(),
        state: manifest.restoration_state.clone(),
        message: manifest.failure_message.clone().unwrap_or_else(|| {
            match manifest.restoration_state {
                RunState::Completed => "前回のPHITS実行は完了しています。".to_owned(),
                RunState::Failed => "前回のPHITS実行は失敗しました。".to_owned(),
                _ => "前回のPHITS実行状態を復元しました。".to_owned(),
            }
        }),
    }
}

fn handle_unresolved_runs(workspace: &Path, override_unresolved: bool) -> AppResult<()> {
    let runs = workspace.join(".phits-editor/runs");
    if !runs.is_dir() {
        return Ok(());
    }
    let mut unresolved = Vec::new();
    for path in run_manifest_paths(&runs)? {
        let mut manifest: RunManifestV1 = match serde_json::from_slice(&fs::read(&path)?) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if matches!(
            manifest.restoration_state,
            RunState::LaunchRequested
                | RunState::Running
                | RunState::StopRequested
                | RunState::Unresolved
        ) {
            if override_unresolved {
                manifest.restoration_state = RunState::Failed;
                manifest.failure_message = Some(
                    "ユーザーがOS上でプロセス停止を確認し、実行中ではないとして解除しました。"
                        .to_owned(),
                );
                write_manifest(&path, &manifest)?;
            } else {
                unresolved.push(manifest.run_id);
            }
        }
    }
    if unresolved.is_empty() || override_unresolved {
        Ok(())
    } else {
        Err(AppError::Message(format!(
            "状態不明のPHITS実行が残っています ({}件)。OS上でPHITSが停止していることを確認してから明示解除してください。",
            unresolved.len()
        )))
    }
}

fn run_manifest_paths(runs: &Path) -> AppResult<Vec<PathBuf>> {
    let mut paths = Vec::new();
    for entry in fs::read_dir(runs)? {
        let entry = entry?;
        let path = entry.path().join("run.json");
        if path.is_file() {
            paths.push(path);
        }
    }
    Ok(paths)
}

fn output_changed(
    workspace: &Path,
    path: &Path,
    previous: &[FileFingerprintV1],
) -> AppResult<bool> {
    let current = fingerprint(workspace, path)?;
    let old = previous.iter().find(|item| {
        item.relative_path
            .eq_ignore_ascii_case(&current.relative_path)
    });
    Ok(old != Some(&current))
}

fn tail_has_normal_completion(path: &Path) -> AppResult<bool> {
    if !path.is_file() {
        return Ok(false);
    }
    let mut file = File::open(path)?;
    let size = file.metadata()?.len();
    file.seek(SeekFrom::Start(size.saturating_sub(FINGERPRINT_TAIL_BYTES)))?;
    let mut tail = Vec::new();
    file.read_to_end(&mut tail)?;
    let text = String::from_utf8_lossy(&tail).to_ascii_lowercase();
    Ok(text.contains("phits simulation with icntl") && text.contains("is properly finished."))
}

fn canonical_workspace(path: &Path) -> AppResult<PathBuf> {
    let root = dunce::canonicalize(path)?;
    if !root.is_dir() {
        return Err(AppError::Message(format!(
            "ワークスペースではありません: {}",
            root.display()
        )));
    }
    Ok(root)
}

fn resolve_relative_file(workspace: &Path, relative: &Path) -> AppResult<PathBuf> {
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(AppError::Message(
            "絶対パスまたは範囲外パスは利用できません。".into(),
        ));
    }
    canonical_workspace_file(workspace, &workspace.join(relative))
}

fn canonical_workspace_file(workspace: &Path, path: &Path) -> AppResult<PathBuf> {
    let canonical = dunce::canonicalize(path)?;
    if !canonical.starts_with(workspace) {
        return Err(AppError::Message(
            "シンボリックリンク/ジャンクション経由の範囲外アクセスを拒否しました。".into(),
        ));
    }
    if !canonical.is_file() {
        return Err(AppError::Message(format!(
            "ファイルではありません: {}",
            canonical.display()
        )));
    }
    Ok(canonical)
}

fn prepare_run(context: &RunContext, mode: ExecutionMode) -> AppResult<PreparedRun> {
    let run_id = Uuid::new_v4().to_string();
    let run_dir = context.workspace.join(".phits-editor/runs").join(&run_id);
    fs::create_dir_all(&run_dir)?;

    let input_name = context
        .input
        .file_name()
        .ok_or_else(|| AppError::Message("主入力のファイル名がありません。".into()))?;
    let snapshot = run_dir.join(input_name);
    fs::copy(&context.input, &snapshot)?;
    OpenOptions::new().write(true).open(&snapshot)?.sync_all()?;
    let input_sha256 = sha256_file(&context.input)?;
    let snapshot_sha256 = sha256_file(&snapshot)?;
    if input_sha256 != snapshot_sha256 {
        return Err(AppError::Message(
            "スナップショット作成中に主入力が変更されました。保存状態を確認して再実行してください。"
                .into(),
        ));
    }

    let manifest = RunManifestV1 {
        schema_version: 1,
        run_id,
        mode,
        input_relative_path: context.input_relative.to_string_lossy().replace('\\', "/"),
        input_sha256,
        requested_at: Utc::now().to_rfc3339(),
        phits_version: context.phits_version.clone(),
        pre_run_files: capture_pre_run_fingerprints(&context.workspace, &context.work_dir)?,
        restoration_state: RunState::LaunchRequested,
        failure_message: None,
    };
    let manifest_path = run_dir.join("run.json");
    write_manifest(&manifest_path, &manifest)?;
    Ok(PreparedRun {
        manifest,
        manifest_path,
    })
}

fn write_manifest(path: &Path, manifest: &RunManifestV1) -> AppResult<()> {
    let temporary = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(manifest)?;
    {
        let mut file = File::create(&temporary)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
    }
    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(temporary, path)?;
    Ok(())
}

fn update_manifest_state(
    path: &Path,
    original: &RunManifestV1,
    state: RunState,
    failure: Option<String>,
) {
    let mut manifest = original.clone();
    manifest.restoration_state = state;
    manifest.failure_message = failure;
    let _ = write_manifest(path, &manifest);
}

fn mark_manifest_failed(path: &Path, manifest: &RunManifestV1, message: &str) {
    update_manifest_state(path, manifest, RunState::Failed, Some(message.to_owned()));
}

fn sha256_file(path: &Path) -> AppResult<String> {
    let mut file = File::open(path)?;
    let mut hash = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    Ok(hex::encode(hash.finalize()))
}

fn capture_pre_run_fingerprints(
    workspace: &Path,
    work_dir: &Path,
) -> AppResult<Vec<FileFingerprintV1>> {
    let mut paths = vec![work_dir.join("phits.out"), work_dir.join("batch.out")];
    for entry in fs::read_dir(work_dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        if name.ends_with("_geo.out") {
            paths.push(entry.path());
        }
    }
    paths.sort();
    paths.dedup();
    paths
        .into_iter()
        .map(|path| fingerprint(workspace, &path))
        .collect()
}

fn fingerprint(workspace: &Path, path: &Path) -> AppResult<FileFingerprintV1> {
    let relative_path = path
        .strip_prefix(workspace)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");
    if !path.exists() {
        return Ok(FileFingerprintV1 {
            relative_path,
            existed: false,
            size: None,
            modified_at_ms: None,
            tail_sha256: None,
        });
    }
    let canonical = canonical_workspace_file(workspace, path)?;
    let metadata = fs::metadata(&canonical)?;
    let modified_at_ms = metadata.modified().ok().and_then(system_time_millis);
    let mut file = File::open(&canonical)?;
    let size = metadata.len();
    file.seek(SeekFrom::Start(size.saturating_sub(FINGERPRINT_TAIL_BYTES)))?;
    let mut tail = Vec::with_capacity(size.min(FINGERPRINT_TAIL_BYTES) as usize);
    file.read_to_end(&mut tail)?;
    Ok(FileFingerprintV1 {
        relative_path,
        existed: true,
        size: Some(size),
        modified_at_ms,
        tail_sha256: Some(hex::encode(Sha256::digest(&tail))),
    })
}

fn system_time_millis(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|value| value.as_millis().min(u128::from(u64::MAX)) as u64)
}

fn phits_command_spec(context: &RunContext) -> AppResult<CommandSpec> {
    let input_name = context
        .input
        .file_name()
        .ok_or_else(|| AppError::Message("主入力のファイル名がありません。".into()))?;
    #[cfg(windows)]
    let (program, args) = (
        PathBuf::from("powershell.exe"),
        vec![
            "-NoLogo".into(),
            "-NoProfile".into(),
            "-NonInteractive".into(),
            "-ExecutionPolicy".into(),
            "Bypass".into(),
            "-File".into(),
            context.wrapper.as_os_str().to_owned(),
            "-InputFile".into(),
            input_name.to_owned(),
        ],
    );
    #[cfg(not(windows))]
    let (program, args) = (context.wrapper.clone(), vec![input_name.to_owned()]);
    Ok(CommandSpec {
        program,
        args,
        environment: Vec::new(),
        cwd: context.work_dir.clone(),
        phits_root: context.phits_root.clone(),
    })
}

fn utility_command_spec(
    root: &Path,
    cwd: &Path,
    target: &Path,
    kind: UtilityKind,
) -> AppResult<CommandSpec> {
    let name = target
        .file_name()
        .ok_or_else(|| AppError::Message("対象ファイル名がありません。".into()))?;
    #[cfg(windows)]
    let (program, args, environment) = match kind {
        UtilityKind::Angel => windows_batch_spec(root.join("bin/angel.bat"), name)?,
        UtilityKind::Dchain => windows_batch_spec(root.join("dchain-sp/bin/dchain.bat"), name)?,
        UtilityKind::Phig3d => {
            let executable = root.join("utility/phig3d/windows-x64/phig3d.exe");
            require_file(&executable)?;
            (executable, vec![name.to_owned()], Vec::new())
        }
    };
    #[cfg(target_os = "linux")]
    let (program, args, environment) = {
        let script = match kind {
            UtilityKind::Angel => root.join("workbench/task/linux/run_angel.sh"),
            UtilityKind::Dchain => root.join("workbench/task/linux/run_dchain.sh"),
            UtilityKind::Phig3d => root.join("workbench/task/linux/run_phig3d.sh"),
        };
        require_file(&script)?;
        (script, vec![name.to_owned()], Vec::new())
    };
    #[cfg(not(any(windows, target_os = "linux")))]
    let (program, args, environment) = {
        let script = match kind {
            UtilityKind::Angel => root.join("workbench/task/mac/run_angel.sh"),
            UtilityKind::Dchain => root.join("workbench/task/mac/run_dchain.sh"),
            UtilityKind::Phig3d => root.join("workbench/task/mac/run_phig3d.sh"),
        };
        require_file(&script)?;
        (script, vec![name.to_owned()], Vec::new())
    };
    Ok(CommandSpec {
        program,
        args,
        environment,
        cwd: cwd.to_path_buf(),
        phits_root: root.to_path_buf(),
    })
}

#[cfg(windows)]
fn windows_batch_spec(
    batch: PathBuf,
    target_name: &std::ffi::OsStr,
) -> AppResult<WindowsBatchSpec> {
    require_file(&batch)?;
    let batch = safe_cmd_environment_value(batch.as_os_str())?;
    let target = safe_cmd_environment_value(target_name)?;
    let command_line = format!(
        r#"call "{}" "{}""#,
        batch.to_string_lossy(),
        target.to_string_lossy()
    );
    Ok((
        PathBuf::from("cmd.exe"),
        vec![
            "/D".into(),
            "/S".into(),
            "/C".into(),
            "%PHITS_EDITOR_COMMAND%".into(),
        ],
        vec![("PHITS_EDITOR_COMMAND".into(), command_line.into())],
    ))
}

#[cfg(windows)]
fn safe_cmd_environment_value(value: &std::ffi::OsStr) -> AppResult<OsString> {
    let value = value
        .to_str()
        .ok_or_else(|| AppError::Message("Windowsコマンドで表現できないパスです。".into()))?;
    if value
        .chars()
        .any(|character| matches!(character, '"' | '%' | '!' | '\r' | '\n'))
    {
        return Err(AppError::Message(
            "Windowsバッチに安全に渡せない文字がパスに含まれています。".into(),
        ));
    }
    Ok(value.into())
}

fn require_file(path: &Path) -> AppResult<()> {
    if path.is_file() {
        Ok(())
    } else {
        Err(AppError::Message(format!(
            "公式実行経路がありません: {}",
            path.display()
        )))
    }
}

fn command_from_spec(spec: &CommandSpec, detached: bool) -> Command {
    let mut command = Command::new(&spec.program);
    command
        .args(&spec.args)
        .current_dir(&spec.cwd)
        .env("PHITSPATH", &spec.phits_root)
        .envs(spec.environment.iter().map(|(key, value)| (key, value)));
    #[cfg(windows)]
    if detached {
        use windows_sys::Win32::System::Threading::{CREATE_NEW_PROCESS_GROUP, CREATE_NO_WINDOW};
        command.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = detached;
    command
}

async fn stream_output<R>(app: AppHandle, run_id: String, stream_name: &'static str, mut stream: R)
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut buffer = vec![0_u8; MAX_EVENT_BYTES];
    loop {
        match stream.read(&mut buffer).await {
            Ok(0) => break,
            Ok(count) => {
                let payload = PhitsOutputEvent {
                    run_id: run_id.clone(),
                    stream: stream_name.into(),
                    text: String::from_utf8_lossy(&buffer[..count]).into_owned(),
                };
                let _ = app.emit(EVENT_OUTPUT, payload);
            }
            Err(error) => {
                let payload = PhitsOutputEvent {
                    run_id: run_id.clone(),
                    stream: "diagnostic".into(),
                    text: format!("出力ストリームを読み取れません: {error}"),
                };
                let _ = app.emit(EVENT_OUTPUT, payload);
                break;
            }
        }
    }
}

fn replace_first_batch_count(input: &[u8]) -> Option<Vec<u8>> {
    let line_end = input
        .iter()
        .position(|byte| *byte == b'\n')
        .unwrap_or(input.len());
    let first_line = &input[..line_end];
    let start = first_line.iter().position(u8::is_ascii_digit)?;
    let end = first_line[start..]
        .iter()
        .position(|byte| !byte.is_ascii_digit())
        .map(|offset| start + offset)
        .unwrap_or(first_line.len());
    let mut output = Vec::with_capacity(input.len() - (end - start) + 1);
    output.extend_from_slice(&input[..start]);
    output.push(b'0');
    output.extend_from_slice(&input[end..]);
    Some(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn graceful_stop_only_replaces_first_number_on_first_line() {
        let original = b"123 <--- number of remaining batches \r\nbat[ 4] ncas = 100\r\n";
        let changed = replace_first_batch_count(original).unwrap();
        assert_eq!(
            changed,
            b"0 <--- number of remaining batches \r\nbat[ 4] ncas = 100\r\n"
        );
    }

    #[test]
    fn rejects_parent_traversal() {
        let root = tempdir().unwrap();
        assert!(resolve_relative_file(root.path(), Path::new("../outside.inp")).is_err());
    }

    #[test]
    fn fingerprint_hashes_only_last_64_kib() {
        let root = tempdir().unwrap();
        let output = root.path().join("phits.out");
        let mut bytes = vec![b'a'; FINGERPRINT_TAIL_BYTES as usize];
        bytes.splice(0..0, [b'x'; 17]);
        fs::write(&output, &bytes).unwrap();
        let value = fingerprint(root.path(), &output).unwrap();
        assert_eq!(value.size, Some(bytes.len() as u64));
        assert_eq!(
            value.tail_sha256,
            Some(hex::encode(Sha256::digest(&bytes[17..])))
        );
    }

    #[test]
    fn missing_fingerprint_is_explicit() {
        let root = tempdir().unwrap();
        let value = fingerprint(root.path(), &root.path().join("phits.out")).unwrap();
        assert!(!value.existed);
        assert_eq!(value.size, None);
        assert_eq!(value.tail_sha256, None);
    }

    #[test]
    fn prepare_run_snapshots_input_hash_and_preexisting_outputs() {
        let root = tempdir().unwrap();
        let input = root.path().join("case.inp");
        fs::write(&input, b"[ Parameters ]\r\nmaxcas = 10\r\n").unwrap();
        fs::write(root.path().join("phits.out"), b"previous output").unwrap();
        let context = RunContext {
            workspace: root.path().to_path_buf(),
            input: input.clone(),
            input_relative: PathBuf::from("case.inp"),
            work_dir: root.path().to_path_buf(),
            phits_root: PathBuf::from("unused"),
            phits_version: Some("3.370".into()),
            wrapper: PathBuf::from("unused"),
        };

        let prepared = prepare_run(&context, ExecutionMode::CalculationPriority).unwrap();
        let persisted: RunManifestV1 =
            serde_json::from_slice(&fs::read(&prepared.manifest_path).unwrap()).unwrap();
        assert_eq!(persisted.input_sha256, sha256_file(&input).unwrap());
        assert_eq!(persisted.restoration_state, RunState::LaunchRequested);
        assert!(persisted.pre_run_files.iter().any(|item| {
            item.relative_path == "phits.out" && item.existed && item.tail_sha256.is_some()
        }));
        assert_eq!(
            fs::read(prepared.manifest_path.parent().unwrap().join("case.inp")).unwrap(),
            fs::read(input).unwrap()
        );
    }

    #[test]
    fn restore_requires_a_changed_phits_out_with_the_normal_completion_marker() {
        let root = tempdir().unwrap();
        let input = root.path().join("case.inp");
        fs::write(&input, b"[ Parameters ]\nmaxcas = 10\n").unwrap();
        let context = RunContext {
            workspace: root.path().to_path_buf(),
            input: input.clone(),
            input_relative: PathBuf::from("case.inp"),
            work_dir: root.path().to_path_buf(),
            phits_root: PathBuf::from("unused"),
            phits_version: Some("3.370".into()),
            wrapper: PathBuf::from("unused"),
        };
        let prepared = prepare_run(&context, ExecutionMode::CalculationPriority).unwrap();
        fs::write(
            root.path().join("phits.out"),
            b"PHITS simulation with icntl =   0 is properly finished.\n",
        )
        .unwrap();

        let restored = restore_last_run(root.path().to_str().unwrap())
            .unwrap()
            .unwrap();
        assert_eq!(restored.run_id, prepared.manifest.run_id);
        assert_eq!(restored.state, RunState::Completed);
    }

    #[test]
    fn unresolved_run_blocks_until_the_user_override_is_recorded() {
        let root = tempdir().unwrap();
        let input = root.path().join("case.inp");
        fs::write(&input, b"[ Parameters ]\n").unwrap();
        let context = RunContext {
            workspace: root.path().to_path_buf(),
            input,
            input_relative: PathBuf::from("case.inp"),
            work_dir: root.path().to_path_buf(),
            phits_root: PathBuf::from("unused"),
            phits_version: Some("3.370".into()),
            wrapper: PathBuf::from("unused"),
        };
        prepare_run(&context, ExecutionMode::CalculationPriority).unwrap();

        assert!(handle_unresolved_runs(root.path(), false).is_err());
        handle_unresolved_runs(root.path(), true).unwrap();
        assert!(handle_unresolved_runs(root.path(), false).is_ok());
    }

    #[cfg(windows)]
    #[test]
    fn windows_phits_spec_uses_wrapper_filename_cwd_and_environment() {
        let context = RunContext {
            workspace: PathBuf::from(r"C:\work"),
            input: PathBuf::from(r"C:\work\case.inp"),
            input_relative: PathBuf::from("case.inp"),
            work_dir: PathBuf::from(r"C:\work"),
            phits_root: PathBuf::from(r"C:\phits"),
            phits_version: Some("3.370".into()),
            wrapper: PathBuf::from(r"C:\phits\workbench\task\win\run_phits_no_pause.ps1"),
        };
        let spec = phits_command_spec(&context).unwrap();
        assert_eq!(spec.program, PathBuf::from("powershell.exe"));
        assert_eq!(spec.cwd, PathBuf::from(r"C:\work"));
        assert_eq!(spec.phits_root, PathBuf::from(r"C:\phits"));
        assert!(spec.environment.is_empty());
        assert_eq!(spec.args.last(), Some(&OsString::from("case.inp")));
        assert!(
            !spec
                .args
                .iter()
                .any(|arg| arg.to_string_lossy() == r"C:\work\case.inp")
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_utilities_use_only_official_fixed_paths() {
        let root = tempdir().unwrap();
        let work = root.path().join("work");
        fs::create_dir_all(root.path().join("bin")).unwrap();
        fs::create_dir_all(root.path().join("dchain-sp/bin")).unwrap();
        fs::create_dir_all(root.path().join("utility/phig3d/windows-x64")).unwrap();
        fs::create_dir_all(&work).unwrap();
        fs::write(root.path().join("bin/angel.bat"), b"@echo off").unwrap();
        fs::write(root.path().join("dchain-sp/bin/dchain.bat"), b"@echo off").unwrap();
        fs::write(
            root.path().join("utility/phig3d/windows-x64/phig3d.exe"),
            b"test",
        )
        .unwrap();
        let target = work.join("result.out");

        let angel = utility_command_spec(root.path(), &work, &target, UtilityKind::Angel).unwrap();
        let dchain =
            utility_command_spec(root.path(), &work, &target, UtilityKind::Dchain).unwrap();
        let phig = utility_command_spec(root.path(), &work, &target, UtilityKind::Phig3d).unwrap();
        assert_eq!(angel.program, PathBuf::from("cmd.exe"));
        assert_eq!(
            angel.args.last(),
            Some(&OsString::from("%PHITS_EDITOR_COMMAND%"))
        );
        assert_eq!(angel.environment.len(), 1);
        assert_eq!(
            angel.environment[0].0,
            OsString::from("PHITS_EDITOR_COMMAND")
        );
        assert_eq!(
            angel.environment[0].1.to_string_lossy().replace('/', "\\"),
            format!(
                r#"call "{}" "result.out""#,
                root.path()
                    .join("bin/angel.bat")
                    .to_string_lossy()
                    .replace('/', "\\")
            )
        );
        assert!(
            dchain.environment[0]
                .1
                .to_string_lossy()
                .replace('/', "\\")
                .contains("dchain-sp\\bin\\dchain.bat")
        );
        assert_eq!(
            phig.program,
            root.path().join("utility/phig3d/windows-x64/phig3d.exe")
        );
        assert_eq!(phig.args, vec![OsString::from("result.out")]);
        assert!(phig.environment.is_empty());
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn windows_batch_launch_does_not_trigger_wrapper_drag_and_drop_detection() {
        let root = tempdir().unwrap();
        let work = root.path().join("work");
        let batch = root.path().join("bin/angel.bat");
        fs::create_dir_all(batch.parent().unwrap()).unwrap();
        fs::create_dir_all(&work).unwrap();
        fs::write(
            &batch,
            b"@echo off\r\nsetlocal enableDelayedExpansion\r\nset \"cmd=!cmdcmdline!\"\r\nset \"cmd2=!cmd:*%~f0=!\"\r\nif \"!cmd2!\" neq \"!cmd!\" exit /b 17\r\nif not \"%~1\"==\"result.out\" exit /b 18\r\nexit /b 0\r\n",
        )
        .unwrap();
        let target = work.join("result.out");
        fs::write(&target, b"test").unwrap();

        let spec = utility_command_spec(root.path(), &work, &target, UtilityKind::Angel).unwrap();
        let status = command_from_spec(&spec, false)
            .stdin(Stdio::null())
            .status()
            .await
            .unwrap();

        assert!(status.success(), "wrapper exited with {status}");
    }
}
