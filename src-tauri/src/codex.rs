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
use tauri::{AppHandle, Emitter};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{Mutex, oneshot},
    time::{Duration, timeout},
};

use crate::{
    contracts::{CodexConnectResult, CodexModel, CodexThreadLink},
    diagnostics::resolve_codex_executable,
    error::{AppError, AppResult},
};

const CODEX_BASELINE: (u32, u32, u32) = (0, 153, 1);
const APP_SERVER_INSTRUCTIONS: &str = "Work only inside the current PHITS workspace. Do not run PHITS, ANGEL, DCHAIN, or PHIG-3D. Propose file changes for user review and request approval before commands or network access.";
type PendingResponse = oneshot::Sender<Result<Value, String>>;

struct CodexConnection {
    stdin: Mutex<Option<ChildStdin>>,
    child: Mutex<Child>,
    pending: Mutex<HashMap<u64, PendingResponse>>,
    approvals: Mutex<HashMap<String, String>>,
    next_id: AtomicU64,
    workspace_root: PathBuf,
    #[cfg(windows)]
    turn_process_baseline: Mutex<HashSet<u32>>,
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
                if let Ok(key) = approval_key(id) {
                    connection
                        .approvals
                        .lock()
                        .await
                        .insert(key, method.to_string());
                }
                let _ = app.emit("codex://approval", json!({ "requestId": id, "method": method, "params": message.get("params").cloned().unwrap_or(Value::Null) }));
            } else {
                let _ = connection.send_json(&json!({ "id": id, "error": { "code": -32601, "message": "This client does not support the requested interaction" } })).await;
            }
            continue;
        }
        if let Some(method) = message.get("method").and_then(Value::as_str) {
            let _ = app.emit("codex://event", json!({ "method": method, "params": message.get("params").cloned().unwrap_or(Value::Null) }));
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
        next_id: AtomicU64::new(1),
        workspace_root,
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
    let connection = if let Some(connection) = connection_slot().lock().await.clone() {
        ensure_workspace(&connection, &workspace_root).await?;
        connection
    } else {
        let connection = start_connection(app, workspace).await?;
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
    std::fs::rename(temporary, path)?;
    Ok(())
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
pub async fn codex_turn_start(
    thread_id: String,
    text: String,
    model: Option<String>,
    reasoning_effort: Option<String>,
) -> AppResult<Value> {
    if text.trim().is_empty() {
        return Err(AppError::Message("Message is empty".into()));
    }
    let connection = current_connection().await?;
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
        "threadId": thread_id, "input": [{ "type": "text", "text": text }], "cwd": connection.workspace_root,
        "model": model, "effort": reasoning_effort, "approvalPolicy": "untrusted",
        "sandboxPolicy": { "type": "workspaceWrite", "writableRoots": [connection.workspace_root], "networkAccess": false }
    })).await
}

#[tauri::command]
pub async fn codex_turn_interrupt(thread_id: String, turn_id: String) -> AppResult<()> {
    let connection = current_connection().await?;
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
    if !matches!(decision.as_str(), "accept" | "decline") {
        return Err(AppError::Message("Unsupported approval decision".into()));
    }
    let connection = current_connection().await?;
    let key = approval_key(&request_id)?;
    let expected = connection
        .approvals
        .lock()
        .await
        .remove(&key)
        .ok_or_else(|| AppError::Message("Approval request is no longer pending".into()))?;
    if expected != method {
        return Err(AppError::Message("Approval method mismatch".into()));
    }
    connection
        .send_json(&json!({ "id": request_id, "result": { "decision": decision } }))
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
    fn finds_nested_descendant_processes_without_cycles() {
        let processes = [(11, 10), (12, 11), (13, 10), (14, 99), (10, 12)];
        let descendants = descendant_process_ids(10, &processes);
        assert_eq!(descendants.len(), 3);
        assert!(descendants.contains(&11));
        assert!(descendants.contains(&12));
        assert!(descendants.contains(&13));
    }
}
