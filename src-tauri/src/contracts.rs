use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ExecutionMode {
    Normal,
    CalculationPriority,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Compatibility {
    Supported,
    NewerUnverified,
    UnsupportedOlder,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RunState {
    LaunchRequested,
    Running,
    StopRequested,
    Completed,
    Failed,
    Unresolved,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum UtilityKind {
    Angel,
    Dchain,
    Phig3d,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub root: String,
    pub primary_input: Option<String>,
    pub candidate_inputs: Vec<String>,
    pub auxiliary_files: Vec<String>,
    pub writable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartupOpenRequest {
    pub id: String,
    pub kind: StartupOpenKind,
    pub path: String,
    pub workspace_root: String,
    pub relative_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum StartupOpenKind {
    File,
    Folder,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TextEncoding {
    Utf8,
    Utf8Bom,
    Windows31j,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LineEnding {
    Lf,
    Crlf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentData {
    pub path: String,
    pub relative_path: String,
    pub content: String,
    pub encoding: TextEncoding,
    pub line_ending: LineEnding,
    pub modified_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDiagnostics {
    pub phits_root: Option<String>,
    pub phits_path_source: PhitsPathSource,
    pub phits_version: Option<String>,
    pub compatibility: Compatibility,
    pub phits_ready: bool,
    pub phits_wrapper: Option<String>,
    pub language_spec: Option<String>,
    pub codex_path: Option<String>,
    pub codex_version: Option<String>,
    pub codex_compatible: bool,
    pub messages: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PhitsPathSource {
    WorkspaceSetting,
    AppSetting,
    Environment,
    StandardLocation,
    Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PhitsAppSettings {
    pub phits_root: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStatus {
    pub run_id: String,
    pub mode: ExecutionMode,
    pub state: RunState,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileFingerprintV1 {
    pub relative_path: String,
    pub existed: bool,
    pub size: Option<u64>,
    pub modified_at_ms: Option<u64>,
    pub tail_sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunManifestV1 {
    pub schema_version: u32,
    pub run_id: String,
    pub mode: ExecutionMode,
    pub input_relative_path: String,
    pub input_sha256: String,
    pub requested_at: String,
    pub phits_version: Option<String>,
    pub pre_run_files: Vec<FileFingerprintV1>,
    pub restoration_state: RunState,
    pub failure_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhitsOutputEvent {
    pub run_id: String,
    pub stream: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexModel {
    pub id: String,
    pub display_name: String,
    pub is_default: bool,
    pub default_reasoning_effort: Option<String>,
    pub supported_reasoning_efforts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexThreadLink {
    pub thread_id: String,
    pub title: String,
    pub last_used_at: String,
    pub model: Option<String>,
    pub reasoning_effort: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexConnectResult {
    pub models: Vec<CodexModel>,
    pub active_thread_id: Option<String>,
    pub threads: Vec<CodexThreadLink>,
    pub compatibility: CodexCompatibilityReport,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CodexCompatibilityState {
    Compatible,
    Limited,
    Incompatible,
    Checking,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CodexFeatureId {
    Chat,
    Threads,
    FileEditing,
    Approvals,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CodexFeatureState {
    Available,
    Limited,
    Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexFeatureStatus {
    pub id: CodexFeatureId,
    pub state: CodexFeatureState,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexCompatibilityReport {
    pub state: CodexCompatibilityState,
    pub codex_path: Option<String>,
    pub codex_version: Option<String>,
    pub baseline_version: String,
    pub checked_at: String,
    pub features: Vec<CodexFeatureStatus>,
    pub messages: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ApprovalMode {
    ConfirmFirst,
    ConsultationOnly,
    OnRequest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorPositionV1 {
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorSelectionV1 {
    pub start_line: u32,
    pub start_column: u32,
    pub end_line: u32,
    pub end_column: u32,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorDiagnosticV1 {
    pub severity: String,
    pub message: String,
    pub start_line: u32,
    pub start_column: u32,
    pub end_line: u32,
    pub end_column: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorContextV1 {
    pub version: u32,
    pub active_document_path: Option<String>,
    pub active_input_path: Option<String>,
    pub cursor: Option<EditorPositionV1>,
    pub selection: Option<EditorSelectionV1>,
    pub dirty: bool,
    pub dirty_buffer: Option<String>,
    #[serde(default)]
    pub open_document_paths: Vec<String>,
    #[serde(default)]
    pub diagnostics: Vec<EditorDiagnosticV1>,
    pub phits_version: Option<String>,
    pub attached_output_path: Option<String>,
    pub attached_output_content: Option<String>,
    pub content_warning: Option<String>,
    #[serde(default)]
    pub document_revisions: Vec<DocumentRevisionV1>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRevisionV1 {
    pub relative_path: String,
    pub disk_sha256: String,
    pub buffer_sha256: String,
    pub modified_at_ms: u64,
    pub dirty: bool,
}
