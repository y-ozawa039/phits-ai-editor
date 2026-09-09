use std::{
    collections::HashMap,
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    sync::OnceLock,
};

use chrono::Utc;
use regex::Regex;
use tauri::AppHandle;
use tokio::{
    process::Command as TokioCommand,
    sync::Mutex as AsyncMutex,
    time::{Duration, timeout},
};

use crate::{
    contracts::{
        CodexCompatibilityReport, CodexCompatibilityState, CodexFeatureId, CodexFeatureState,
        CodexFeatureStatus, Compatibility, PhitsPathSource, RuntimeDiagnostics,
    },
    error::{AppError, AppResult},
    settings::app_phits_root,
};

const SUPPORTED_PHITS_VERSION: f64 = 3.37;
const VERIFIED_CODEX_VERSION: (u64, u64, u64) = (0, 153, 1);
const VERIFIED_CODEX_VERSION_TEXT: &str = "0.153.1";
const CODEX_SCHEMA_PROBE_TIMEOUT: Duration = Duration::from_secs(20);

const CHAT_SCHEMA_FILES: &[&str] = &[
    "InitializeParams.json",
    "InitializeResponse.json",
    "ModelListParams.json",
    "ModelListResponse.json",
    "TurnStartParams.json",
    "TurnStartResponse.json",
];
const THREAD_SCHEMA_FILES: &[&str] = &[
    "ThreadListParams.json",
    "ThreadListResponse.json",
    "ThreadStartParams.json",
    "ThreadStartResponse.json",
    "ThreadReadParams.json",
    "ThreadReadResponse.json",
    "ThreadResumeParams.json",
    "ThreadResumeResponse.json",
    "ThreadDeleteParams.json",
    "ThreadDeleteResponse.json",
    "ThreadSetNameParams.json",
    "ThreadSetNameResponse.json",
];
const FILE_EDITING_SCHEMA_FILES: &[&str] = &[
    "FileChangeRequestApprovalParams.json",
    "FileChangeRequestApprovalResponse.json",
    "TurnDiffUpdatedNotification.json",
];
const APPROVAL_SCHEMA_FILES: &[&str] = &[
    "FileChangeRequestApprovalParams.json",
    "FileChangeRequestApprovalResponse.json",
    "CommandExecutionRequestApprovalParams.json",
    "CommandExecutionRequestApprovalResponse.json",
];
const REQUIRED_APPROVAL_DECISIONS: &[&str] = &["accept", "acceptForSession", "decline", "cancel"];

type CodexProbeCache = Option<(String, String, CodexCompatibilityReport)>;
static CODEX_PROBE_CACHE: OnceLock<AsyncMutex<CodexProbeCache>> = OnceLock::new();

fn codex_probe_cache() -> &'static AsyncMutex<CodexProbeCache> {
    CODEX_PROBE_CACHE.get_or_init(|| AsyncMutex::new(None))
}

#[tauri::command]
pub fn runtime_diagnose(
    app: AppHandle,
    workspace_root: Option<String>,
) -> AppResult<RuntimeDiagnostics> {
    let workspace = workspace_root
        .as_deref()
        .map(Path::new)
        .map(canonical_directory)
        .transpose()?;
    let mut messages = Vec::new();

    let configured_root = app_phits_root(&app)?;
    let resolved = resolve_phits_root(
        workspace.as_deref(),
        configured_root.as_deref(),
        &mut messages,
    );
    let phits_path_source = resolved
        .as_ref()
        .map(|value| value.source)
        .unwrap_or(PhitsPathSource::Unavailable);
    let phits_root = resolved.map(|value| value.root);
    let mut phits_version = None;
    let mut compatibility = Compatibility::Unknown;
    let mut phits_ready = false;
    let mut phits_wrapper = None;
    let mut language_spec = None;

    if let Some(root) = phits_root.as_deref() {
        match read_phits_version(root) {
            Ok(version) => {
                compatibility = phits_compatibility(&version);
                phits_version = Some(version);
                match compatibility {
                    Compatibility::NewerUnverified => messages.push(
                        "このPHITS版は3.37より新しく、未検証です。警告付きで実行できます。".into(),
                    ),
                    Compatibility::UnsupportedOlder => messages.push(
                        "PHITS 3.37より古い版は実行できません。".into(),
                    ),
                    Compatibility::Unknown => messages.push(
                        "PHITSのバージョンを数値として解釈できません。警告付きで実行できます。".into(),
                    ),
                    Compatibility::Supported => {}
                }
            }
            Err(error) => messages.push(format!(
                "src/include/version.incからPHITS版を取得できませんでした: {error}。警告付きで実行できます。"
            )),
        }

        let wrapper = phits_wrapper_path(root);
        let entry = phits_entry_path(root);
        if wrapper.is_file() {
            phits_wrapper = Some(wrapper.to_string_lossy().into_owned());
        } else {
            messages.push(format!(
                "公式PHITSラッパーが見つかりません: {}",
                wrapper.display()
            ));
        }
        if !entry.is_file() {
            messages.push(format!(
                "PHITS公式実行入口が見つかりません: {}",
                entry.display()
            ));
        }
        phits_ready = wrapper.is_file()
            && entry.is_file()
            && !matches!(compatibility, Compatibility::UnsupportedOlder);

        let spec = root.join("workbench/language_support/data/phits-spec.json");
        if spec.is_file() {
            language_spec = Some(spec.to_string_lossy().into_owned());
        } else {
            messages.push("phits-spec.jsonが見つからないため言語支援は縮退します。".into());
        }
    } else {
        messages.push("PHITSインストール先を検出できません。設定からフォルダーを指定できます。テキスト編集は引き続き利用できます。".into());
    }

    let (codex_path, codex_version, codex_compatible) = diagnose_codex(&mut messages);

    Ok(RuntimeDiagnostics {
        phits_root: phits_root.map(|path| path.to_string_lossy().into_owned()),
        phits_path_source,
        phits_version,
        compatibility,
        phits_ready,
        phits_wrapper,
        language_spec,
        codex_path,
        codex_version,
        codex_compatible,
        messages,
    })
}

pub(crate) struct ResolvedPhitsRoot {
    pub root: PathBuf,
    pub source: PhitsPathSource,
}

pub(crate) fn resolve_phits_root(
    workspace_root: Option<&Path>,
    app_setting_root: Option<&Path>,
    messages: &mut Vec<String>,
) -> Option<ResolvedPhitsRoot> {
    if let Some(workspace) = workspace_root {
        let settings_path = workspace.join(".phits-editor/workspace.json");
        if settings_path.is_file() {
            match fs::read(&settings_path)
                .map_err(AppError::from)
                .and_then(|bytes| {
                    serde_json::from_slice::<serde_json::Value>(&bytes).map_err(Into::into)
                }) {
                Ok(value) => {
                    if let Some(value) = workspace_phits_root(&value) {
                        match canonical_phits_root(Path::new(value)) {
                            Ok(root) => {
                                return Some(ResolvedPhitsRoot {
                                    root,
                                    source: PhitsPathSource::WorkspaceSetting,
                                });
                            }
                            Err(error) => messages.push(format!(
                                "ワークスペース設定のPHITSパスを利用できません: {error}"
                            )),
                        }
                    }
                }
                Err(error) => messages.push(format!("ワークスペース設定を読み取れません: {error}")),
            }
        }
    }

    if let Some(value) = app_setting_root {
        match canonical_phits_root(value) {
            Ok(root) => {
                return Some(ResolvedPhitsRoot {
                    root,
                    source: PhitsPathSource::AppSetting,
                });
            }
            Err(error) => messages.push(format!("アプリ設定のPHITSパスを利用できません: {error}")),
        }
    }

    match env::var_os("PHITSPATH") {
        Some(value) if !value.is_empty() => match canonical_phits_root(Path::new(&value)) {
            Ok(root) => {
                return Some(ResolvedPhitsRoot {
                    root,
                    source: PhitsPathSource::Environment,
                });
            }
            Err(error) => {
                messages.push(format!("環境変数PHITSPATHを利用できません: {error}"));
            }
        },
        _ => {}
    }

    if let Some(value) = standard_phits_root()
        && let Ok(root) = canonical_phits_root(&value)
    {
        return Some(ResolvedPhitsRoot {
            root,
            source: PhitsPathSource::StandardLocation,
        });
    }
    None
}

fn workspace_phits_root(value: &serde_json::Value) -> Option<&str> {
    [
        "/settings/phitsRoot",
        "/settings/phitsPath",
        "/workspaceSettings/phitsRoot",
        "/phitsRoot",
    ]
    .iter()
    .find_map(|pointer| value.pointer(pointer).and_then(serde_json::Value::as_str))
    .filter(|value| !value.trim().is_empty())
}

fn canonical_directory(path: &Path) -> AppResult<PathBuf> {
    let canonical = dunce::canonicalize(path)?;
    if !canonical.is_dir() {
        return Err(AppError::Message(format!(
            "ディレクトリではありません: {}",
            canonical.display()
        )));
    }
    Ok(canonical)
}

pub(crate) fn validate_configured_phits_root(path: &Path) -> AppResult<PathBuf> {
    let root = canonical_phits_root(path)?;
    let wrapper = phits_wrapper_path(&root);
    if !wrapper.is_file() {
        return Err(AppError::Message(format!(
            "公式PHITSラッパーがありません: {}",
            wrapper.display()
        )));
    }
    let entry = phits_entry_path(&root);
    if !entry.is_file() {
        return Err(AppError::Message(format!(
            "PHITS公式実行入口がありません: {}",
            entry.display()
        )));
    }
    Ok(root)
}

#[cfg(windows)]
fn standard_phits_root() -> Option<PathBuf> {
    Some(PathBuf::from(r"C:\phits"))
}

#[cfg(not(windows))]
fn standard_phits_root() -> Option<PathBuf> {
    None
}

#[cfg(windows)]
fn phits_entry_path(root: &Path) -> PathBuf {
    root.join("bin/phits.bat")
}

#[cfg(not(windows))]
fn phits_entry_path(root: &Path) -> PathBuf {
    phits_wrapper_path(root)
}

fn canonical_phits_root(path: &Path) -> AppResult<PathBuf> {
    canonical_directory(path)
        .map_err(|error| AppError::Message(format!("{} ({error})", path.display())))
}

pub(crate) fn read_phits_version(root: &Path) -> AppResult<String> {
    let path = root.join("src/include/version.inc");
    let source = fs::read_to_string(&path)
        .map_err(|error| AppError::Message(format!("{}: {error}", path.display())))?;
    parse_phits_version(&source).ok_or_else(|| {
        AppError::Message(format!(
            "{}にVersionStrまたはVersionがありません",
            path.display()
        ))
    })
}

fn parse_phits_version(source: &str) -> Option<String> {
    let string_pattern =
        Regex::new(r#"(?im)\bVersionStr\s*=\s*['\"]\s*([0-9]+(?:\.[0-9]+)?)\s*['\"]"#).ok()?;
    if let Some(captures) = string_pattern.captures(source) {
        return captures.get(1).map(|value| value.as_str().to_owned());
    }
    let numeric_pattern = Regex::new(r"(?im)\bVersion\s*=\s*([0-9]+(?:\.[0-9]+)?)").ok()?;
    numeric_pattern
        .captures(source)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().to_owned())
}

pub(crate) fn phits_compatibility(version: &str) -> Compatibility {
    let Ok(value) = version.trim().parse::<f64>() else {
        return Compatibility::Unknown;
    };
    if (value - SUPPORTED_PHITS_VERSION).abs() < 0.000_000_1 {
        Compatibility::Supported
    } else if value > SUPPORTED_PHITS_VERSION {
        Compatibility::NewerUnverified
    } else {
        Compatibility::UnsupportedOlder
    }
}

#[cfg(windows)]
pub(crate) fn phits_wrapper_path(root: &Path) -> PathBuf {
    root.join("workbench/task/win/run_phits_no_pause.ps1")
}

#[cfg(target_os = "linux")]
pub(crate) fn phits_wrapper_path(root: &Path) -> PathBuf {
    root.join("workbench/task/linux/run_phits_no_pause.sh")
}

#[cfg(not(any(windows, target_os = "linux")))]
pub(crate) fn phits_wrapper_path(root: &Path) -> PathBuf {
    root.join("workbench/task/mac/run_phits_no_pause.sh")
}

fn diagnose_codex(messages: &mut Vec<String>) -> (Option<String>, Option<String>, bool) {
    let Some(executable) = resolve_codex_executable() else {
        messages.push("Codex CLIを検出できません。編集とPHITS実行は引き続き利用できます。".into());
        return (None, None, false);
    };
    let output = match Command::new(&executable).arg("--version").output() {
        Ok(output) => output,
        Err(error) => {
            messages.push(format!(
                "Codex CLIを起動できません。編集とPHITS実行は引き続き利用できます: {error}"
            ));
            return (Some(executable.to_string_lossy().into_owned()), None, false);
        }
    };
    if !output.status.success() {
        messages
            .push("Codex CLIのバージョン確認に失敗しました。Codex機能だけを無効化します。".into());
        return (Some(executable.to_string_lossy().into_owned()), None, false);
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    let version = parse_semver(&text);
    let compatible = version
        .as_ref()
        .is_some_and(|version| *version >= VERIFIED_CODEX_VERSION);
    if let Some(parsed) = version {
        if parsed > VERIFIED_CODEX_VERSION {
            messages.push("Codex CLIは検証基準0.153.1より新しいため、App Server Schemaで機能別の互換性を確認します。".into());
        } else if parsed < VERIFIED_CODEX_VERSION {
            messages.push("Codex CLIが0.153.1より古いためCodex機能を無効化します。".into());
        }
    } else {
        messages.push("Codex CLIのバージョンを解釈できません。Codex機能を無効化します。".into());
    }
    (
        Some(executable.to_string_lossy().into_owned()),
        Some(text),
        compatible,
    )
}

fn unavailable_codex_features(detail: &str) -> Vec<CodexFeatureStatus> {
    [
        CodexFeatureId::Chat,
        CodexFeatureId::Threads,
        CodexFeatureId::FileEditing,
        CodexFeatureId::Approvals,
    ]
    .into_iter()
    .map(|id| CodexFeatureStatus {
        id,
        state: CodexFeatureState::Unavailable,
        detail: detail.to_owned(),
    })
    .collect()
}

fn collect_schema_files(directory: &Path, files: &mut HashMap<String, PathBuf>) -> AppResult<()> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_schema_files(&path, files)?;
        } else if path.extension().and_then(|value| value.to_str()) == Some("json")
            && let Some(name) = path.file_name().and_then(|value| value.to_str())
        {
            files.entry(name.to_owned()).or_insert(path);
        }
    }
    Ok(())
}

fn feature_from_required_files(
    id: CodexFeatureId,
    required: &[&str],
    files: &HashMap<String, PathBuf>,
    available_detail: &str,
) -> CodexFeatureStatus {
    let missing: Vec<_> = required
        .iter()
        .copied()
        .filter(|name| !files.contains_key(*name))
        .collect();
    if missing.is_empty() {
        CodexFeatureStatus {
            id,
            state: CodexFeatureState::Available,
            detail: available_detail.to_owned(),
        }
    } else {
        CodexFeatureStatus {
            id,
            state: CodexFeatureState::Unavailable,
            detail: format!("必要なSchemaがありません: {}", missing.join(", ")),
        }
    }
}

fn evaluate_codex_schema_inventory(
    files: &HashMap<String, PathBuf>,
) -> AppResult<(
    CodexCompatibilityState,
    Vec<CodexFeatureStatus>,
    Vec<String>,
)> {
    let chat = feature_from_required_files(
        CodexFeatureId::Chat,
        CHAT_SCHEMA_FILES,
        files,
        "会話とストリーミング応答に必要なSchemaを確認しました。",
    );
    let threads = feature_from_required_files(
        CodexFeatureId::Threads,
        THREAD_SCHEMA_FILES,
        files,
        "スレッドの作成・再開・名称変更・削除に必要なSchemaを確認しました。",
    );
    let file_editing = feature_from_required_files(
        CodexFeatureId::FileEditing,
        FILE_EDITING_SCHEMA_FILES,
        files,
        "ファイル変更と差分通知に必要なSchemaを確認しました。",
    );
    let mut approvals = feature_from_required_files(
        CodexFeatureId::Approvals,
        APPROVAL_SCHEMA_FILES,
        files,
        "ファイル変更・コマンド承認に必要なSchemaを確認しました。",
    );
    if approvals.state == CodexFeatureState::Available {
        for response_name in [
            "FileChangeRequestApprovalResponse.json",
            "CommandExecutionRequestApprovalResponse.json",
        ] {
            let path = files.get(response_name).ok_or_else(|| {
                AppError::Message(format!("Compatibility probe lost {response_name}"))
            })?;
            let text = fs::read_to_string(path)?;
            let missing: Vec<_> = REQUIRED_APPROVAL_DECISIONS
                .iter()
                .copied()
                .filter(|decision| !text.contains(&format!("\"{decision}\"")))
                .collect();
            if !missing.is_empty() {
                approvals.state = CodexFeatureState::Unavailable;
                approvals.detail = format!(
                    "{response_name}に必要な承認値がありません: {}",
                    missing.join(", ")
                );
                break;
            }
        }
    }

    let features = vec![chat, threads, file_editing, approvals];
    let unavailable: Vec<_> = features
        .iter()
        .filter(|feature| feature.state != CodexFeatureState::Available)
        .map(|feature| format!("{:?}", feature.id))
        .collect();
    let state = if features[0].state != CodexFeatureState::Available {
        CodexCompatibilityState::Incompatible
    } else if unavailable.is_empty() {
        CodexCompatibilityState::Compatible
    } else {
        CodexCompatibilityState::Limited
    };
    let messages = if unavailable.is_empty() {
        vec!["インストール済みCodex CLIのApp Server Schemaは必要機能と互換です。".into()]
    } else {
        vec![format!(
            "一部のCodex機能を安全のため無効化します: {}",
            unavailable.join(", ")
        )]
    };
    Ok((state, features, messages))
}

fn codex_probe_report(
    state: CodexCompatibilityState,
    codex_path: Option<String>,
    codex_version: Option<String>,
    features: Vec<CodexFeatureStatus>,
    messages: Vec<String>,
) -> CodexCompatibilityReport {
    CodexCompatibilityReport {
        state,
        codex_path,
        codex_version,
        baseline_version: VERIFIED_CODEX_VERSION_TEXT.into(),
        checked_at: Utc::now().to_rfc3339(),
        features,
        messages,
    }
}

#[tauri::command]
pub async fn codex_compatibility_probe(force: bool) -> AppResult<CodexCompatibilityReport> {
    let Some(executable) = resolve_codex_executable() else {
        return Ok(codex_probe_report(
            CodexCompatibilityState::Incompatible,
            None,
            None,
            unavailable_codex_features("Codex CLIを検出できません。"),
            vec!["Codex CLIを検出できないため互換性を確認できません。".into()],
        ));
    };
    let codex_path = executable.to_string_lossy().into_owned();
    let version_output = TokioCommand::new(&executable)
        .arg("--version")
        .output()
        .await;
    let Ok(version_output) = version_output else {
        return Ok(codex_probe_report(
            CodexCompatibilityState::Incompatible,
            Some(codex_path),
            None,
            unavailable_codex_features("Codex CLIを起動できません。"),
            vec!["Codex CLIのバージョン確認を開始できませんでした。".into()],
        ));
    };
    let version_text = String::from_utf8_lossy(&version_output.stdout)
        .trim()
        .to_owned();
    let Some(version) = parse_semver(&version_text) else {
        return Ok(codex_probe_report(
            CodexCompatibilityState::Incompatible,
            Some(codex_path),
            Some(version_text),
            unavailable_codex_features("Codex CLIのバージョンを解釈できません。"),
            vec!["Codex CLIのバージョンを解釈できません。".into()],
        ));
    };

    if !force {
        let cache = codex_probe_cache().lock().await;
        if let Some((cached_path, cached_version, report)) = cache.as_ref()
            && cached_path == &codex_path
            && cached_version == &version_text
        {
            return Ok(report.clone());
        }
    }

    if version < VERIFIED_CODEX_VERSION {
        return Ok(codex_probe_report(
            CodexCompatibilityState::Incompatible,
            Some(codex_path),
            Some(version_text),
            unavailable_codex_features("最低対応版0.153.1より古いCodex CLIです。"),
            vec!["Codex CLI 0.153.1以降へ更新してください。".into()],
        ));
    }

    let temporary = tempfile::tempdir()?;
    let mut command = TokioCommand::new(&executable);
    command
        .arg("app-server")
        .arg("generate-json-schema")
        .arg("--out")
        .arg(temporary.path())
        .kill_on_drop(true);
    match timeout(CODEX_SCHEMA_PROBE_TIMEOUT, command.output()).await {
        Ok(Ok(output)) if output.status.success() => {}
        Ok(Ok(output)) => {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
            return Ok(codex_probe_report(
                CodexCompatibilityState::Incompatible,
                Some(codex_path),
                Some(version_text),
                unavailable_codex_features("App Server Schemaを生成できません。"),
                vec![if detail.is_empty() {
                    "Codex App Server Schemaの生成に失敗しました。".into()
                } else {
                    format!("Codex App Server Schemaの生成に失敗しました: {detail}")
                }],
            ));
        }
        Ok(Err(error)) => {
            return Ok(codex_probe_report(
                CodexCompatibilityState::Incompatible,
                Some(codex_path),
                Some(version_text),
                unavailable_codex_features("App Server Schemaを生成できません。"),
                vec![format!("Codex App Server Schemaを生成できません: {error}")],
            ));
        }
        Err(_) => {
            return Ok(codex_probe_report(
                CodexCompatibilityState::Incompatible,
                Some(codex_path),
                Some(version_text),
                unavailable_codex_features("互換性確認がタイムアウトしました。"),
                vec!["Codex App Server Schemaの生成が20秒以内に完了しませんでした。".into()],
            ));
        }
    }
    let mut files = HashMap::new();
    collect_schema_files(temporary.path(), &mut files)?;
    let (state, features, messages) = evaluate_codex_schema_inventory(&files)?;
    let report = codex_probe_report(
        state,
        Some(codex_path),
        Some(version_text),
        features,
        messages,
    );
    if report.state != CodexCompatibilityState::Incompatible {
        let mut cache = codex_probe_cache().lock().await;
        *cache = Some((
            report.codex_path.clone().unwrap_or_default(),
            report.codex_version.clone().unwrap_or_default(),
            report.clone(),
        ));
    }
    Ok(report)
}

pub(crate) fn resolve_codex_executable() -> Option<PathBuf> {
    let executable_name = if cfg!(windows) { "codex.exe" } else { "codex" };
    if let Some(paths) = env::var_os("PATH") {
        for directory in env::split_paths(&paths) {
            let candidate = directory.join(executable_name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    #[cfg(windows)]
    {
        let base = env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)?
            .join("OpenAI/Codex/bin");
        let mut candidates = Vec::new();
        for entry in fs::read_dir(base).ok()?.filter_map(Result::ok) {
            let candidate = entry.path().join("codex.exe");
            if candidate.is_file() {
                let modified = fs::metadata(&candidate)
                    .and_then(|metadata| metadata.modified())
                    .ok();
                candidates.push((modified, candidate));
            }
        }
        candidates.sort_by_key(|left| std::cmp::Reverse(left.0));
        candidates.into_iter().next().map(|(_, path)| path)
    }

    #[cfg(not(windows))]
    None
}

fn parse_semver(text: &str) -> Option<(u64, u64, u64)> {
    let captures = Regex::new(r"(?m)(\d+)\.(\d+)\.(\d+)")
        .ok()?
        .captures(text)?;
    Some((
        captures.get(1)?.as_str().parse().ok()?,
        captures.get(2)?.as_str().parse().ok()?,
        captures.get(3)?.as_str().parse().ok()?,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn parses_version_string_before_numeric_value() {
        let source = "real, parameter :: Version = 3.370\ncharacter(len=20), parameter :: VersionStr = '3.370'";
        assert_eq!(parse_phits_version(source).as_deref(), Some("3.370"));
    }

    #[test]
    fn falls_back_to_numeric_version() {
        assert_eq!(
            parse_phits_version("real, parameter :: Version = 3.380"),
            Some("3.380".into())
        );
    }

    #[test]
    fn classifies_phits_versions_numerically() {
        assert_eq!(phits_compatibility("3.370"), Compatibility::Supported);
        assert_eq!(phits_compatibility("3.38"), Compatibility::NewerUnverified);
        assert_eq!(
            phits_compatibility("3.369"),
            Compatibility::UnsupportedOlder
        );
        assert_eq!(phits_compatibility("unknown"), Compatibility::Unknown);
    }

    #[test]
    fn extracts_codex_semver_from_cli_output() {
        assert_eq!(parse_semver("codex-cli 0.153.1"), Some((0, 153, 1)));
    }

    fn pinned_codex_schema_inventory() -> HashMap<String, PathBuf> {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../schemas/codex/0.153.1");
        let mut files = HashMap::new();
        collect_schema_files(&root, &mut files).unwrap();
        files
    }

    #[test]
    fn compatibility_probe_accepts_the_pinned_schema() {
        let (state, features, _) =
            evaluate_codex_schema_inventory(&pinned_codex_schema_inventory()).unwrap();
        assert_eq!(state, CodexCompatibilityState::Compatible);
        assert!(
            features
                .iter()
                .all(|feature| feature.state == CodexFeatureState::Available)
        );
    }

    #[test]
    fn compatibility_probe_degrades_only_the_missing_feature() {
        let mut files = pinned_codex_schema_inventory();
        files.remove("TurnDiffUpdatedNotification.json");
        let (state, features, _) = evaluate_codex_schema_inventory(&files).unwrap();
        assert_eq!(state, CodexCompatibilityState::Limited);
        assert_eq!(
            features
                .iter()
                .find(|feature| feature.id == CodexFeatureId::FileEditing)
                .unwrap()
                .state,
            CodexFeatureState::Unavailable
        );
        assert_eq!(features[0].state, CodexFeatureState::Available);
    }

    #[test]
    fn compatibility_probe_rejects_unknown_approval_decisions() {
        let temporary = tempfile::tempdir().unwrap();
        let response = temporary.path().join("approval.json");
        fs::write(&response, r#"{"oneOf":[{"const":"accept"}]}"#).unwrap();
        let mut files = pinned_codex_schema_inventory();
        files.insert("FileChangeRequestApprovalResponse.json".into(), response);
        let (state, features, _) = evaluate_codex_schema_inventory(&files).unwrap();
        assert_eq!(state, CodexCompatibilityState::Limited);
        assert_eq!(
            features
                .iter()
                .find(|feature| feature.id == CodexFeatureId::Approvals)
                .unwrap()
                .state,
            CodexFeatureState::Unavailable
        );
    }

    #[test]
    fn workspace_setting_precedes_app_setting() {
        let workspace = tempfile::tempdir().unwrap();
        let workspace_phits = tempfile::tempdir().unwrap();
        let app_phits = tempfile::tempdir().unwrap();
        let settings_dir = workspace.path().join(".phits-editor");
        fs::create_dir_all(&settings_dir).unwrap();
        fs::write(
            settings_dir.join("workspace.json"),
            serde_json::to_vec(&serde_json::json!({
                "settings": { "phitsRoot": workspace_phits.path() }
            }))
            .unwrap(),
        )
        .unwrap();

        let resolved = resolve_phits_root(
            Some(workspace.path()),
            Some(app_phits.path()),
            &mut Vec::new(),
        )
        .unwrap();
        assert_eq!(resolved.source, PhitsPathSource::WorkspaceSetting);
        assert_eq!(
            resolved.root,
            dunce::canonicalize(workspace_phits.path()).unwrap()
        );
    }

    #[test]
    fn app_setting_precedes_environment_and_standard_detection() {
        let app_phits = tempfile::tempdir().unwrap();
        let resolved = resolve_phits_root(None, Some(app_phits.path()), &mut Vec::new()).unwrap();
        assert_eq!(resolved.source, PhitsPathSource::AppSetting);
        assert_eq!(
            resolved.root,
            dunce::canonicalize(app_phits.path()).unwrap()
        );
    }
}
