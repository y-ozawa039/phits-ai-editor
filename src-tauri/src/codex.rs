use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        Arc, OnceLock,
        atomic::{AtomicU64, Ordering},
    },
};

#[cfg(any(windows, test))]
use std::collections::HashSet;

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
    codex_mcp::McpHost,
    contracts::{
        ApprovalMode, CodexCompatibilityReport, CodexConnectResult, CodexFeatureId,
        CodexFeatureState, CodexModel, CodexSandboxCheck, CodexSandboxCheckId,
        CodexSandboxProbeReport, CodexSandboxProbeState, CodexThreadLink, EditorContextV1,
        PhitsAgentSetupCheck, PhitsAgentSetupState, PhitsAgentSetupStatus,
    },
    diagnostics::{codex_compatibility_probe, resolve_codex_executable, resolve_phits_root},
    error::{AppError, AppResult},
    settings::app_phits_root,
    workspace::{path_to_string, resolve_existing_path, resolve_save_path, validate_relative_path},
};
use uuid::Uuid;

const CODEX_BASELINE: (u32, u32, u32) = (0, 153, 1);
const APP_SERVER_INSTRUCTIONS: &str = r#"You are the editing agent embedded in PHITS AI Editor.

Work only inside the current PHITS workspace. Never launch PHITS, ANGEL, DCHAIN, or PHIG-3D with a shell command, and never use network access. When the user asks to run PHITS, call the run_phits tool supplied by the phits_ai_editor MCP server. That tool can run only the saved input identified by activeInputPath and returns the result to this turn. Do not substitute a direct executable or wrapper command if the tool rejects the request.

The application appends a PHITS_EDITOR_CONTEXT_V1 item to every user turn. Treat that item as application-supplied editor state. Its activeDocumentPath is the currently open file, activeInputPath is the PHITS execution target, activeInputDirty says whether that execution target has unsaved changes, cursor and selection are one-based editor positions, and dirtyBuffer contains the current document's unsaved buffer only when supplied. Resolve phrases such as "the current file", "the open file", and "here" from this context.

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
    mcp_host: McpHost,
    next_id: AtomicU64,
    workspace_root: PathBuf,
    compatibility: CodexCompatibilityReport,
    #[cfg(windows)]
    turn_process_baseline: Mutex<HashSet<u32>>,
}

fn approval_policy(mode: ApprovalMode) -> &'static str {
    match mode {
        ApprovalMode::OnRequest => "on-request",
        ApprovalMode::ConfirmFirst
        | ApprovalMode::ConsultationOnly
        | ApprovalMode::AutonomousWorkspace => "untrusted",
    }
}

fn sandbox_policy(mode: ApprovalMode, workspace_root: &Path) -> Value {
    match mode {
        ApprovalMode::ConsultationOnly => json!({ "type": "readOnly" }),
        ApprovalMode::ConfirmFirst
        | ApprovalMode::OnRequest
        | ApprovalMode::AutonomousWorkspace => json!({
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
                connection.mcp_host.clear_active_turn(thread_id).await;
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
                let approval_mode =
                    if let Some(thread_id) = params.get("threadId").and_then(Value::as_str) {
                        connection.thread_modes.lock().await.get(thread_id).copied()
                    } else {
                        None
                    };
                let consultation_only = approval_mode == Some(ApprovalMode::ConsultationOnly);
                let autonomous_workspace = approval_mode == Some(ApprovalMode::AutonomousWorkspace);
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
                if autonomous_workspace && method == "item/fileChange/requestApproval" {
                    let _ = connection
                        .send_json(&json!({ "id": id, "result": { "decision": "accept" } }))
                        .await;
                    let _ = app.emit(
                        "codex://log",
                        "自律実行（ワークスペース内）モードで、検証済みのファイル変更を許可しました。",
                    );
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

fn codex_home_path_from(
    configured_codex_home: Option<PathBuf>,
    user_home: Option<PathBuf>,
) -> Option<PathBuf> {
    configured_codex_home.or_else(|| user_home.map(|value| value.join(".codex")))
}

fn codex_home_path() -> Option<PathBuf> {
    #[cfg(debug_assertions)]
    if let Some(preview_home) = std::env::var_os("PHITS_AI_EDITOR_TEST_CODEX_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
    {
        return Some(preview_home);
    }
    let configured_codex_home = std::env::var_os("CODEX_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);
    #[cfg(windows)]
    let user_home = std::env::var_os("USERPROFILE").map(PathBuf::from);
    #[cfg(not(windows))]
    let user_home = std::env::var_os("HOME").map(PathBuf::from);
    codex_home_path_from(configured_codex_home, user_home)
}

fn active_agents_file(directory: &Path) -> Option<PathBuf> {
    let override_path = directory.join("AGENTS.override.md");
    if override_path.is_file() {
        match std::fs::read_to_string(&override_path) {
            Ok(content) if !content.trim().is_empty() => return Some(override_path),
            Err(_) => return Some(override_path),
            Ok(_) => {}
        }
    }
    let agents_path = directory.join("AGENTS.md");
    agents_path.is_file().then_some(agents_path)
}

const PHITS_POLICY_RELATIVE_PATH: &str = "workbench/ai/reference_policy.md";

fn normalized_path_text(value: &str) -> String {
    value.replace('\\', "/").to_lowercase()
}

fn paths_refer_to_same_file(left: &Path, right: &Path) -> bool {
    match (dunce::canonicalize(left), dunce::canonicalize(right)) {
        (Ok(left), Ok(right)) => {
            normalized_path_text(&left.to_string_lossy())
                == normalized_path_text(&right.to_string_lossy())
        }
        _ => {
            normalized_path_text(&left.to_string_lossy())
                == normalized_path_text(&right.to_string_lossy())
        }
    }
}

fn absolute_policy_references(content: &str) -> Vec<PathBuf> {
    static WINDOWS_POLICY_PATH: OnceLock<regex::Regex> = OnceLock::new();
    static UNIX_POLICY_PATH: OnceLock<regex::Regex> = OnceLock::new();
    let windows = WINDOWS_POLICY_PATH.get_or_init(|| {
        regex::Regex::new(
            r#"(?i)([a-z]:[\\/][^`\"'<>|\r\n]*?workbench[\\/]ai[\\/]reference_policy\.md)"#,
        )
        .expect("valid Windows PHITS policy regex")
    });
    let unix = UNIX_POLICY_PATH.get_or_init(|| {
        regex::Regex::new(r#"(?i)(/[^`\"'<>|\r\n]*?workbench[\\/]ai[\\/]reference_policy\.md)"#)
            .expect("valid Unix PHITS policy regex")
    });
    windows
        .captures_iter(content)
        .chain(unix.captures_iter(content))
        .filter_map(|capture| capture.get(1))
        .map(|value| PathBuf::from(value.as_str().trim()))
        .collect()
}

fn instruction_reference_state(path: &Path, policy_path: &Path) -> (PhitsAgentSetupState, String) {
    let content = match std::fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) => {
            return (
                PhitsAgentSetupState::Unreadable,
                format!("有効な指示ファイルを読み取れません: {error}"),
            );
        }
    };
    let normalized_content = normalized_path_text(&content);
    let normalized_policy = normalized_path_text(&policy_path.to_string_lossy());
    let variable_references = [
        format!("<phitspath>/{PHITS_POLICY_RELATIVE_PATH}"),
        format!("%phitspath%/{PHITS_POLICY_RELATIVE_PATH}"),
        format!("$phitspath/{PHITS_POLICY_RELATIVE_PATH}"),
        format!("${{phitspath}}/{PHITS_POLICY_RELATIVE_PATH}"),
    ];

    if normalized_content.contains(&normalized_policy)
        || variable_references
            .iter()
            .any(|reference| normalized_content.contains(reference))
        || absolute_policy_references(&content)
            .iter()
            .any(|reference| paths_refer_to_same_file(reference, policy_path))
    {
        return (
            PhitsAgentSetupState::Confirmed,
            "現在のPHITSルートに対応する参照を確認しました。".into(),
        );
    }

    if normalized_content.contains(PHITS_POLICY_RELATIVE_PATH)
        || absolute_policy_references(&content)
            .iter()
            .any(|reference| {
                normalized_path_text(&reference.to_string_lossy())
                    .ends_with(PHITS_POLICY_RELATIVE_PATH)
            })
    {
        return (
            PhitsAgentSetupState::Mismatch,
            "PHITSポリシーへの参照はありますが、現在のPHITSルートと一致しません。".into(),
        );
    }

    (
        PhitsAgentSetupState::Missing,
        "有効な指示ファイルにPHITSポリシーへの参照がありません。".into(),
    )
}

fn setup_check(
    id: &str,
    state: PhitsAgentSetupState,
    path: Option<&Path>,
    message: impl Into<String>,
) -> PhitsAgentSetupCheck {
    PhitsAgentSetupCheck {
        id: id.into(),
        state,
        path: path.map(|value| value.to_string_lossy().into_owned()),
        message: message.into(),
    }
}

fn inspect_agents_directory(
    id: &str,
    directory: Option<&Path>,
    policy_path: &Path,
) -> PhitsAgentSetupCheck {
    let Some(directory) = directory else {
        return setup_check(
            id,
            PhitsAgentSetupState::Missing,
            None,
            "検査対象のディレクトリを特定できません。",
        );
    };
    let Some(path) = active_agents_file(directory) else {
        return setup_check(
            id,
            PhitsAgentSetupState::Missing,
            Some(&directory.join("AGENTS.md")),
            "有効なAGENTS.mdまたはAGENTS.override.mdがありません。",
        );
    };
    let (state, message) = instruction_reference_state(&path, policy_path);
    setup_check(id, state, Some(&path), message)
}

fn inspect_phits_agent_setup_paths(
    phits_root: Option<&Path>,
    workspace_root: &Path,
    codex_home: Option<&Path>,
) -> PhitsAgentSetupStatus {
    let Some(phits_root) = phits_root else {
        return PhitsAgentSetupStatus {
            configured: false,
            state: PhitsAgentSetupState::Missing,
            source_path: None,
            message: "PHITSインストール先を検出できないため、PHITS用Codex設定を確認できません。先に設定の「PHITS実行環境」でインストール先を指定してください。".into(),
            checks: vec![
                setup_check("resource", PhitsAgentSetupState::Missing, None, "PHITSルートを特定できません。"),
                setup_check("phitsRoot", PhitsAgentSetupState::Missing, None, "PHITSルートを特定できません。"),
                inspect_agents_directory("codexGlobal", codex_home, Path::new("reference_policy.md")),
                setup_check("workspace", PhitsAgentSetupState::Missing, Some(&workspace_root.join("AGENTS.md")), "PHITSルートを特定できないため参照を照合できません。"),
                setup_check("rootConsistency", PhitsAgentSetupState::Missing, None, "PHITSルートを特定できません。"),
            ],
        };
    };
    let policy_path = phits_root.join("workbench/AI/reference_policy.md");
    let resource = if policy_path.is_file() {
        setup_check(
            "resource",
            PhitsAgentSetupState::Confirmed,
            Some(&policy_path),
            "PHITS側のAI設定資源を確認しました。",
        )
    } else {
        setup_check(
            "resource",
            PhitsAgentSetupState::Missing,
            Some(&policy_path),
            "PHITS公式のAI参照ポリシーが見つかりません。",
        )
    };
    let phits_root_check = inspect_agents_directory("phitsRoot", Some(phits_root), &policy_path);
    let codex_global_check = inspect_agents_directory("codexGlobal", codex_home, &policy_path);
    let workspace_check = inspect_agents_directory("workspace", Some(workspace_root), &policy_path);
    let workspace_uses_phits_root = paths_refer_to_same_file(workspace_root, phits_root)
        || dunce::canonicalize(workspace_root)
            .ok()
            .zip(dunce::canonicalize(phits_root).ok())
            .is_some_and(|(workspace, phits)| workspace.starts_with(phits));
    let phits_root_is_effective =
        workspace_uses_phits_root && phits_root_check.state == PhitsAgentSetupState::Confirmed;
    let effective_checks = [&codex_global_check, &workspace_check];
    let effective_confirmed = effective_checks
        .iter()
        .any(|check| check.state == PhitsAgentSetupState::Confirmed)
        || phits_root_is_effective;
    let all_instruction_checks = [&phits_root_check, &codex_global_check, &workspace_check];
    let any_confirmed = all_instruction_checks
        .iter()
        .any(|check| check.state == PhitsAgentSetupState::Confirmed);
    let any_mismatch = all_instruction_checks
        .iter()
        .any(|check| check.state == PhitsAgentSetupState::Mismatch);
    let any_unreadable = all_instruction_checks
        .iter()
        .any(|check| check.state == PhitsAgentSetupState::Unreadable);
    let root_consistency = if any_confirmed {
        setup_check(
            "rootConsistency",
            PhitsAgentSetupState::Confirmed,
            Some(phits_root),
            "少なくとも1つの参照先が現在のPHITSルートと一致します。",
        )
    } else if any_mismatch {
        setup_check(
            "rootConsistency",
            PhitsAgentSetupState::Mismatch,
            Some(phits_root),
            "検出した参照先が現在のPHITSルートと一致しません。",
        )
    } else if any_unreadable {
        setup_check(
            "rootConsistency",
            PhitsAgentSetupState::Unreadable,
            Some(phits_root),
            "指示ファイルを読み取れないため参照先を照合できません。",
        )
    } else {
        setup_check(
            "rootConsistency",
            PhitsAgentSetupState::Missing,
            Some(phits_root),
            "照合できるPHITSポリシー参照がありません。",
        )
    };

    let resource_present = resource.state == PhitsAgentSetupState::Confirmed;
    let state = if resource_present && effective_confirmed && !any_mismatch && !any_unreadable {
        PhitsAgentSetupState::Confirmed
    } else if !resource_present {
        PhitsAgentSetupState::Missing
    } else if !effective_confirmed && any_mismatch {
        PhitsAgentSetupState::Mismatch
    } else if !effective_confirmed && any_unreadable {
        PhitsAgentSetupState::Unreadable
    } else {
        PhitsAgentSetupState::Partial
    };
    let message = match state {
        PhitsAgentSetupState::Confirmed => {
            "静的検査で、現在のPHITSルートに対応するCodex指示を確認しました。".into()
        }
        PhitsAgentSetupState::Partial => "PHITS側のAI設定は確認しましたが、Codexが現在のワークスペースで利用する指示までは確認できませんでした。接続と会話は引き続き利用できます。".into(),
        PhitsAgentSetupState::Mismatch => "Codex指示が別のPHITSルートを参照している可能性があります。検査結果のパスを確認してください。接続と会話は引き続き利用できます。".into(),
        PhitsAgentSetupState::Missing => format!("PHITS用Codex設定の一部が見つかりません。PHITS公式の {} にある案内を確認してください。接続と会話は引き続き利用できます。", phits_root.join("workbench/README-jp.docx").display()),
        PhitsAgentSetupState::Unreadable => "Codex指示ファイルの一部を読み取れませんでした。検査結果のパスとアクセス権を確認してください。接続と会話は引き続き利用できます。".into(),
    };
    let source_path = if effective_confirmed {
        effective_checks
            .iter()
            .copied()
            .find(|check| check.state == PhitsAgentSetupState::Confirmed)
            .or_else(|| phits_root_is_effective.then_some(&phits_root_check))
            .and_then(|check| check.path.clone())
    } else {
        None
    };

    PhitsAgentSetupStatus {
        configured: state == PhitsAgentSetupState::Confirmed,
        state,
        source_path,
        message,
        checks: vec![
            resource,
            phits_root_check,
            codex_global_check,
            workspace_check,
            root_consistency,
        ],
    }
}

fn inspect_phits_agent_setup(app: &AppHandle, workspace_root: &Path) -> PhitsAgentSetupStatus {
    let mut messages = Vec::new();
    let configured_root = app_phits_root(app).ok().flatten();
    let phits_root = resolve_phits_root(
        Some(workspace_root),
        configured_root.as_deref(),
        &mut messages,
    )
    .map(|value| value.root);
    inspect_phits_agent_setup_paths(
        phits_root.as_deref(),
        workspace_root,
        codex_home_path().as_deref(),
    )
}

#[tauri::command]
pub fn phits_agent_setup_inspect(
    app: AppHandle,
    workspace_root: String,
) -> AppResult<PhitsAgentSetupStatus> {
    let workspace = canonical_workspace(&workspace_root)?;
    Ok(inspect_phits_agent_setup(&app, &workspace))
}

async fn start_connection(
    app: AppHandle,
    workspace_root: PathBuf,
    compatibility: CodexCompatibilityReport,
) -> AppResult<Arc<CodexConnection>> {
    let executable = verify_codex_version().await?;
    let mcp_host = McpHost::start(app.clone(), workspace_root.clone()).await?;
    let child = Command::new(executable)
        .arg("app-server")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(false)
        .spawn()
        .map_err(|error| AppError::Message(format!("Failed to start Codex App Server: {error}")));
    let mut child = match child {
        Ok(child) => child,
        Err(error) => {
            mcp_host.close().await;
            return Err(error);
        }
    };
    let streams = (child.stdin.take(), child.stdout.take(), child.stderr.take());
    let (stdin, stdout, stderr) = match streams {
        (Some(stdin), Some(stdout), Some(stderr)) => (stdin, stdout, stderr),
        _ => {
            mcp_host.close().await;
            let _ = child.start_kill();
            return Err(AppError::Message(
                "Codex App Serverの入出力ストリームを取得できません。".into(),
            ));
        }
    };
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
        mcp_host,
        next_id: AtomicU64::new(1),
        workspace_root,
        compatibility,
        #[cfg(windows)]
        turn_process_baseline: Mutex::new(HashSet::new()),
    });
    tokio::spawn(reader_loop(connection.clone(), stdout, app.clone()));
    tokio::spawn(stderr_loop(stderr, app));
    if let Err(error) = connection
        .request("initialize", json!({ "clientInfo": { "name": "phits_ai_editor", "title": "PHITS AI Editor", "version": env!("CARGO_PKG_VERSION") } }))
        .await
    {
        let _ = close_connection(&connection).await;
        return Err(error);
    }
    if let Err(error) = connection.notify("initialized", json!({})).await {
        let _ = close_connection(&connection).await;
        return Err(error);
    }
    Ok(connection)
}

async fn close_connection(connection: &Arc<CodexConnection>) -> AppResult<()> {
    connection.mcp_host.close().await;
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

fn short_probe_error(error: impl std::fmt::Display) -> String {
    let message = error.to_string().replace(['\r', '\n'], " ");
    message.chars().take(800).collect()
}

fn sandbox_check(
    id: CodexSandboxCheckId,
    state: CodexSandboxProbeState,
    detail: impl Into<String>,
) -> CodexSandboxCheck {
    CodexSandboxCheck {
        id,
        state,
        detail: detail.into(),
    }
}

fn sandbox_probe_state(checks: &[CodexSandboxCheck]) -> CodexSandboxProbeState {
    if checks.iter().any(|check| {
        matches!(
            check.id,
            CodexSandboxCheckId::AppServer
                | CodexSandboxCheckId::CommandExecution
                | CodexSandboxCheckId::WorkspaceWrite
        ) && check.state == CodexSandboxProbeState::Unavailable
    }) {
        CodexSandboxProbeState::Unavailable
    } else if checks
        .iter()
        .any(|check| check.state != CodexSandboxProbeState::Available)
    {
        CodexSandboxProbeState::Limited
    } else {
        CodexSandboxProbeState::Available
    }
}

fn sandbox_support_prompt(
    workspace_root: &Path,
    checks: &[CodexSandboxCheck],
    readiness: Option<&str>,
    implementation: Option<&str>,
    allowed_implementations: &[String],
) -> String {
    let check_lines = checks
        .iter()
        .map(|check| format!("- {:?}: {:?} — {}", check.id, check.state, check.detail))
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "PHITS AI EditorのCodex編集環境診断で問題が見つかりました。次の診断結果を確認し、原因を特定してください。必要な変更を提案する前に、CodexのSandbox、Codex CLI設定、組織ポリシーのどこで失敗しているかを切り分けてください。Windows標準機能の『Windows Sandbox』が必要だとは決めつけず、Codexが現在使用している方式と実動作検査の結果を優先してください。セキュリティ制限を一括解除せず、PHITSワークスペース内の編集に必要な最小限の修正を提案してください。\n\nワークスペース: {}\nSandbox readiness: {}\n現在のSandbox方式: {}\n組織ポリシーで許可された方式: {}\n診断結果:\n{}",
        workspace_root.display(),
        readiness.unwrap_or("取得できませんでした"),
        implementation.unwrap_or("取得できませんでした"),
        if allowed_implementations.is_empty() {
            "指定なし".to_string()
        } else {
            allowed_implementations.join(", ")
        },
        check_lines
    )
}

#[cfg(windows)]
fn workspace_write_probe_command(marker_path: &Path, marker: &str) -> Vec<String> {
    let marker_path = path_to_string(marker_path).replace('\'', "''");
    let marker = marker.replace('\'', "''");
    vec![
        "powershell.exe".to_string(),
        "-NoLogo".to_string(),
        "-NoProfile".to_string(),
        "-NonInteractive".to_string(),
        "-Command".to_string(),
        format!(
            "[System.IO.File]::WriteAllText('{marker_path}', '{marker}', [System.Text.UTF8Encoding]::new($false))"
        ),
    ]
}

fn workspace_write_probe_policies(workspace: &Path) -> [Value; 2] {
    [
        json!({
            "type": "workspaceWrite",
            "writableRoots": [workspace],
            "networkAccess": false
        }),
        json!({
            "type": "workspaceWrite",
            "networkAccess": false
        }),
    ]
}

#[cfg(not(windows))]
fn workspace_write_probe_command(marker_path: &Path, marker: &str) -> Vec<String> {
    vec![
        "/bin/sh".to_string(),
        "-c".to_string(),
        "printf %s \"$1\" > \"$2\"".to_string(),
        "phits-editor-probe".to_string(),
        marker.to_string(),
        path_to_string(marker_path),
    ]
}

fn unavailable_sandbox_report(workspace_root: &Path, detail: String) -> CodexSandboxProbeReport {
    let checks = vec![
        sandbox_check(
            CodexSandboxCheckId::AppServer,
            CodexSandboxProbeState::Unavailable,
            detail.clone(),
        ),
        sandbox_check(
            CodexSandboxCheckId::WindowsSandbox,
            CodexSandboxProbeState::Unavailable,
            "App Serverへ接続できないため検査できませんでした。",
        ),
        sandbox_check(
            CodexSandboxCheckId::CommandExecution,
            CodexSandboxProbeState::Unavailable,
            "App Serverへ接続できないため検査できませんでした。",
        ),
        sandbox_check(
            CodexSandboxCheckId::WorkspaceWrite,
            CodexSandboxProbeState::Unavailable,
            "App Serverへ接続できないため検査できませんでした。",
        ),
    ];
    CodexSandboxProbeReport {
        state: CodexSandboxProbeState::Unavailable,
        workspace_root: path_to_string(workspace_root),
        checked_at: Utc::now().to_rfc3339(),
        readiness: None,
        implementation: None,
        allowed_implementations: Vec::new(),
        messages: vec![detail],
        support_prompt: sandbox_support_prompt(workspace_root, &checks, None, None, &[]),
        checks,
    }
}

#[tauri::command]
pub async fn codex_sandbox_probe(
    app: AppHandle,
    workspace_root: String,
) -> AppResult<CodexSandboxProbeReport> {
    let workspace = canonical_workspace(&workspace_root)?;
    let compatibility = match codex_compatibility_probe(false).await {
        Ok(report) => report,
        Err(error) => {
            return Ok(unavailable_sandbox_report(
                &workspace,
                short_probe_error(error),
            ));
        }
    };

    let existing = connection_slot().lock().await.clone();
    let (connection, temporary) = match existing {
        Some(connection) if connection.workspace_root == workspace => (connection, false),
        _ => match start_connection(app, workspace.clone(), compatibility).await {
            Ok(connection) => (connection, true),
            Err(error) => {
                return Ok(unavailable_sandbox_report(
                    &workspace,
                    short_probe_error(error),
                ));
            }
        },
    };

    let mut checks = vec![sandbox_check(
        CodexSandboxCheckId::AppServer,
        CodexSandboxProbeState::Available,
        "Codex App Serverへ接続できました。",
    )];
    let mut messages = Vec::new();

    let readiness_result = connection
        .request("windowsSandbox/readiness", json!({}))
        .await;
    let readiness = readiness_result
        .as_ref()
        .ok()
        .and_then(|value| value.get("status"))
        .and_then(Value::as_str)
        .map(str::to_string);
    match readiness.as_deref() {
        Some("ready") => checks.push(sandbox_check(
            CodexSandboxCheckId::WindowsSandbox,
            CodexSandboxProbeState::Available,
            "CodexのSandboxは準備済みです。",
        )),
        Some("notConfigured") => checks.push(sandbox_check(
            CodexSandboxCheckId::WindowsSandbox,
            CodexSandboxProbeState::Unavailable,
            "CodexのSandboxが未設定です。Codex CLIのSandbox設定を確認してください。",
        )),
        Some("updateRequired") => checks.push(sandbox_check(
            CodexSandboxCheckId::WindowsSandbox,
            CodexSandboxProbeState::Unavailable,
            "CodexのSandbox設定の更新が必要です。",
        )),
        Some(other) => checks.push(sandbox_check(
            CodexSandboxCheckId::WindowsSandbox,
            CodexSandboxProbeState::Limited,
            format!("未知の準備状態が返されました: {other}"),
        )),
        None => {
            let detail = match readiness_result {
                Ok(_) => "CodexのSandbox準備状態を解釈できませんでした。".to_string(),
                Err(error) => format!(
                    "CodexのSandbox準備状態を取得できませんでした: {}",
                    short_probe_error(error)
                ),
            };
            checks.push(sandbox_check(
                CodexSandboxCheckId::WindowsSandbox,
                CodexSandboxProbeState::Limited,
                detail,
            ));
        }
    }

    let allowed_implementations = connection
        .request("configRequirements/read", json!({}))
        .await
        .ok()
        .and_then(|value| {
            value
                .pointer("/requirements/allowedWindowsSandboxImplementations")
                .and_then(Value::as_array)
                .cloned()
        })
        .unwrap_or_default()
        .into_iter()
        .filter_map(|value| value.as_str().map(str::to_string))
        .collect::<Vec<_>>();

    let implementation = connection
        .request(
            "config/read",
            json!({ "cwd": workspace, "includeLayers": false }),
        )
        .await
        .ok()
        .and_then(|value| {
            value
                .pointer("/config/windows/sandbox")
                .and_then(Value::as_str)
                .map(str::to_string)
        });

    match tempfile::Builder::new()
        .prefix(".phits-editor-codex-probe-")
        .tempdir_in(&workspace)
    {
        Ok(directory) => {
            let marker = format!("PHITS_AI_EDITOR_SANDBOX_PROBE:{}", Uuid::new_v4());
            let marker_path = directory.path().join("workspace-write.txt");
            let mut attempt_errors = Vec::new();
            let mut command_executed = false;
            let mut workspace_write_confirmed = false;
            for (index, sandbox_policy) in workspace_write_probe_policies(&workspace)
                .into_iter()
                .enumerate()
            {
                let _ = std::fs::remove_file(&marker_path);
                match connection
                    .request(
                        "command/exec",
                        json!({
                            "command": workspace_write_probe_command(&marker_path, &marker),
                            "cwd": workspace,
                            "sandboxPolicy": sandbox_policy,
                            "timeoutMs": 10_000
                        }),
                    )
                    .await
                {
                    Ok(result) => {
                        let exit_code = result.get("exitCode").and_then(Value::as_i64);
                        if exit_code != Some(0) {
                            let stderr = result
                                .get("stderr")
                                .and_then(Value::as_str)
                                .unwrap_or_default();
                            attempt_errors.push(format!(
                                "方式{}は終了コード {:?}: {}",
                                index + 1,
                                exit_code,
                                short_probe_error(stderr)
                            ));
                            continue;
                        }
                        command_executed = true;
                        match std::fs::read_to_string(&marker_path) {
                            Ok(content) if content == marker => {
                                workspace_write_confirmed = true;
                                break;
                            }
                            Ok(_) => attempt_errors
                                .push(format!("方式{}は検査内容が一致しませんでした。", index + 1)),
                            Err(error) => attempt_errors.push(format!(
                                "方式{}は検査ファイルを確認できませんでした: {}",
                                index + 1,
                                short_probe_error(error)
                            )),
                        }
                    }
                    Err(error) => attempt_errors.push(format!(
                        "方式{}を開始できませんでした: {}",
                        index + 1,
                        short_probe_error(error)
                    )),
                }
            }

            let attempt_detail = attempt_errors.join(" / ");
            checks.push(sandbox_check(
                CodexSandboxCheckId::CommandExecution,
                if command_executed {
                    CodexSandboxProbeState::Available
                } else {
                    CodexSandboxProbeState::Unavailable
                },
                if command_executed {
                    "Sandbox内で検査コマンドを実行できました。".to_string()
                } else {
                    format!("Sandbox内で検査コマンドを実行できませんでした: {attempt_detail}")
                },
            ));
            checks.push(sandbox_check(
                CodexSandboxCheckId::WorkspaceWrite,
                if workspace_write_confirmed {
                    CodexSandboxProbeState::Available
                } else {
                    CodexSandboxProbeState::Unavailable
                },
                if workspace_write_confirmed {
                    "ワークスペース内で検査ファイルを作成し、内容を確認できました。".to_string()
                } else {
                    format!("ワークスペースへの書込みを確認できませんでした: {attempt_detail}")
                },
            ));
        }
        Err(error) => {
            let detail = short_probe_error(error);
            checks.push(sandbox_check(
                CodexSandboxCheckId::CommandExecution,
                CodexSandboxProbeState::Limited,
                "検査用フォルダーを作成できないため、コマンド検査を省略しました。",
            ));
            checks.push(sandbox_check(
                CodexSandboxCheckId::WorkspaceWrite,
                CodexSandboxProbeState::Unavailable,
                format!("ワークスペースに検査用フォルダーを作成できませんでした: {detail}"),
            ));
        }
    }

    if temporary && let Err(error) = close_connection(&connection).await {
        messages.push(format!(
            "診断用Codex App Serverの終了時に問題が発生しました: {}",
            short_probe_error(error)
        ));
    }

    let state = sandbox_probe_state(&checks);
    let support_prompt = sandbox_support_prompt(
        &workspace,
        &checks,
        readiness.as_deref(),
        implementation.as_deref(),
        &allowed_implementations,
    );
    Ok(CodexSandboxProbeReport {
        state,
        workspace_root: path_to_string(&workspace),
        checked_at: Utc::now().to_rfc3339(),
        readiness,
        implementation,
        allowed_implementations,
        checks,
        messages,
        support_prompt,
    })
}

#[tauri::command]
pub async fn codex_connect(
    app: AppHandle,
    workspace_root: String,
) -> AppResult<CodexConnectResult> {
    let workspace = canonical_workspace(&workspace_root)?;
    let phits_agent_setup = inspect_phits_agent_setup(&app, &workspace);
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
        phits_agent_setup,
    })
}

pub async fn disconnect_internal() -> AppResult<()> {
    let connection = connection_slot().lock().await.take();
    let Some(connection) = connection else {
        return Ok(());
    };
    close_connection(&connection).await
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
        "cwd": connection.workspace_root, "model": model, "approvalPolicy": "untrusted", "sandbox": "workspace-write", "developerInstructions": APP_SERVER_INSTRUCTIONS,
        "config": connection.mcp_host.thread_config()?
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
        "threadId": thread_id, "cwd": connection.workspace_root, "approvalPolicy": "untrusted", "sandbox": "workspace-write", "developerInstructions": APP_SERVER_INSTRUCTIONS,
        "config": connection.mcp_host.thread_config()?
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
    if let Some(context) = context.as_ref() {
        let context_text = editor_context_input(context)?;
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
    connection
        .mcp_host
        .set_active_turn(thread_id.clone(), effective_mode, context.as_ref())
        .await;
    let result = connection.request("turn/start", json!({
        "threadId": thread_id.clone(), "input": input, "cwd": connection.workspace_root,
        "model": model, "effort": reasoning_effort, "approvalPolicy": approval_policy(effective_mode),
        "sandboxPolicy": sandbox_policy(effective_mode, &connection.workspace_root)
    })).await;
    if result.is_err() {
        connection.mcp_host.clear_active_turn(&thread_id).await;
    }
    result
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
    connection.mcp_host.clear_active_turn(&thread_id).await;
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
    if method == "phits/run/requestApproval" {
        if connection
            .mcp_host
            .resolve_approval(&request_id, &decision)
            .await?
        {
            return Ok(());
        }
        return Err(AppError::Message(
            "PHITS実行の承認要求はすでに終了しています。".into(),
        ));
    }
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

    #[cfg(windows)]
    #[test]
    fn windows_workspace_probe_embeds_escaped_arguments_in_the_command() {
        let command = workspace_write_probe_command(
            Path::new("C:\\Users\\O'Neil\\workspace write.txt"),
            "probe'value",
        );
        assert_eq!(command.len(), 6);
        assert!(!command[5].contains("$args"));
        assert!(command[5].contains("O''Neil"));
        assert!(command[5].contains("probe''value"));
    }

    #[test]
    fn workspace_probe_retries_without_explicit_roots_but_never_without_a_sandbox() {
        let policies = workspace_write_probe_policies(Path::new("D:\\workspace"));
        assert_eq!(policies[0]["type"], "workspaceWrite");
        assert_eq!(policies[0]["writableRoots"][0], "D:\\workspace");
        assert_eq!(policies[0]["networkAccess"], false);
        assert_eq!(policies[1]["type"], "workspaceWrite");
        assert!(policies[1].get("writableRoots").is_none());
        assert_eq!(policies[1]["networkAccess"], false);
        assert!(
            policies
                .iter()
                .all(|policy| policy["type"] != "dangerFullAccess")
        );
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
    fn sandbox_probe_requires_command_and_workspace_write() {
        let checks = vec![
            sandbox_check(
                CodexSandboxCheckId::AppServer,
                CodexSandboxProbeState::Available,
                "ok",
            ),
            sandbox_check(
                CodexSandboxCheckId::WindowsSandbox,
                CodexSandboxProbeState::Limited,
                "unknown",
            ),
            sandbox_check(
                CodexSandboxCheckId::CommandExecution,
                CodexSandboxProbeState::Available,
                "ok",
            ),
            sandbox_check(
                CodexSandboxCheckId::WorkspaceWrite,
                CodexSandboxProbeState::Unavailable,
                "failed",
            ),
        ];
        assert_eq!(
            sandbox_probe_state(&checks),
            CodexSandboxProbeState::Unavailable
        );
    }

    #[test]
    fn sandbox_probe_keeps_readiness_uncertainty_as_limited() {
        let checks = vec![
            sandbox_check(
                CodexSandboxCheckId::AppServer,
                CodexSandboxProbeState::Available,
                "ok",
            ),
            sandbox_check(
                CodexSandboxCheckId::WindowsSandbox,
                CodexSandboxProbeState::Limited,
                "unknown",
            ),
            sandbox_check(
                CodexSandboxCheckId::CommandExecution,
                CodexSandboxProbeState::Available,
                "ok",
            ),
            sandbox_check(
                CodexSandboxCheckId::WorkspaceWrite,
                CodexSandboxProbeState::Available,
                "ok",
            ),
        ];
        assert_eq!(
            sandbox_probe_state(&checks),
            CodexSandboxProbeState::Limited
        );
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
    fn maps_all_exposed_approval_modes_without_disabling_the_sandbox() {
        assert_eq!(approval_policy(ApprovalMode::ConfirmFirst), "untrusted");
        assert_eq!(approval_policy(ApprovalMode::ConsultationOnly), "untrusted");
        assert_eq!(approval_policy(ApprovalMode::OnRequest), "on-request");
        assert_eq!(
            approval_policy(ApprovalMode::AutonomousWorkspace),
            "untrusted"
        );
        assert_eq!(
            sandbox_policy(ApprovalMode::ConsultationOnly, Path::new(r"C:\work"))["type"],
            "readOnly"
        );
        assert_eq!(
            sandbox_policy(ApprovalMode::ConfirmFirst, Path::new(r"C:\work"))["networkAccess"],
            false
        );
        assert_eq!(
            sandbox_policy(ApprovalMode::AutonomousWorkspace, Path::new(r"C:\work"))["type"],
            "workspaceWrite"
        );
        assert_eq!(
            sandbox_policy(ApprovalMode::AutonomousWorkspace, Path::new(r"C:\work"))["networkAccess"],
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
        assert!(APP_SERVER_INSTRUCTIONS.contains("activeInputDirty"));
        assert!(APP_SERVER_INSTRUCTIONS.contains("run_phits tool"));
        assert!(APP_SERVER_INSTRUCTIONS.contains("Never launch PHITS"));
    }

    #[test]
    fn detects_the_global_phits_codex_pointer() {
        let directory = tempfile::tempdir().unwrap();
        let phits_root = directory.path().join("phits");
        let workspace = directory.path().join("external-workspace");
        let codex_home = directory.path().join("codex-home");
        let policy = phits_root.join("workbench/AI/reference_policy.md");
        std::fs::create_dir_all(policy.parent().unwrap()).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::create_dir_all(&codex_home).unwrap();
        std::fs::write(&policy, "policy").unwrap();
        std::fs::write(
            codex_home.join("AGENTS.md"),
            format!("Before PHITS work read `{}`.", policy.display()),
        )
        .unwrap();

        let status =
            inspect_phits_agent_setup_paths(Some(&phits_root), &workspace, Some(&codex_home));
        assert!(status.configured);
        assert!(status.source_path.unwrap().ends_with("AGENTS.md"));
    }

    #[test]
    fn custom_codex_home_precedes_the_default_user_dot_codex_directory() {
        let configured = PathBuf::from("custom-codex-home");
        let user_home = PathBuf::from("user-home");
        assert_eq!(
            codex_home_path_from(Some(configured.clone()), Some(user_home.clone())),
            Some(configured)
        );
        assert_eq!(
            codex_home_path_from(None, Some(user_home.clone())),
            Some(user_home.join(".codex"))
        );
    }

    #[test]
    fn a_nonempty_global_override_must_contain_the_phits_pointer() {
        let directory = tempfile::tempdir().unwrap();
        let phits_root = directory.path().join("phits");
        let workspace = directory.path().join("external-workspace");
        let codex_home = directory.path().join("codex-home");
        let policy = phits_root.join("workbench/AI/reference_policy.md");
        std::fs::create_dir_all(policy.parent().unwrap()).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::create_dir_all(&codex_home).unwrap();
        std::fs::write(&policy, "policy").unwrap();
        std::fs::write(
            codex_home.join("AGENTS.md"),
            format!("Read `{}`.", policy.display()),
        )
        .unwrap();
        std::fs::write(codex_home.join("AGENTS.override.md"), "other instructions").unwrap();

        let status =
            inspect_phits_agent_setup_paths(Some(&phits_root), &workspace, Some(&codex_home));
        assert!(!status.configured);
    }

    #[test]
    fn detects_a_phits_pointer_in_the_workspace_ancestor_chain() {
        let directory = tempfile::tempdir().unwrap();
        let phits_root = directory.path().join("phits");
        let workspace = phits_root.join("user/project");
        let policy = phits_root.join("workbench/AI/reference_policy.md");
        std::fs::create_dir_all(policy.parent().unwrap()).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::write(&policy, "policy").unwrap();
        std::fs::write(
            phits_root.join("AGENTS.md"),
            format!("Read `{}`.", policy.display()),
        )
        .unwrap();

        let status = inspect_phits_agent_setup_paths(Some(&phits_root), &workspace, None);
        assert!(status.configured);
    }

    #[test]
    fn accepts_official_phitspath_placeholders_and_separator_variants() {
        let directory = tempfile::tempdir().unwrap();
        let phits_root = directory.path().join("arbitrary-phits-location");
        let workspace = phits_root.join("user/project");
        let policy = phits_root.join("workbench/AI/reference_policy.md");
        std::fs::create_dir_all(policy.parent().unwrap()).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::write(&policy, "policy").unwrap();

        for reference in [
            "<PHITSPATH>/workbench/AI/reference_policy.md",
            "%PHITSPATH%\\workbench\\AI\\reference_policy.md",
            "$PHITSPATH/workbench/AI/reference_policy.md",
            "${PHITSPATH}\\WORKBENCH/ai\\REFERENCE_POLICY.MD",
        ] {
            std::fs::write(
                phits_root.join("AGENTS.md"),
                format!("Before PHITS work, read `{reference}`."),
            )
            .unwrap();
            let status = inspect_phits_agent_setup_paths(Some(&phits_root), &workspace, None);
            assert_eq!(status.state, PhitsAgentSetupState::Confirmed, "{reference}");
        }
    }

    #[test]
    fn canonicalizes_an_existing_absolute_policy_reference() {
        let directory = tempfile::tempdir().unwrap();
        let phits_root = directory.path().join("phits");
        let workspace = directory.path().join("workspace");
        let codex_home = directory.path().join("custom-codex-home");
        let policy = phits_root.join("workbench/AI/reference_policy.md");
        std::fs::create_dir_all(policy.parent().unwrap()).unwrap();
        std::fs::create_dir_all(phits_root.join("alias")).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::create_dir_all(&codex_home).unwrap();
        std::fs::write(&policy, "policy").unwrap();
        let aliased_policy = phits_root.join("alias/../workbench/AI/reference_policy.md");
        std::fs::write(
            codex_home.join("AGENTS.md"),
            format!("Read `{}`.", aliased_policy.display()),
        )
        .unwrap();

        let status =
            inspect_phits_agent_setup_paths(Some(&phits_root), &workspace, Some(&codex_home));
        assert_eq!(status.state, PhitsAgentSetupState::Confirmed);
    }

    #[test]
    fn reports_a_reference_to_another_phits_root_as_mismatch() {
        let directory = tempfile::tempdir().unwrap();
        let phits_root = directory.path().join("phits-current");
        let old_phits_root = directory.path().join("phits-old");
        let workspace = directory.path().join("workspace");
        let codex_home = directory.path().join("codex-home");
        let policy = phits_root.join("workbench/AI/reference_policy.md");
        let old_policy = old_phits_root.join("workbench/AI/reference_policy.md");
        std::fs::create_dir_all(policy.parent().unwrap()).unwrap();
        std::fs::create_dir_all(old_policy.parent().unwrap()).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::create_dir_all(&codex_home).unwrap();
        std::fs::write(&policy, "current policy").unwrap();
        std::fs::write(&old_policy, "old policy").unwrap();
        std::fs::write(
            codex_home.join("AGENTS.md"),
            format!("Read `{}`.", old_policy.display()),
        )
        .unwrap();

        let status =
            inspect_phits_agent_setup_paths(Some(&phits_root), &workspace, Some(&codex_home));
        assert_eq!(status.state, PhitsAgentSetupState::Mismatch);
        assert!(!status.configured);
        assert_eq!(
            status
                .checks
                .iter()
                .find(|check| check.id == "rootConsistency")
                .unwrap()
                .state,
            PhitsAgentSetupState::Mismatch
        );
    }

    #[test]
    fn reports_root_only_setup_as_partial_for_an_external_workspace() {
        let directory = tempfile::tempdir().unwrap();
        let phits_root = directory.path().join("phits");
        let workspace = directory.path().join("external-workspace");
        let policy = phits_root.join("workbench/AI/reference_policy.md");
        std::fs::create_dir_all(policy.parent().unwrap()).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::write(&policy, "policy").unwrap();
        std::fs::write(
            phits_root.join("AGENTS.md"),
            "Read <PHITSPATH>/workbench/AI/reference_policy.md.",
        )
        .unwrap();

        let status = inspect_phits_agent_setup_paths(Some(&phits_root), &workspace, None);
        assert_eq!(status.state, PhitsAgentSetupState::Partial);
        assert!(!status.configured);
    }

    #[test]
    fn a_nonempty_workspace_override_takes_precedence_over_agents_md() {
        let directory = tempfile::tempdir().unwrap();
        let phits_root = directory.path().join("phits");
        let workspace = directory.path().join("workspace");
        let policy = phits_root.join("workbench/AI/reference_policy.md");
        std::fs::create_dir_all(policy.parent().unwrap()).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::write(&policy, "policy").unwrap();
        std::fs::write(
            workspace.join("AGENTS.md"),
            "Read <PHITSPATH>/workbench/AI/reference_policy.md.",
        )
        .unwrap();
        std::fs::write(workspace.join("AGENTS.override.md"), "other instructions").unwrap();

        let status = inspect_phits_agent_setup_paths(Some(&phits_root), &workspace, None);
        assert_eq!(status.state, PhitsAgentSetupState::Partial);
        assert_eq!(
            status
                .checks
                .iter()
                .find(|check| check.id == "workspace")
                .unwrap()
                .path
                .as_deref()
                .map(Path::new)
                .and_then(Path::file_name)
                .and_then(|name| name.to_str()),
            Some("AGENTS.override.md")
        );
    }

    #[test]
    fn an_empty_override_falls_back_to_agents_md() {
        let directory = tempfile::tempdir().unwrap();
        let phits_root = directory.path().join("phits");
        let workspace = directory.path().join("workspace");
        let policy = phits_root.join("workbench/AI/reference_policy.md");
        std::fs::create_dir_all(policy.parent().unwrap()).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::write(&policy, "policy").unwrap();
        std::fs::write(
            workspace.join("AGENTS.md"),
            "Read <PHITSPATH>/workbench/AI/reference_policy.md.",
        )
        .unwrap();
        std::fs::write(workspace.join("AGENTS.override.md"), "  \r\n").unwrap();

        let status = inspect_phits_agent_setup_paths(Some(&phits_root), &workspace, None);
        assert_eq!(status.state, PhitsAgentSetupState::Confirmed);
        assert!(status.source_path.unwrap().ends_with("AGENTS.md"));
    }

    #[test]
    fn reports_missing_resources_and_instruction_directories() {
        let directory = tempfile::tempdir().unwrap();
        let phits_root = directory.path().join("phits-without-ai-resources");
        let workspace = directory.path().join("workspace");
        std::fs::create_dir_all(&phits_root).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();

        let status = inspect_phits_agent_setup_paths(
            Some(&phits_root),
            &workspace,
            Some(&directory.path().join("missing-codex-home")),
        );
        assert_eq!(status.state, PhitsAgentSetupState::Missing);
        assert_eq!(status.checks.len(), 5);
        assert!(status.checks.iter().all(|check| check.path.is_some()));
    }

    #[test]
    fn reports_unreadable_active_agents_file_without_blocking_connection() {
        let directory = tempfile::tempdir().unwrap();
        let phits_root = directory.path().join("phits");
        let workspace = directory.path().join("workspace");
        let codex_home = directory.path().join("codex-home");
        let policy = phits_root.join("workbench/AI/reference_policy.md");
        std::fs::create_dir_all(policy.parent().unwrap()).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::create_dir_all(&codex_home).unwrap();
        std::fs::write(&policy, "policy").unwrap();
        std::fs::write(codex_home.join("AGENTS.md"), [0xff, 0xfe, 0xfd]).unwrap();

        let status =
            inspect_phits_agent_setup_paths(Some(&phits_root), &workspace, Some(&codex_home));
        assert_eq!(status.state, PhitsAgentSetupState::Unreadable);
        assert!(status.message.contains("接続と会話は引き続き利用できます"));
    }

    #[test]
    fn editor_context_input_preserves_the_machine_readable_envelope() {
        let context = EditorContextV1 {
            version: 1,
            active_document_path: Some("sample.inp".into()),
            active_input_path: Some("sample.inp".into()),
            active_input_dirty: false,
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
