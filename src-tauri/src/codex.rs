use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        Arc, OnceLock,
        atomic::{AtomicU64, Ordering},
    },
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{Mutex, oneshot},
    time::{Duration, timeout},
};

use crate::{
    codex_history::{
        CodexHistoryChangeInput, codex_change_history_abort, codex_change_history_begin,
        codex_change_history_complete,
    },
    contracts::{
        ApprovalMode, CodexCompatibilityReport, CodexConnectResult, CodexFeatureId,
        CodexFeatureState, CodexModel, CodexThreadLink, EditorContextV1,
    },
    diagnostics::{codex_compatibility_probe, resolve_codex_executable},
    error::{AppError, AppResult},
    workspace::{path_to_string, resolve_existing_path, resolve_save_path, validate_relative_path},
};

const CODEX_BASELINE: (u32, u32, u32) = (0, 153, 1);
const APP_SERVER_INSTRUCTIONS: &str = r#"You are the editing agent embedded in PHITS AI Editor.

Work only inside the current PHITS workspace. Never run PHITS, ANGEL, DCHAIN, or PHIG-3D, and never use network access.

The application appends a PHITS_EDITOR_CONTEXT_V1 item to every user turn. Treat that item as application-supplied editor state. Its activeDocumentPath is the currently open file, activeInputPath is the PHITS execution target, cursor and selection are one-based editor positions, and dirtyBuffer contains the unsaved buffer only when supplied. Resolve phrases such as "the current file", "the open file", and "here" from this context.

When the user asks to edit, create, rename, move, or delete a file and the turn is writable, perform the requested change now with Codex's built-in file-editing capability so the App Server emits a fileChange item and the PHITS AI Editor can present its review and approval UI. Do not merely print a unified diff, patch, replacement text, or instructions in chat unless the user explicitly asks only for a proposal or explanation. Never claim a file was changed unless the built-in editing action completed.

When the turn is read-only, discuss the requested change without attempting to modify files. Request approval through the App Server whenever its policy requires it."#;
type PendingResponse = oneshot::Sender<Result<Value, String>>;

fn editor_context_input(context: &EditorContextV1) -> AppResult<String> {
    Ok(format!(
        "PHITS_EDITOR_CONTEXT_V1\n{}",
        serde_json::to_string(context)?
    ))
}

#[derive(Debug, Clone)]
struct PendingApproval {
    method: String,
    proposed_execpolicy_amendment: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DiskRevision {
    sha256: String,
    modified_at_ms: u128,
}

struct CodexConnection {
    stdin: Mutex<Option<ChildStdin>>,
    child: Mutex<Child>,
    pending: Mutex<HashMap<u64, PendingResponse>>,
    approvals: Mutex<HashMap<String, PendingApproval>>,
    approval_items: Mutex<HashMap<String, Value>>,
    turn_diffs: Mutex<HashMap<String, String>>,
    thread_modes: Mutex<HashMap<String, ApprovalMode>>,
    thread_revisions: Mutex<HashMap<String, DiskRevision>>,
    change_histories: Mutex<HashMap<String, String>>,
    next_id: AtomicU64,
    workspace_root: PathBuf,
    compatibility: CodexCompatibilityReport,
    #[cfg(windows)]
    turn_process_baseline: Mutex<HashSet<u32>>,
}

fn approval_policy(mode: ApprovalMode) -> &'static str {
    match mode {
        ApprovalMode::OnRequest => "on-request",
        ApprovalMode::ConfirmFirst | ApprovalMode::ConsultationOnly => "untrusted",
    }
}

fn sandbox_policy(mode: ApprovalMode, workspace_root: &Path) -> Value {
    match mode {
        ApprovalMode::ConsultationOnly => json!({ "type": "readOnly" }),
        ApprovalMode::ConfirmFirst | ApprovalMode::OnRequest => json!({
            "type": "workspaceWrite", "writableRoots": [workspace_root], "networkAccess": false
        }),
    }
}

impl CodexConnection {
    async fn send_json(&self, value: &Value) -> AppResult<()> {
        let mut guard = self.stdin.lock().await;
        let stdin = guard
            .as_mut()
            .ok_or_else(|| AppError::Message("Codex App Server is disconnected".into()))?;
        let mut line = serde_json::to_vec(value)?;
        line.push(b'\n');
        stdin.write_all(&line).await?;
        stdin.flush().await?;
        Ok(())
    }

    async fn notify(&self, method: &str, params: Value) -> AppResult<()> {
        self.send_json(&json!({ "method": method, "params": params }))
            .await
    }

    async fn request(&self, method: &str, params: Value) -> AppResult<Value> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);
        if let Err(error) = self
            .send_json(&json!({ "method": method, "id": id, "params": params }))
            .await
        {
            self.pending.lock().await.remove(&id);
            return Err(error);
        }
        match timeout(Duration::from_secs(30), rx).await {
            Ok(Ok(Ok(value))) => Ok(value),
            Ok(Ok(Err(message))) => Err(AppError::Message(message)),
            Ok(Err(_)) => Err(AppError::Message("Codex response channel closed".into())),
            Err(_) => {
                self.pending.lock().await.remove(&id);
                Err(AppError::Message(format!(
                    "Codex request timed out: {method}"
                )))
            }
        }
    }
}

static CODEX_CONNECTION: OnceLock<Mutex<Option<Arc<CodexConnection>>>> = OnceLock::new();
fn connection_slot() -> &'static Mutex<Option<Arc<CodexConnection>>> {
    CODEX_CONNECTION.get_or_init(|| Mutex::new(None))
}

fn canonical_workspace(path: &str) -> AppResult<PathBuf> {
    let root = dunce::canonicalize(path)?;
    if !root.is_dir() {
        return Err(AppError::Message("Workspace is not a directory".into()));
    }
    Ok(root)
}

fn require_codex_feature(
    compatibility: &CodexCompatibilityReport,
    feature_id: CodexFeatureId,
    label: &str,
) -> AppResult<()> {
    if compatibility
        .features
        .iter()
        .any(|feature| feature.id == feature_id && feature.state == CodexFeatureState::Available)
    {
        Ok(())
    } else {
        Err(AppError::Message(format!(
            "This Codex CLI is not compatible with the {label} feature"
        )))
    }
}

#[cfg(any(windows, test))]
fn descendant_process_ids(root_pid: u32, processes: &[(u32, u32)]) -> Vec<u32> {
    let mut descendants = Vec::new();
    let mut parents = vec![root_pid];
    let mut seen = HashSet::from([root_pid]);
    while let Some(parent) = parents.pop() {
        for &(pid, parent_pid) in processes {
            if parent_pid == parent && seen.insert(pid) {
                descendants.push(pid);
                parents.push(pid);
            }
        }
    }
    descendants
}

#[cfg(windows)]
fn windows_descendant_process_ids(root_pid: u32) -> AppResult<Vec<u32>> {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
        System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
            TH32CS_SNAPPROCESS,
        },
    };

    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Err(AppError::Message(
            "Could not inspect Codex child processes".into(),
        ));
    }
    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };
    let mut processes = Vec::new();
    if unsafe { Process32FirstW(snapshot, &mut entry) } != 0 {
        loop {
            processes.push((entry.th32ProcessID, entry.th32ParentProcessID));
            if unsafe { Process32NextW(snapshot, &mut entry) } == 0 {
                break;
            }
        }
    }
    unsafe { CloseHandle(snapshot) };
    Ok(descendant_process_ids(root_pid, &processes))
}

#[cfg(windows)]
fn terminate_windows_turn_processes(root_pid: u32, baseline: &HashSet<u32>) -> AppResult<()> {
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::Threading::{OpenProcess, PROCESS_TERMINATE, TerminateProcess},
    };

    let mut descendants = windows_descendant_process_ids(root_pid)?;
    descendants.reverse();
    for pid in descendants {
        if baseline.contains(&pid) {
            continue;
        }
        let process = unsafe { OpenProcess(PROCESS_TERMINATE, 0, pid) };
        if process.is_null() {
            continue;
        }
        unsafe {
            TerminateProcess(process, 1);
            CloseHandle(process);
        }
    }
    Ok(())
}

fn approval_key(id: &Value) -> AppResult<String> {
    match id {
        Value::Number(_) | Value::String(_) => Ok(id.to_string()),
        _ => Err(AppError::Message("Invalid Codex request id".into())),
    }
}

fn scoped_item_key(params: &Value) -> Option<String> {
    let thread_id = params.get("threadId")?.as_str()?;
    let turn_id = params.get("turnId")?.as_str()?;
    let item_id = params
        .get("itemId")
        .and_then(Value::as_str)
        .or_else(|| params.get("item")?.get("id")?.as_str())?;
    Some(format!("{thread_id}\u{1f}{turn_id}\u{1f}{item_id}"))
}

fn scoped_turn_key(params: &Value) -> Option<String> {
    Some(format!(
        "{}\u{1f}{}",
        params.get("threadId")?.as_str()?,
        params.get("turnId")?.as_str()?
    ))
}

fn revision_key(thread_id: &str, relative_path: &str) -> String {
    format!("{thread_id}\u{1f}{relative_path}")
}

fn normalize_codex_change_path(workspace_root: &Path, value: &str) -> AppResult<String> {
    let requested = Path::new(value);
    let resolved = if requested.is_absolute() {
        if requested.exists() {
            dunce::canonicalize(requested).map_err(|error| {
                AppError::Message(format!(
                    "Codex変更対象を検証できません ({}): {error}",
                    requested.display()
                ))
            })?
        } else {
            let file_name = requested.file_name().ok_or_else(|| {
                AppError::Message(format!("無効なCodex変更対象です: {}", requested.display()))
            })?;
            let parent = requested.parent().ok_or_else(|| {
                AppError::Message(format!("無効なCodex変更対象です: {}", requested.display()))
            })?;
            dunce::canonicalize(parent)
                .map_err(|error| {
                    AppError::Message(format!(
                        "Codex変更対象の親フォルダーを検証できません ({}): {error}",
                        parent.display()
                    ))
                })?
                .join(file_name)
        }
    } else {
        resolve_save_path(workspace_root, requested)?
    };
    let canonical_root = dunce::canonicalize(workspace_root)?;
    let relative = resolved.strip_prefix(&canonical_root).map_err(|_| {
        AppError::Message(format!(
            "ワークスペース外のCodex変更対象です: {}",
            resolved.display()
        ))
    })?;
    validate_relative_path(relative)?;
    Ok(path_to_string(relative))
}

fn normalize_file_change_item(workspace_root: &Path, item: &Value) -> AppResult<Value> {
    if item.get("type").and_then(Value::as_str) != Some("fileChange") {
        return Ok(item.clone());
    }
    let mut normalized = item.clone();
    let changes = normalized
        .get_mut("changes")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| AppError::Message("Codex file change omitted its changes".into()))?;
    for change in changes {
        let path = change
            .get("path")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Message("Codex file change omitted its path".into()))?;
        let relative = normalize_codex_change_path(workspace_root, path)?;
        change["path"] = Value::String(relative);

        if let Some(move_path) = change
            .get("kind")
            .and_then(|kind| kind.get("move_path"))
            .and_then(Value::as_str)
        {
            let relative_move = normalize_codex_change_path(workspace_root, move_path)?;
            change["kind"]["move_path"] = Value::String(relative_move);
        }
    }
    Ok(normalized)
}

fn normalize_file_change_params(workspace_root: &Path, params: &Value) -> AppResult<Value> {
    let mut normalized = params.clone();
    if let Some(item) = normalized.get("item").cloned()
        && item.get("type").and_then(Value::as_str) == Some("fileChange")
    {
        normalized["item"] = normalize_file_change_item(workspace_root, &item)?;
    }
    Ok(normalized)
}

fn disk_revision(path: &Path) -> AppResult<DiskRevision> {
    let bytes = std::fs::read(path)?;
    let modified_at_ms = std::fs::metadata(path)?
        .modified()?
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| AppError::Message(format!("Invalid file modification time: {error}")))?
        .as_millis();
    Ok(DiskRevision {
        sha256: hex::encode(Sha256::digest(bytes)),
        modified_at_ms,
    })
}

async fn approval_has_disk_conflict(
    connection: &CodexConnection,
    params: &Value,
    item: Option<&Value>,
) -> AppResult<bool> {
    let Some(thread_id) = params.get("threadId").and_then(Value::as_str) else {
        return Ok(false);
    };
    let changes = params
        .get("changes")
        .or_else(|| item.and_then(|value| value.get("changes")));
    let revisions = connection.thread_revisions.lock().await;
    for change in changes.and_then(Value::as_array).into_iter().flatten() {
        let Some(relative_path) = change.get("path").and_then(Value::as_str) else {
            continue;
        };
        let Some(baseline) = revisions.get(&revision_key(thread_id, relative_path)) else {
            continue;
        };
        let current_path =
            resolve_existing_path(&connection.workspace_root, Path::new(relative_path))?;
        if &disk_revision(&current_path)? != baseline {
            return Ok(true);
        }
    }
    Ok(false)
}

fn approval_payload(
    request_id: &Value,
    method: &str,
    params: &Value,
    item: Option<&Value>,
    turn_diff: Option<&str>,
    workspace_root: &Path,
) -> Value {
    let mut payload = serde_json::Map::new();
    payload.insert("requestId".into(), request_id.clone());
    payload.insert("method".into(), Value::String(method.to_owned()));
    payload.insert(
        "kind".into(),
        Value::String(
            if method == "item/fileChange/requestApproval" {
                "fileChange"
            } else {
                "commandExecution"
            }
            .to_owned(),
        ),
    );
    payload.insert(
        "workspaceRoot".into(),
        Value::String(workspace_root.to_string_lossy().into_owned()),
    );

    for key in [
        "threadId",
        "turnId",
        "itemId",
        "startedAtMs",
        "approvalId",
        "environmentId",
        "reason",
        "grantRoot",
        "networkApprovalContext",
        "additionalPermissions",
        "proposedExecpolicyAmendment",
        "proposedNetworkPolicyAmendments",
        "availableDecisions",
    ] {
        if let Some(value) = params.get(key) {
            payload.insert(key.into(), value.clone());
        }
    }

    for key in ["command", "cwd", "commandActions", "changes", "status"] {
        if let Some(value) = params
            .get(key)
            .or_else(|| item.and_then(|item| item.get(key)))
        {
            payload.insert(key.into(), value.clone());
        }
    }
    if let Some(diff) = turn_diff {
        payload.insert("turnDiff".into(), Value::String(diff.to_owned()));
    }
    Value::Object(payload)
}

async fn record_notification_state(connection: &CodexConnection, method: &str, params: &Value) {
    match method {
        "item/started" => {
            if let (Some(key), Some(item)) = (scoped_item_key(params), params.get("item"))
                && matches!(
                    item.get("type").and_then(Value::as_str),
                    Some("fileChange" | "commandExecution")
                )
            {
                connection
                    .approval_items
                    .lock()
                    .await
                    .insert(key, item.clone());
            }
        }
        "item/fileChange/patchUpdated" => {
            if let Some(key) = scoped_item_key(params) {
                let item = json!({
                    "type": "fileChange",
                    "id": params.get("itemId").cloned().unwrap_or(Value::Null),
                    "changes": params.get("changes").cloned().unwrap_or_else(|| json!([])),
                    "status": "inProgress"
                });
                connection.approval_items.lock().await.insert(key, item);
            }
        }
        "turn/diff/updated" => {
            if let (Some(key), Some(diff)) = (
                scoped_turn_key(params),
                params.get("diff").and_then(Value::as_str),
            ) {
                connection
                    .turn_diffs
                    .lock()
                    .await
                    .insert(key, diff.to_owned());
            }
        }
        "item/completed" => {
            if let Some(key) = scoped_item_key(params) {
                connection.approval_items.lock().await.remove(&key);
            }
        }
        "turn/completed" => {
            if let Some(turn_key) = scoped_turn_key(params) {
                connection.turn_diffs.lock().await.remove(&turn_key);
                let prefix = format!("{turn_key}\u{1f}");
                connection
                    .approval_items
                    .lock()
                    .await
                    .retain(|key, _| !key.starts_with(&prefix));
            }
            if let Some(thread_id) = params.get("threadId").and_then(Value::as_str) {
                let prefix = format!("{thread_id}\u{1f}");
                connection
                    .thread_revisions
                    .lock()
                    .await
                    .retain(|key, _| !key.starts_with(&prefix));
            }
        }
        _ => {}
    }
}

fn file_change_event(method: &str, params: &Value) -> Option<Value> {
    if !matches!(method, "item/started" | "item/completed") {
        return None;
    }
    let item = params.get("item")?;
    if item.get("type").and_then(Value::as_str) != Some("fileChange") {
        return None;
    }
    Some(json!({
        "phase": if method == "item/started" { "started" } else { "completed" },
        "threadId": params.get("threadId").cloned().unwrap_or(Value::Null),
        "turnId": params.get("turnId").cloned().unwrap_or(Value::Null),
        "itemId": item.get("id").cloned().unwrap_or(Value::Null),
        "status": item.get("status").cloned().unwrap_or(Value::Null),
        "changes": item.get("changes").cloned().unwrap_or_else(|| json!([]))
    }))
}

fn file_change_history_inputs(params: &Value) -> AppResult<Vec<CodexHistoryChangeInput>> {
    let changes = params
        .get("item")
        .and_then(|item| item.get("changes"))
        .and_then(Value::as_array)
        .ok_or_else(|| AppError::Message("Codex file change omitted its changes".into()))?;
    changes
        .iter()
        .map(|change| {
            let path = change
                .get("path")
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::Message("Codex file change omitted its path".into()))?;
            let kind_value = change.get("kind").unwrap_or(&Value::Null);
            let kind = kind_value
                .get("type")
                .or(Some(kind_value))
                .and_then(Value::as_str)
                .unwrap_or("update");
            let after_path = kind_value
                .get("move_path")
                .and_then(Value::as_str)
                .map(str::to_owned);
            Ok(CodexHistoryChangeInput {
                path: path.to_owned(),
                after_path,
                kind: kind.to_owned(),
            })
        })
        .collect()
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn validate_file_changes(workspace_root: &Path, method: &str, params: &Value) -> AppResult<()> {
    let Some(item) = params.get("item") else {
        return Ok(());
    };
    if item.get("type").and_then(Value::as_str) != Some("fileChange") {
        return Ok(());
    }
    for change in item
        .get("changes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let path = change
            .get("path")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Message("Codex file change omitted a relative path".into()))?;
        let relative = Path::new(path);
        validate_relative_path(relative)?;
        if method == "item/started" && workspace_root.join(relative).exists() {
            resolve_existing_path(workspace_root, relative)?;
        }
    }
    Ok(())
}

fn prohibited_command_reason(params: &Value, item: Option<&Value>) -> Option<&'static str> {
    if params.get("networkApprovalContext").is_some()
        || params.get("proposedNetworkPolicyAmendments").is_some()
    {
        return Some("Codexからのネットワーク利用は禁止されています。");
    }
    let text = format!("{} {}", params, item.unwrap_or(&Value::Null)).to_ascii_lowercase();
    if [
        "run_phits",
        "phits.exe",
        "phits.bat",
        "angel.bat",
        "dchain.bat",
        "phig3d",
    ]
    .iter()
    .any(|needle| text.contains(needle))
    {
        return Some("CodexからPHITS系プログラムを起動することは禁止されています。");
    }
    None
}

fn validate_approval_file_paths(
    workspace_root: &Path,
    params: &Value,
    item: Option<&Value>,
) -> AppResult<()> {
    let changes = params
        .get("changes")
        .or_else(|| item.and_then(|value| value.get("changes")));
    for change in changes.and_then(Value::as_array).into_iter().flatten() {
        let value = change
            .get("path")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Message("Codex file change omitted a relative path".into()))?;
        let relative = Path::new(value);
        validate_relative_path(relative)?;
        resolve_save_path(workspace_root, relative)?;
        let kind = change
            .get("kind")
            .and_then(|value| value.get("type").or(Some(value)))
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Message("Codex file change omitted its kind".into()))?;
        if !matches!(kind, "add" | "delete" | "update") {
            return Err(AppError::Message(format!(
                "Unknown Codex file change kind: {kind}"
            )));
        }
        if let Some(move_path) = change
            .get("kind")
            .and_then(|value| value.get("move_path"))
            .and_then(Value::as_str)
        {
            resolve_save_path(workspace_root, Path::new(move_path))?;
        }
    }
    Ok(())
}

async fn reader_loop(
    connection: Arc<CodexConnection>,
    stdout: tokio::process::ChildStdout,
    app: AppHandle,
) {
    let mut lines = BufReader::new(stdout).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let Ok(message) = serde_json::from_str::<Value>(&line) else {
            let _ = app.emit("codex://log", format!("Invalid JSONL: {line}"));
            continue;
        };
        if let Some(id) = message.get("id").and_then(Value::as_u64)
            && message.get("method").is_none()
        {
            if let Some(sender) = connection.pending.lock().await.remove(&id) {
                let result = if let Some(error) = message.get("error") {
                    Err(error
                        .get("message")
                        .and_then(Value::as_str)
                        .unwrap_or("Codex request failed")
                        .to_string())
                } else {
                    Ok(message.get("result").cloned().unwrap_or(Value::Null))
                };
                let _ = sender.send(result);
            }
            continue;
        }
        if let (Some(id), Some(method)) = (
            message.get("id"),
            message.get("method").and_then(Value::as_str),
        ) {
            if matches!(
                method,
                "item/commandExecution/requestApproval" | "item/fileChange/requestApproval"
            ) {
                let raw_params = message.get("params").cloned().unwrap_or(Value::Null);
                let (params, params_path_error) =
                    match normalize_file_change_params(&connection.workspace_root, &raw_params) {
                        Ok(params) => (params, None),
                        Err(error) => (raw_params, Some(error.to_string())),
                    };
                let item_key = scoped_item_key(&params);
                let raw_item = if let Some(key) = item_key.as_ref() {
                    connection.approval_items.lock().await.get(key).cloned()
                } else {
                    None
                };
                let (item, item_path_error) = match raw_item {
                    Some(item) if method == "item/fileChange/requestApproval" => {
                        match normalize_file_change_item(&connection.workspace_root, &item) {
                            Ok(item) => (Some(item), None),
                            Err(error) => (Some(item), Some(error.to_string())),
                        }
                    }
                    item => (item, None),
                };
                let consultation_only =
                    if let Some(thread_id) = params.get("threadId").and_then(Value::as_str) {
                        connection.thread_modes.lock().await.get(thread_id).copied()
                            == Some(ApprovalMode::ConsultationOnly)
                    } else {
                        false
                    };
                let disk_conflict = if method == "item/fileChange/requestApproval" {
                    approval_has_disk_conflict(&connection, &params, item.as_ref())
                        .await
                        .unwrap_or(true)
                } else {
                    false
                };
                let path_error = params_path_error.or(item_path_error);
                let automatic_decline_reason = if consultation_only {
                    Some("相談のみモードのため変更要求を自動拒否しました。".to_string())
                } else if disk_conflict {
                    Some(
                        "ターン開始後にディスク上のファイルが変化したため変更要求を自動拒否しました。"
                            .to_string(),
                    )
                } else if let Some(error) = path_error {
                    Some(format!(
                        "Codex変更対象を安全に検証できなかったため自動拒否しました: {error}"
                    ))
                } else if method == "item/commandExecution/requestApproval" {
                    prohibited_command_reason(&params, item.as_ref()).map(str::to_string)
                } else if validate_approval_file_paths(
                    &connection.workspace_root,
                    &params,
                    item.as_ref(),
                )
                .is_err()
                {
                    Some(
                        "ワークスペース外または無効なファイル変更要求を自動拒否しました。"
                            .to_string(),
                    )
                } else {
                    None
                };
                if let Some(reason) = automatic_decline_reason {
                    let _ = connection
                        .send_json(&json!({ "id": id, "result": { "decision": "decline" } }))
                        .await;
                    let _ = app.emit("codex://log", reason);
                    continue;
                }
                let turn_diff = if let Some(key) = scoped_turn_key(&params) {
                    connection.turn_diffs.lock().await.get(&key).cloned()
                } else {
                    None
                };
                if let Ok(key) = approval_key(id) {
                    connection.approvals.lock().await.insert(
                        key,
                        PendingApproval {
                            method: method.to_string(),
                            proposed_execpolicy_amendment: params
                                .get("proposedExecpolicyAmendment")
                                .cloned(),
                        },
                    );
                }
                let payload = approval_payload(
                    id,
                    method,
                    &params,
                    item.as_ref(),
                    turn_diff.as_deref(),
                    &connection.workspace_root,
                );
                let _ = app.emit("codex://approval", payload);
            } else {
                let _ = connection.send_json(&json!({ "id": id, "error": { "code": -32601, "message": "This client does not support the requested interaction" } })).await;
            }
            continue;
        }
        if let Some(method) = message.get("method").and_then(Value::as_str) {
            let raw_params = message.get("params").cloned().unwrap_or(Value::Null);
            let params = match normalize_file_change_params(&connection.workspace_root, &raw_params)
            {
                Ok(params) => params,
                Err(error) => {
                    record_notification_state(&connection, method, &raw_params).await;
                    let _ = app.emit(
                        "codex://log",
                        format!("Unsafe or invalid Codex file change ignored: {error}"),
                    );
                    let _ = app.emit(
                        "codex://event",
                        json!({ "method": method, "params": raw_params }),
                    );
                    continue;
                }
            };
            record_notification_state(&connection, method, &params).await;
            if method == "thread/name/updated"
                && let (Some(thread_id), Some(name)) = (
                    params.get("threadId").and_then(Value::as_str),
                    params.get("threadName").and_then(Value::as_str),
                )
                && let Ok(mut links) = load_thread_links(&connection.workspace_root)
                && let Some(link) = links
                    .threads
                    .iter_mut()
                    .find(|link| link.thread_id == thread_id)
            {
                link.title = name.to_string();
                link.last_used_at = Utc::now().to_rfc3339();
                let _ = save_thread_links(&connection.workspace_root, &links);
            }
            if let Some(payload) = file_change_event(method, &params) {
                match validate_file_changes(&connection.workspace_root, method, &params) {
                    Ok(()) => {
                        let item_id = params
                            .get("item")
                            .and_then(|item| item.get("id"))
                            .and_then(Value::as_str)
                            .map(str::to_owned);
                        let mut payload = payload;
                        let history_id = if method == "item/started" {
                            match (item_id.as_deref(), file_change_history_inputs(&params)) {
                                (Some(item_id), Ok(changes)) if !changes.is_empty() => {
                                    match codex_change_history_begin(
                                        path_to_string(&connection.workspace_root),
                                        string_field(&params, "threadId"),
                                        string_field(&params, "turnId"),
                                        Some(item_id.to_owned()),
                                        changes,
                                    ) {
                                        Ok(history_id) => {
                                            connection
                                                .change_histories
                                                .lock()
                                                .await
                                                .insert(item_id.to_owned(), history_id.clone());
                                            Some(history_id)
                                        }
                                        Err(error) => {
                                            let _ = app.emit(
                                                "codex://log",
                                                format!(
                                                    "Codex change history could not start: {error}"
                                                ),
                                            );
                                            None
                                        }
                                    }
                                }
                                (_, Err(error)) => {
                                    let _ = app.emit(
                                        "codex://log",
                                        format!("Codex change history could not start: {error}"),
                                    );
                                    None
                                }
                                _ => None,
                            }
                        } else if let Some(item_id) = item_id.as_deref() {
                            let history_id =
                                connection.change_histories.lock().await.remove(item_id);
                            if let Some(history_id) = history_id.as_deref() {
                                let completed = params
                                    .get("item")
                                    .and_then(|item| item.get("status"))
                                    .and_then(Value::as_str)
                                    .is_some_and(|status| status.eq_ignore_ascii_case("completed"));
                                let result = if completed {
                                    codex_change_history_complete(
                                        path_to_string(&connection.workspace_root),
                                        history_id.to_owned(),
                                    )
                                    .map(|_| ())
                                } else {
                                    codex_change_history_abort(
                                        path_to_string(&connection.workspace_root),
                                        history_id.to_owned(),
                                    )
                                };
                                if let Err(error) = result {
                                    let _ = app.emit(
                                        "codex://log",
                                        format!("Codex change history could not finish: {error}"),
                                    );
                                }
                            }
                            history_id
                        } else {
                            None
                        };
                        if let (Some(object), Some(history_id)) =
                            (payload.as_object_mut(), history_id)
                        {
                            object.insert("historyId".into(), Value::String(history_id));
                        }
                        let _ = app.emit("codex://file-change", payload);
                    }
                    Err(error) => {
                        let _ = app.emit(
                            "codex://log",
                            format!("Unsafe or invalid Codex file change ignored: {error}"),
                        );
                    }
                }
            }
            if method == "serverRequest/resolved"
                && let Some(request_id) = params.get("requestId")
            {
                if let Ok(key) = approval_key(request_id) {
                    connection.approvals.lock().await.remove(&key);
                }
                let _ = app.emit(
                    "codex://approval-resolved",
                    json!({
                        "requestId": request_id,
                        "threadId": params.get("threadId").cloned().unwrap_or(Value::Null)
                    }),
                );
            }
            let _ = app.emit(
                "codex://event",
                json!({ "method": method, "params": params }),
            );
        }
    }
    let mut pending = connection.pending.lock().await;
    for (_, sender) in pending.drain() {
        let _ = sender.send(Err("Codex App Server exited".into()));
    }
    let _ = app.emit("codex://disconnected", ());
}

async fn stderr_loop(stderr: tokio::process::ChildStderr, app: AppHandle) {
    let mut lines = BufReader::new(stderr).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let _ = app.emit("codex://log", line);
    }
}

fn parse_version(text: &str) -> Option<(u32, u32, u32)> {
    let value = text.split_whitespace().find(|part| {
        part.chars()
            .next()
            .is_some_and(|first| first.is_ascii_digit())
    })?;
    let values: Vec<_> = value
        .split('.')
        .map(|part| part.parse::<u32>().ok())
        .collect();
    Some((
        *values.first()?.as_ref()?,
        values.get(1).and_then(|v| *v).unwrap_or(0),
        values.get(2).and_then(|v| *v).unwrap_or(0),
    ))
}

async fn verify_codex_version() -> AppResult<PathBuf> {
    let executable = resolve_codex_executable()
        .ok_or_else(|| AppError::Message("Codex CLI was not found".into()))?;
    let output = Command::new(&executable)
        .arg("--version")
        .stdin(Stdio::null())
        .output()
        .await
        .map_err(|_| AppError::Message("Codex CLI was not found in PATH".into()))?;
    let version = parse_version(&String::from_utf8_lossy(&output.stdout))
        .ok_or_else(|| AppError::Message("Could not detect the Codex CLI version".into()))?;
    if version < CODEX_BASELINE {
        return Err(AppError::Message(format!(
            "Codex CLI {version:?} is older than the tested baseline 0.153.1"
        )));
    }
    Ok(executable)
}

async fn current_connection() -> AppResult<Arc<CodexConnection>> {
    connection_slot()
        .lock()
        .await
        .clone()
        .ok_or_else(|| AppError::Message("Codex is not connected".into()))
}

async fn ensure_workspace(connection: &CodexConnection, workspace_root: &str) -> AppResult<()> {
    if canonical_workspace(workspace_root)? != connection.workspace_root {
        return Err(AppError::Message(
            "Codex is connected to a different workspace".into(),
        ));
    }
    Ok(())
}

fn parse_models(result: &Value) -> Vec<CodexModel> {
    result
        .get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|model| {
            let id = model
                .get("id")
                .or_else(|| model.get("model"))?
                .as_str()?
                .to_string();
            let supported_reasoning_efforts = model
                .get("supportedReasoningEfforts")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|effort| {
                    effort
                        .get("reasoningEffort")
                        .and_then(Value::as_str)
                        .map(ToString::to_string)
                })
                .collect();
            Some(CodexModel {
                display_name: model
                    .get("displayName")
                    .and_then(Value::as_str)
                    .unwrap_or(&id)
                    .to_string(),
                is_default: model
                    .get("isDefault")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                default_reasoning_effort: model
                    .get("defaultReasoningEffort")
                    .and_then(Value::as_str)
                    .map(ToString::to_string),
                supported_reasoning_efforts,
                id,
            })
        })
        .collect()
}

async fn start_connection(
    app: AppHandle,
    workspace_root: PathBuf,
    compatibility: CodexCompatibilityReport,
) -> AppResult<Arc<CodexConnection>> {
    let executable = verify_codex_version().await?;
    let mut child = Command::new(executable)
        .arg("app-server")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(false)
        .spawn()
        .map_err(|error| AppError::Message(format!("Failed to start Codex App Server: {error}")))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| AppError::Message("Codex stdin was not available".into()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Message("Codex stdout was not available".into()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Message("Codex stderr was not available".into()))?;
    let connection = Arc::new(CodexConnection {
        stdin: Mutex::new(Some(stdin)),
        child: Mutex::new(child),
        pending: Mutex::new(HashMap::new()),
        approvals: Mutex::new(HashMap::new()),
        approval_items: Mutex::new(HashMap::new()),
        turn_diffs: Mutex::new(HashMap::new()),
        thread_modes: Mutex::new(HashMap::new()),
        thread_revisions: Mutex::new(HashMap::new()),
        change_histories: Mutex::new(HashMap::new()),
        next_id: AtomicU64::new(1),
        workspace_root,
        compatibility,
        #[cfg(windows)]
        turn_process_baseline: Mutex::new(HashSet::new()),
    });
    tokio::spawn(reader_loop(connection.clone(), stdout, app.clone()));
    tokio::spawn(stderr_loop(stderr, app));
    connection.request("initialize", json!({ "clientInfo": { "name": "phits_ai_editor", "title": "PHITS AI Editor", "version": env!("CARGO_PKG_VERSION") } })).await?;
    connection.notify("initialized", json!({})).await?;
    Ok(connection)
}

#[tauri::command]
pub async fn codex_connect(
    app: AppHandle,
    workspace_root: String,
) -> AppResult<CodexConnectResult> {
    let workspace = canonical_workspace(&workspace_root)?;
    let compatibility = codex_compatibility_probe(false).await?;
    require_codex_feature(&compatibility, CodexFeatureId::Chat, "chat")?;
    let connection = if let Some(connection) = connection_slot().lock().await.clone() {
        ensure_workspace(&connection, &workspace_root).await?;
        connection
    } else {
        let connection = start_connection(app, workspace, compatibility).await?;
        *connection_slot().lock().await = Some(connection.clone());
        connection
    };
    let models = parse_models(
        &connection
            .request(
                "model/list",
                json!({ "limit": 100, "includeHidden": false }),
            )
            .await?,
    );
    let links = load_thread_links(&connection.workspace_root)?;
    Ok(CodexConnectResult {
        models,
        active_thread_id: links.active_thread_id,
        threads: links
            .threads
            .into_iter()
            .map(|link| CodexThreadLink {
                thread_id: link.thread_id,
                title: link.title,
                last_used_at: link.last_used_at,
                model: link.model,
                reasoning_effort: link.reasoning_effort,
            })
            .collect(),
        compatibility: connection.compatibility.clone(),
    })
}

pub async fn disconnect_internal() -> AppResult<()> {
    let connection = connection_slot().lock().await.take();
    let Some(connection) = connection else {
        return Ok(());
    };
    if let Some(mut stdin) = connection.stdin.lock().await.take() {
        let _ = stdin.shutdown().await;
    }
    let mut child = connection.child.lock().await;
    if timeout(Duration::from_secs(3), child.wait()).await.is_err() {
        child.start_kill()?;
        let _ = timeout(Duration::from_secs(2), child.wait()).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn codex_disconnect() -> AppResult<()> {
    disconnect_internal().await
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ThreadLinks {
    schema_version: u32,
    active_thread_id: Option<String>,
    threads: Vec<ThreadLink>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ThreadLink {
    thread_id: String,
    title: String,
    last_used_at: String,
    model: Option<String>,
    reasoning_effort: Option<String>,
}

fn persist_thread_link(
    root: &Path,
    id: &str,
    model: Option<String>,
    effort: Option<String>,
) -> AppResult<()> {
    let directory = root.join(".phits-editor").join("codex");
    std::fs::create_dir_all(&directory)?;
    let path = directory.join("threads.json");
    let mut links = load_thread_links(root)?;
    links.schema_version = 1;
    links.active_thread_id = Some(id.to_string());
    if let Some(link) = links.threads.iter_mut().find(|link| link.thread_id == id) {
        link.last_used_at = Utc::now().to_rfc3339();
        if model.is_some() {
            link.model = model;
        }
        if effort.is_some() {
            link.reasoning_effort = effort;
        }
    } else {
        links.threads.push(ThreadLink {
            thread_id: id.to_string(),
            title: "新しい会話".into(),
            last_used_at: Utc::now().to_rfc3339(),
            model,
            reasoning_effort: effort,
        });
    }
    let temporary = directory.join("threads.json.tmp");
    std::fs::write(&temporary, serde_json::to_vec_pretty(&links)?)?;
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    std::fs::rename(temporary, path)?;
    Ok(())
}

fn save_thread_links(root: &Path, links: &ThreadLinks) -> AppResult<()> {
    let directory = root.join(".phits-editor").join("codex");
    std::fs::create_dir_all(&directory)?;
    let path = directory.join("threads.json");
    let temporary = directory.join("threads.json.tmp");
    std::fs::write(&temporary, serde_json::to_vec_pretty(links)?)?;
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    std::fs::rename(temporary, path)?;
    Ok(())
}

fn fallback_thread_title(text: &str) -> String {
    let mut title: String = text
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(36)
        .collect();
    if title.is_empty() {
        title = "新しい会話".into();
    }
    title
}

fn load_thread_links(root: &Path) -> AppResult<ThreadLinks> {
    let path = root.join(".phits-editor/codex/threads.json");
    if !path.exists() {
        return Ok(ThreadLinks::default());
    }
    Ok(serde_json::from_slice(&std::fs::read(path)?).unwrap_or_default())
}

#[tauri::command]
pub async fn codex_thread_start(
    workspace_root: String,
    model: Option<String>,
    reasoning_effort: Option<String>,
) -> AppResult<String> {
    let connection = current_connection().await?;
    require_codex_feature(
        &connection.compatibility,
        CodexFeatureId::Threads,
        "threads",
    )?;
    ensure_workspace(&connection, &workspace_root).await?;
    let result = connection.request("thread/start", json!({
        "cwd": connection.workspace_root, "model": model, "approvalPolicy": "untrusted", "sandbox": "workspace-write", "developerInstructions": APP_SERVER_INSTRUCTIONS
    })).await?;
    let id = result
        .pointer("/thread/id")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::Message("Codex did not return a thread id".into()))?
        .to_string();
    persist_thread_link(&connection.workspace_root, &id, model, reasoning_effort)?;
    Ok(id)
}

#[tauri::command]
pub async fn codex_thread_resume(workspace_root: String, thread_id: String) -> AppResult<Value> {
    let connection = current_connection().await?;
    require_codex_feature(
        &connection.compatibility,
        CodexFeatureId::Threads,
        "threads",
    )?;
    ensure_workspace(&connection, &workspace_root).await?;
    connection.request("thread/resume", json!({
        "threadId": thread_id, "cwd": connection.workspace_root, "approvalPolicy": "untrusted", "sandbox": "workspace-write", "developerInstructions": APP_SERVER_INSTRUCTIONS
    })).await?;
    persist_thread_link(&connection.workspace_root, &thread_id, None, None)?;
    connection
        .request(
            "thread/read",
            json!({ "threadId": thread_id, "includeTurns": true }),
        )
        .await
}

#[tauri::command]
pub async fn codex_thread_rename(
    workspace_root: String,
    thread_id: String,
    title: String,
) -> AppResult<()> {
    let connection = current_connection().await?;
    require_codex_feature(
        &connection.compatibility,
        CodexFeatureId::Threads,
        "threads",
    )?;
    ensure_workspace(&connection, &workspace_root).await?;
    let title = title.trim();
    if title.is_empty() || title.chars().count() > 120 {
        return Err(AppError::Message(
            "Thread title must contain 1 to 120 characters".into(),
        ));
    }
    connection
        .request(
            "thread/name/set",
            json!({ "threadId": thread_id, "name": title }),
        )
        .await?;
    let mut links = load_thread_links(&connection.workspace_root)?;
    let link = links
        .threads
        .iter_mut()
        .find(|link| link.thread_id == thread_id)
        .ok_or_else(|| AppError::Message("Thread link was not found".into()))?;
    link.title = title.to_string();
    link.last_used_at = Utc::now().to_rfc3339();
    save_thread_links(&connection.workspace_root, &links)
}

#[tauri::command]
pub async fn codex_thread_delete(workspace_root: String, thread_id: String) -> AppResult<()> {
    let connection = current_connection().await?;
    require_codex_feature(
        &connection.compatibility,
        CodexFeatureId::Threads,
        "threads",
    )?;
    ensure_workspace(&connection, &workspace_root).await?;
    connection
        .request("thread/delete", json!({ "threadId": thread_id }))
        .await?;
    let mut links = load_thread_links(&connection.workspace_root)?;
    links.threads.retain(|link| link.thread_id != thread_id);
    if links.active_thread_id.as_deref() == Some(&thread_id) {
        links.active_thread_id = None;
    }
    connection.thread_modes.lock().await.remove(&thread_id);
    save_thread_links(&connection.workspace_root, &links)
}

#[tauri::command]
pub async fn codex_turn_start(
    thread_id: String,
    text: String,
    context: Option<EditorContextV1>,
    approval_mode: ApprovalMode,
    model: Option<String>,
    reasoning_effort: Option<String>,
    force_read_only: bool,
) -> AppResult<Value> {
    if text.trim().is_empty() {
        return Err(AppError::Message("Message is empty".into()));
    }
    let connection = current_connection().await?;
    require_codex_feature(&connection.compatibility, CodexFeatureId::Chat, "chat")?;
    let effective_mode = if force_read_only {
        ApprovalMode::ConsultationOnly
    } else {
        approval_mode
    };
    if effective_mode != ApprovalMode::ConsultationOnly {
        require_codex_feature(
            &connection.compatibility,
            CodexFeatureId::FileEditing,
            "file editing",
        )?;
        require_codex_feature(
            &connection.compatibility,
            CodexFeatureId::Approvals,
            "approvals",
        )?;
    }
    connection
        .thread_modes
        .lock()
        .await
        .insert(thread_id.clone(), effective_mode);
    {
        let mut revisions = connection.thread_revisions.lock().await;
        let prefix = format!("{thread_id}\u{1f}");
        revisions.retain(|key, _| !key.starts_with(&prefix));
        if let Some(editor_context) = context.as_ref() {
            let mut paths = editor_context.open_document_paths.clone();
            if let Some(path) = editor_context.active_document_path.as_ref() {
                paths.push(path.clone());
            }
            paths.sort();
            paths.dedup();
            for relative_path in paths {
                let resolved =
                    resolve_existing_path(&connection.workspace_root, Path::new(&relative_path))?;
                revisions.insert(
                    revision_key(&thread_id, &relative_path),
                    disk_revision(&resolved)?,
                );
            }
        }
    }
    let mut input = vec![json!({ "type": "text", "text": text })];
    if let Some(context) = context {
        let context_text = editor_context_input(&context)?;
        input.push(json!({ "type": "text", "text": context_text }));
    }
    let mut links = load_thread_links(&connection.workspace_root)?;
    let should_name = links
        .threads
        .iter()
        .find(|link| link.thread_id == thread_id)
        .is_some_and(|link| link.title == "新しい会話");
    let fallback_title = fallback_thread_title(&text);
    persist_thread_link(
        &connection.workspace_root,
        &thread_id,
        model.clone(),
        reasoning_effort.clone(),
    )?;
    if should_name {
        let _ = connection
            .request(
                "thread/name/set",
                json!({ "threadId": thread_id, "name": fallback_title }),
            )
            .await;
        links = load_thread_links(&connection.workspace_root)?;
        if let Some(link) = links
            .threads
            .iter_mut()
            .find(|link| link.thread_id == thread_id)
        {
            link.title = fallback_title;
        }
        save_thread_links(&connection.workspace_root, &links)?;
    }
    #[cfg(windows)]
    {
        let app_server_pid = connection
            .child
            .lock()
            .await
            .id()
            .ok_or_else(|| AppError::Message("Codex App Server is not running".into()))?;
        *connection.turn_process_baseline.lock().await =
            windows_descendant_process_ids(app_server_pid)?
                .into_iter()
                .collect();
    }
    connection.request("turn/start", json!({
        "threadId": thread_id, "input": input, "cwd": connection.workspace_root,
        "model": model, "effort": reasoning_effort, "approvalPolicy": approval_policy(effective_mode),
        "sandboxPolicy": sandbox_policy(effective_mode, &connection.workspace_root)
    })).await
}

#[tauri::command]
pub async fn codex_turn_interrupt(thread_id: String, turn_id: String) -> AppResult<()> {
    let connection = current_connection().await?;
    require_codex_feature(&connection.compatibility, CodexFeatureId::Chat, "chat")?;
    #[cfg(windows)]
    let (app_server_pid, baseline) = {
        let app_server_pid = connection
            .child
            .lock()
            .await
            .id()
            .ok_or_else(|| AppError::Message("Codex App Server is not running".into()))?;
        let baseline = connection.turn_process_baseline.lock().await.clone();
        (app_server_pid, baseline)
    };
    connection
        .request(
            "turn/interrupt",
            json!({ "threadId": thread_id, "turnId": turn_id }),
        )
        .await?;
    #[cfg(windows)]
    tokio::task::spawn_blocking(move || {
        terminate_windows_turn_processes(app_server_pid, &baseline)
    })
    .await
    .map_err(|error| AppError::Message(format!("Codex interruption cleanup failed: {error}")))??;
    Ok(())
}

#[tauri::command]
pub async fn codex_approval_resolve(
    request_id: Value,
    method: String,
    decision: String,
) -> AppResult<()> {
    if !matches!(
        decision.as_str(),
        "accept" | "acceptForSession" | "decline" | "cancel" | "acceptWithExecPolicyAmendment"
    ) {
        return Err(AppError::Message("Unsupported approval decision".into()));
    }
    let connection = current_connection().await?;
    require_codex_feature(
        &connection.compatibility,
        CodexFeatureId::Approvals,
        "approvals",
    )?;
    let key = approval_key(&request_id)?;
    let mut approvals = connection.approvals.lock().await;
    let expected = approvals
        .get(&key)
        .ok_or_else(|| AppError::Message("Approval request is no longer pending".into()))?;
    if expected.method != method {
        return Err(AppError::Message("Approval method mismatch".into()));
    }
    let amendment = expected.proposed_execpolicy_amendment.clone();
    approvals.remove(&key);
    drop(approvals);
    let wire_decision = if decision == "acceptWithExecPolicyAmendment" {
        let amendment = amendment
            .ok_or_else(|| AppError::Message("No command rule amendment was proposed".into()))?;
        json!({ "acceptWithExecpolicyAmendment": { "execpolicy_amendment": amendment } })
    } else {
        Value::String(decision)
    };
    connection
        .send_json(&json!({ "id": request_id, "result": { "decision": wire_decision } }))
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_codex_versions() {
        assert_eq!(parse_version("codex-cli 0.153.1"), Some((0, 153, 1)));
        assert_eq!(parse_version("codex 1.2"), Some((1, 2, 0)));
    }

    #[test]
    fn parses_model_list() {
        let models = parse_models(
            &json!({ "data": [{ "id": "model-a", "displayName": "Model A", "isDefault": true, "defaultReasoningEffort": "medium", "supportedReasoningEfforts": [{ "reasoningEffort": "low" }, { "reasoningEffort": "medium" }] }] }),
        );
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].supported_reasoning_efforts, vec!["low", "medium"]);
    }

    #[test]
    fn enriches_file_change_approval_from_started_item() {
        let params = json!({
            "threadId": "thread-1",
            "turnId": "turn-1",
            "itemId": "item-1",
            "reason": "入力を更新します"
        });
        let item = json!({
            "type": "fileChange",
            "id": "item-1",
            "status": "inProgress",
            "changes": [{
                "path": "sample.inp",
                "kind": { "type": "update", "move_path": null },
                "diff": "@@ -1 +1 @@\n-old\n+new\n"
            }]
        });
        let payload = approval_payload(
            &json!(7),
            "item/fileChange/requestApproval",
            &params,
            Some(&item),
            Some("diff --git a/sample.inp b/sample.inp"),
            Path::new(r"C:\work"),
        );
        assert_eq!(payload["kind"], "fileChange");
        assert_eq!(payload["changes"][0]["path"], "sample.inp");
        assert_eq!(payload["turnDiff"], "diff --git a/sample.inp b/sample.inp");
        assert_eq!(payload["workspaceRoot"], r"C:\work");
    }

    #[test]
    fn command_approval_prefers_request_fields_and_falls_back_to_item() {
        let params = json!({
            "threadId": "thread-1",
            "turnId": "turn-1",
            "itemId": "item-2",
            "reason": "テストを実行します"
        });
        let item = json!({
            "type": "commandExecution",
            "id": "item-2",
            "command": "pnpm test",
            "cwd": "C:\\work",
            "commandActions": [{ "type": "unknown", "command": "pnpm test" }]
        });
        let payload = approval_payload(
            &json!("request-2"),
            "item/commandExecution/requestApproval",
            &params,
            Some(&item),
            None,
            Path::new(r"C:\work"),
        );
        assert_eq!(payload["kind"], "commandExecution");
        assert_eq!(payload["command"], "pnpm test");
        assert_eq!(payload["cwd"], r"C:\work");
    }

    #[test]
    fn finds_nested_descendant_processes_without_cycles() {
        let processes = [(11, 10), (12, 11), (13, 10), (14, 99), (10, 12)];
        let descendants = descendant_process_ids(10, &processes);
        assert_eq!(descendants.len(), 3);
        assert!(descendants.contains(&11));
        assert!(descendants.contains(&12));
        assert!(descendants.contains(&13));
    }

    #[test]
    fn maps_only_the_three_exposed_approval_modes() {
        assert_eq!(approval_policy(ApprovalMode::ConfirmFirst), "untrusted");
        assert_eq!(approval_policy(ApprovalMode::ConsultationOnly), "untrusted");
        assert_eq!(approval_policy(ApprovalMode::OnRequest), "on-request");
        assert_eq!(
            sandbox_policy(ApprovalMode::ConsultationOnly, Path::new(r"C:\work"))["type"],
            "readOnly"
        );
        assert_eq!(
            sandbox_policy(ApprovalMode::ConfirmFirst, Path::new(r"C:\work"))["networkAccess"],
            false
        );
    }

    #[test]
    fn creates_a_short_fallback_title_from_the_first_message() {
        assert_eq!(
            fallback_thread_title("  球の 半径を半分にしてください  "),
            "球の 半径を半分にしてください"
        );
        assert_eq!(fallback_thread_title("   "), "新しい会話");
        assert!(fallback_thread_title(&"長".repeat(50)).chars().count() <= 36);
    }

    #[test]
    fn editing_instructions_require_app_server_file_change_events() {
        assert!(APP_SERVER_INSTRUCTIONS.contains("built-in file-editing capability"));
        assert!(APP_SERVER_INSTRUCTIONS.contains("App Server emits a fileChange item"));
        assert!(APP_SERVER_INSTRUCTIONS.contains("Do not merely print a unified diff"));
        assert!(APP_SERVER_INSTRUCTIONS.contains("activeDocumentPath"));
    }

    #[test]
    fn editor_context_input_preserves_the_machine_readable_envelope() {
        let context = EditorContextV1 {
            version: 1,
            active_document_path: Some("sample.inp".into()),
            active_input_path: Some("sample.inp".into()),
            cursor: None,
            selection: None,
            dirty: false,
            dirty_buffer: None,
            open_document_paths: vec!["sample.inp".into()],
            diagnostics: vec![],
            phits_version: Some("3.370".into()),
            attached_output_path: None,
            attached_output_content: None,
            content_warning: None,
            document_revisions: vec![],
        };
        let encoded = editor_context_input(&context).unwrap();
        assert!(encoded.starts_with("PHITS_EDITOR_CONTEXT_V1\n{"));
        assert!(encoded.contains("\"activeDocumentPath\":\"sample.inp\""));
    }

    #[test]
    fn rejects_file_change_paths_outside_the_workspace() {
        let directory = tempfile::tempdir().unwrap();
        let params =
            json!({ "item": { "type": "fileChange", "changes": [{ "path": "../outside.inp" }] } });
        assert!(validate_file_changes(directory.path(), "item/started", &params).is_err());
    }

    #[test]
    fn normalizes_absolute_app_server_paths_inside_the_workspace() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("sample.inp");
        std::fs::write(&path, "[ Title ]\n").unwrap();
        let item = json!({
            "type": "fileChange",
            "changes": [{
                "path": path,
                "kind": { "type": "update", "move_path": null },
                "diff": "@@ -1 +1,2 @@\n+TEST\n [ Title ]"
            }]
        });
        let normalized = normalize_file_change_item(directory.path(), &item).unwrap();
        assert_eq!(normalized["changes"][0]["path"], "sample.inp");
        validate_approval_file_paths(directory.path(), &Value::Null, Some(&normalized)).unwrap();
    }

    #[test]
    fn rejects_absolute_app_server_paths_outside_the_workspace() {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let path = outside.path().join("outside.inp");
        std::fs::write(&path, "[ Title ]\n").unwrap();
        let item = json!({
            "type": "fileChange",
            "changes": [{
                "path": path,
                "kind": { "type": "update", "move_path": null },
                "diff": "@@ -1 +1,2 @@\n+TEST\n [ Title ]"
            }]
        });
        assert!(normalize_file_change_item(directory.path(), &item).is_err());
    }

    #[test]
    fn pinned_schema_contains_the_supported_command_decisions() {
        let schema: Value = serde_json::from_str(include_str!(
            "../../schemas/codex/0.153.1/CommandExecutionRequestApprovalResponse.json"
        ))
        .unwrap();
        let text = schema.to_string();
        for decision in [
            "accept",
            "acceptForSession",
            "decline",
            "cancel",
            "acceptWithExecpolicyAmendment",
        ] {
            assert!(text.contains(decision), "schema omitted {decision}");
        }
    }

    #[test]
    fn rejects_network_and_phits_family_commands_before_ui_approval() {
        assert!(
            prohibited_command_reason(&json!({ "command": "phits.exe main.inp" }), None).is_some()
        );
        assert!(
            prohibited_command_reason(&json!({ "command": "bin\\angel.bat plot.out" }), None)
                .is_some()
        );
        assert!(
            prohibited_command_reason(
                &json!({ "networkApprovalContext": { "host": "example.com" } }),
                None
            )
            .is_some()
        );
        assert!(prohibited_command_reason(&json!({ "command": "cargo test" }), None).is_none());
    }

    #[test]
    fn rejects_approval_paths_outside_the_workspace() {
        let directory = tempfile::tempdir().unwrap();
        let item = json!({ "changes": [{ "path": "../escape.inp" }] });
        assert!(validate_approval_file_paths(directory.path(), &Value::Null, Some(&item)).is_err());
    }

    #[test]
    fn disk_revision_hashes_original_bytes() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("encoded.inp");
        std::fs::write(&path, [0x82, 0xa0, 0x0d, 0x0a]).unwrap();
        assert_eq!(
            disk_revision(&path).unwrap().sha256,
            hex::encode(Sha256::digest([0x82, 0xa0, 0x0d, 0x0a]))
        );
    }
}
