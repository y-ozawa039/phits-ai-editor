use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::{TcpListener, TcpStream},
    sync::{Mutex, oneshot},
    task::JoinHandle,
};
use uuid::Uuid;

use crate::{
    contracts::{ApprovalMode, EditorContextV1},
    error::{AppError, AppResult},
    runner,
    workspace::{path_to_string, relative_paths_equal},
};

const MCP_ARGUMENT: &str = "--phits-ai-editor-mcp";
const MCP_SERVER_NAME: &str = "phits_ai_editor";
const MCP_TOOL_NAME: &str = "run_phits";

#[derive(Debug, Clone)]
struct ActiveTurn {
    thread_id: String,
    mode: ApprovalMode,
    active_input_path: Option<String>,
    active_input_dirty: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RunDecision {
    Accept,
    AcceptForSession,
    Decline,
}

struct McpHostInner {
    endpoint: String,
    token: String,
    workspace_root: PathBuf,
    active: AtomicBool,
    active_turn: Mutex<Option<ActiveTurn>>,
    session_grants: Mutex<HashSet<String>>,
    pending: Mutex<HashMap<String, oneshot::Sender<RunDecision>>>,
    listener_task: Mutex<Option<JoinHandle<()>>>,
}

#[derive(Clone)]
pub(crate) struct McpHost {
    inner: Arc<McpHostInner>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeRequest {
    token: String,
    arguments: Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeResponse {
    success: bool,
    text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunPhitsArguments {
    input_relative_path: String,
    #[serde(default)]
    reason: Option<String>,
}

fn run_needs_confirmation(mode: ApprovalMode, session_granted: bool) -> bool {
    match mode {
        ApprovalMode::AutonomousWorkspace => false,
        ApprovalMode::OnRequest => !session_granted,
        ApprovalMode::ConfirmFirst | ApprovalMode::ConsultationOnly => true,
    }
}

fn approval_scope_key(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    if cfg!(windows) {
        normalized.to_ascii_lowercase()
    } else {
        normalized
    }
}

impl McpHost {
    pub(crate) async fn start(app: AppHandle, workspace_root: PathBuf) -> AppResult<Self> {
        let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|error| {
            AppError::Message(format!("PHITS連携用ローカル接続を開始できません: {error}"))
        })?;
        let endpoint = listener
            .local_addr()
            .map_err(|error| {
                AppError::Message(format!(
                    "PHITS連携用ローカル接続先を取得できません: {error}"
                ))
            })?
            .to_string();
        let host = Self {
            inner: Arc::new(McpHostInner {
                endpoint,
                token: Uuid::new_v4().to_string(),
                workspace_root,
                active: AtomicBool::new(true),
                active_turn: Mutex::new(None),
                session_grants: Mutex::new(HashSet::new()),
                pending: Mutex::new(HashMap::new()),
                listener_task: Mutex::new(None),
            }),
        };
        let task_host = host.clone();
        let task = tokio::spawn(async move {
            while task_host.inner.active.load(Ordering::Acquire) {
                let Ok((stream, _)) = listener.accept().await else {
                    break;
                };
                let request_host = task_host.clone();
                let request_app = app.clone();
                tokio::spawn(async move {
                    let _ = request_host.handle_connection(request_app, stream).await;
                });
            }
        });
        *host.inner.listener_task.lock().await = Some(task);
        Ok(host)
    }

    pub(crate) fn thread_config(&self) -> AppResult<Value> {
        let executable = std::env::current_exe().map_err(|error| {
            AppError::Message(format!("PHITS連携用実行ファイルを解決できません: {error}"))
        })?;
        Ok(json!({
            "mcp_servers": {
                (MCP_SERVER_NAME): {
                    "command": path_to_string(&executable),
                    "args": [MCP_ARGUMENT, self.inner.endpoint.clone()],
                    "env": { "PHITS_AI_EDITOR_MCP_TOKEN": self.inner.token.clone() },
                    "startup_timeout_sec": 10,
                    "tool_timeout_sec": 86400,
                    "enabled": true
                }
            }
        }))
    }

    pub(crate) async fn set_active_turn(
        &self,
        thread_id: String,
        mode: ApprovalMode,
        context: Option<&EditorContextV1>,
    ) {
        *self.inner.active_turn.lock().await = Some(ActiveTurn {
            thread_id,
            mode,
            active_input_path: context.and_then(|value| value.active_input_path.clone()),
            active_input_dirty: context.is_some_and(|value| value.active_input_dirty),
        });
    }

    pub(crate) async fn clear_active_turn(&self, thread_id: &str) {
        let mut active = self.inner.active_turn.lock().await;
        if active
            .as_ref()
            .is_some_and(|turn| turn.thread_id == thread_id)
        {
            *active = None;
        }
    }

    pub(crate) async fn resolve_approval(
        &self,
        request_id: &Value,
        decision: &str,
    ) -> AppResult<bool> {
        let key = request_id
            .as_str()
            .map(str::to_owned)
            .unwrap_or_else(|| request_id.to_string());
        let decision = match decision {
            "accept" => RunDecision::Accept,
            "acceptForSession" => RunDecision::AcceptForSession,
            "decline" => RunDecision::Decline,
            _ => {
                return Err(AppError::Message(
                    "PHITS実行では利用できない承認判断です。".into(),
                ));
            }
        };
        let Some(sender) = self.inner.pending.lock().await.remove(&key) else {
            return Ok(false);
        };
        sender
            .send(decision)
            .map_err(|_| AppError::Message("PHITS実行の承認要求はすでに終了しています。".into()))?;
        Ok(true)
    }

    pub(crate) async fn close(&self) {
        self.inner.active.store(false, Ordering::Release);
        self.inner.active_turn.lock().await.take();
        self.inner.session_grants.lock().await.clear();
        self.inner.pending.lock().await.clear();
        if let Some(task) = self.inner.listener_task.lock().await.take() {
            task.abort();
        }
    }

    async fn handle_connection(&self, app: AppHandle, stream: TcpStream) -> AppResult<()> {
        let (read_half, mut write_half) = stream.into_split();
        let mut lines = BufReader::new(read_half).lines();
        let line = lines
            .next_line()
            .await?
            .ok_or_else(|| AppError::Message("PHITS連携要求が空です。".into()))?;
        let request: BridgeRequest = serde_json::from_str(&line)?;
        let response = if request.token != self.inner.token {
            BridgeResponse {
                success: false,
                text: "PHITS連携要求の認証に失敗しました。".into(),
            }
        } else {
            self.handle_run_request(app, request.arguments).await
        };
        let mut bytes = serde_json::to_vec(&response)?;
        bytes.push(b'\n');
        write_half.write_all(&bytes).await?;
        write_half.shutdown().await?;
        Ok(())
    }

    async fn handle_run_request(&self, app: AppHandle, arguments: Value) -> BridgeResponse {
        match self.handle_run_request_inner(app, arguments).await {
            Ok(text) => BridgeResponse {
                success: true,
                text,
            },
            Err(error) => BridgeResponse {
                success: false,
                text: error.to_string(),
            },
        }
    }

    async fn handle_run_request_inner(
        &self,
        app: AppHandle,
        arguments: Value,
    ) -> AppResult<String> {
        if !self.inner.active.load(Ordering::Acquire) {
            return Err(AppError::Message(
                "Codex接続が終了したためPHITSを実行しません。".into(),
            ));
        }
        let arguments: RunPhitsArguments = serde_json::from_value(arguments).map_err(|error| {
            AppError::Message(format!("PHITS実行要求の形式が不正です: {error}"))
        })?;
        let turn = self
            .inner
            .active_turn
            .lock()
            .await
            .clone()
            .ok_or_else(|| AppError::Message("実行中のCodexターンを確認できません。".into()))?;
        if turn.mode == ApprovalMode::ConsultationOnly {
            return Err(AppError::Message(
                "相談のみモードではPHITSを実行できません。".into(),
            ));
        }
        let requested = arguments.input_relative_path.replace('\\', "/");
        let Some(active_input) = turn.active_input_path.as_deref() else {
            return Err(AppError::Message(
                "現在のPHITS入力ファイルが選択されていません。エディターで実行対象を開いてください。".into(),
            ));
        };
        if !relative_paths_equal(active_input, &requested) {
            return Err(AppError::Message(format!(
                "Codexが要求した入力 ({requested}) は現在の実行対象 ({active_input}) と一致しないため拒否しました。"
            )));
        }
        if turn.active_input_dirty {
            return Err(AppError::Message(
                "未保存の編集があります。入力ファイルを保存してからPHITS実行を依頼してください。"
                    .into(),
            ));
        }

        let workspace = path_to_string(&self.inner.workspace_root);
        let preview = runner::inspect_codex_run_request(&app, &workspace, &requested)?;
        let grant_key = approval_scope_key(&requested);
        let granted = self.inner.session_grants.lock().await.contains(&grant_key);
        let needs_confirmation = run_needs_confirmation(turn.mode, granted);
        if needs_confirmation {
            let request_id = Uuid::new_v4().to_string();
            let (sender, receiver) = oneshot::channel();
            self.inner
                .pending
                .lock()
                .await
                .insert(request_id.clone(), sender);
            let available_decisions = if turn.mode == ApprovalMode::OnRequest {
                json!(["accept", "acceptForSession", "decline"])
            } else {
                json!(["accept", "decline"])
            };
            let _ = app.emit(
                "codex://approval",
                json!({
                    "requestId": request_id,
                    "method": "phits/run/requestApproval",
                    "kind": "phitsRun",
                    "workspaceRoot": workspace.clone(),
                    "threadId": turn.thread_id,
                    "reason": arguments.reason,
                    "inputRelativePath": preview.input_relative_path,
                    "cwd": preview.work_dir,
                    "phitsRoot": preview.phits_root,
                    "phitsVersion": preview.phits_version,
                    "executionMode": "normal",
                    "availableDecisions": available_decisions,
                    "changes": []
                }),
            );
            let decision = receiver
                .await
                .map_err(|_| AppError::Message("PHITS実行の承認要求が取り消されました。".into()))?;
            match decision {
                RunDecision::Accept => {}
                RunDecision::AcceptForSession => {
                    self.inner.session_grants.lock().await.insert(grant_key);
                }
                RunDecision::Decline => {
                    return Err(AppError::Message(
                        "ユーザーがPHITS実行を拒否しました。".into(),
                    ));
                }
            }
        }

        let result = runner::run_phits_from_codex(app, &workspace, &requested).await?;
        Ok(serde_json::to_string_pretty(&result)?)
    }
}

pub fn run_mcp_child_from_args() -> bool {
    let args = std::env::args().collect::<Vec<_>>();
    let Some(index) = args.iter().position(|value| value == MCP_ARGUMENT) else {
        return false;
    };
    let endpoint = args.get(index + 1).cloned();
    let token = std::env::var("PHITS_AI_EDITOR_MCP_TOKEN").ok();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build();
    if let (Some(endpoint), Some(token), Ok(runtime)) = (endpoint, token, runtime) {
        let _ = runtime.block_on(run_mcp_stdio(endpoint, token));
    }
    true
}

async fn run_mcp_stdio(endpoint: String, token: String) -> AppResult<()> {
    let stdin = tokio::io::stdin();
    let mut lines = BufReader::new(stdin).lines();
    let mut stdout = tokio::io::stdout();
    while let Some(line) = lines.next_line().await? {
        let Ok(request) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let Some(id) = request.get("id").cloned() else {
            continue;
        };
        let method = request
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let response = match method {
            "initialize" => json!({
                "jsonrpc": "2.0", "id": id,
                "result": {
                    "protocolVersion": request.pointer("/params/protocolVersion").cloned().unwrap_or_else(|| json!("2025-06-18")),
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": "PHITS AI Editor", "version": env!("CARGO_PKG_VERSION") }
                }
            }),
            "ping" => json!({ "jsonrpc": "2.0", "id": id, "result": {} }),
            "tools/list" => json!({
                "jsonrpc": "2.0", "id": id,
                "result": { "tools": [{
                    "name": MCP_TOOL_NAME,
                    "title": "PHITSを通常実行",
                    "description": "PHITS AI Editorで現在選択中の保存済み.inp/.phtファイルを、検証済みの公式ラッパーから通常実行します。PHITSをshellから直接起動せず、このツールを使ってください。",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "inputRelativePath": { "type": "string", "description": "PHITS_EDITOR_CONTEXT_V1のactiveInputPathと同じワークスペース相対パス" },
                            "reason": { "type": "string", "description": "実行する理由の短い説明" }
                        },
                        "required": ["inputRelativePath"],
                        "additionalProperties": false
                    }
                }] }
            }),
            "tools/call" => {
                let name = request.pointer("/params/name").and_then(Value::as_str);
                if name != Some(MCP_TOOL_NAME) {
                    json!({ "jsonrpc": "2.0", "id": id, "result": { "content": [{ "type": "text", "text": "未知のツールです。" }], "isError": true } })
                } else {
                    let arguments = request
                        .pointer("/params/arguments")
                        .cloned()
                        .unwrap_or_else(|| json!({}));
                    let bridge = call_host(&endpoint, &token, arguments).await;
                    match bridge {
                        Ok(value) => {
                            json!({ "jsonrpc": "2.0", "id": id, "result": { "content": [{ "type": "text", "text": value.text }], "isError": !value.success } })
                        }
                        Err(error) => {
                            json!({ "jsonrpc": "2.0", "id": id, "result": { "content": [{ "type": "text", "text": error.to_string() }], "isError": true } })
                        }
                    }
                }
            }
            _ => {
                json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32601, "message": "Method not found" } })
            }
        };
        let mut bytes = serde_json::to_vec(&response)?;
        bytes.push(b'\n');
        stdout.write_all(&bytes).await?;
        stdout.flush().await?;
    }
    Ok(())
}

async fn call_host(endpoint: &str, token: &str, arguments: Value) -> AppResult<BridgeResponse> {
    let mut stream = TcpStream::connect(endpoint)
        .await
        .map_err(|error| AppError::Message(format!("PHITS AI Editorへ接続できません: {error}")))?;
    let mut request = serde_json::to_vec(&json!({ "token": token, "arguments": arguments }))?;
    request.push(b'\n');
    stream.write_all(&request).await?;
    stream.shutdown().await?;
    let mut lines = BufReader::new(stream).lines();
    let line = lines.next_line().await?.ok_or_else(|| {
        AppError::Message("PHITS AI Editorから実行結果が返りませんでした。".into())
    })?;
    Ok(serde_json::from_str(&line)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mcp_arguments_are_not_treated_as_startup_files() {
        assert_eq!(MCP_ARGUMENT, "--phits-ai-editor-mcp");
    }

    #[test]
    fn run_arguments_require_a_relative_input_field() {
        assert!(serde_json::from_value::<RunPhitsArguments>(json!({})).is_err());
        assert_eq!(
            serde_json::from_value::<RunPhitsArguments>(json!({ "inputRelativePath": "case.inp" }))
                .unwrap()
                .input_relative_path,
            "case.inp"
        );
    }

    #[test]
    fn run_confirmation_matches_each_exposed_mode() {
        assert!(run_needs_confirmation(ApprovalMode::ConfirmFirst, true));
        assert!(run_needs_confirmation(ApprovalMode::ConsultationOnly, true));
        assert!(run_needs_confirmation(ApprovalMode::OnRequest, false));
        assert!(!run_needs_confirmation(ApprovalMode::OnRequest, true));
        assert!(!run_needs_confirmation(
            ApprovalMode::AutonomousWorkspace,
            false
        ));
    }
}
