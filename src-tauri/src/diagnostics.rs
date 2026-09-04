use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
};

use regex::Regex;

use crate::{
    contracts::{Compatibility, RuntimeDiagnostics},
    error::{AppError, AppResult},
};

const SUPPORTED_PHITS_VERSION: f64 = 3.37;
const VERIFIED_CODEX_VERSION: (u64, u64, u64) = (0, 153, 1);

#[tauri::command]
pub fn runtime_diagnose(workspace_root: Option<String>) -> AppResult<RuntimeDiagnostics> {
    let workspace = workspace_root
        .as_deref()
        .map(Path::new)
        .map(canonical_directory)
        .transpose()?;
    let mut messages = Vec::new();

    let phits_root = resolve_phits_root(workspace.as_deref(), &mut messages);
    let mut phits_version = None;
    let mut compatibility = Compatibility::Unknown;
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
        if wrapper.is_file() {
            phits_wrapper = Some(wrapper.to_string_lossy().into_owned());
        } else {
            messages.push(format!(
                "公式PHITSラッパーが見つかりません: {}",
                wrapper.display()
            ));
        }

        let spec = root.join("workbench/language_support/data/phits-spec.json");
        if spec.is_file() {
            language_spec = Some(spec.to_string_lossy().into_owned());
        } else {
            messages.push("phits-spec.jsonが見つからないため言語支援は縮退します。".into());
        }
    } else {
        messages.push("PHITSPATHを検出できません。テキスト編集は引き続き利用できます。".into());
    }

    let (codex_path, codex_version, codex_compatible) = diagnose_codex(&mut messages);

    Ok(RuntimeDiagnostics {
        phits_root: phits_root.map(|path| path.to_string_lossy().into_owned()),
        phits_version,
        compatibility,
        phits_wrapper,
        language_spec,
        codex_path,
        codex_version,
        codex_compatible,
        messages,
    })
}

pub(crate) fn resolve_phits_root(
    workspace_root: Option<&Path>,
    messages: &mut Vec<String>,
) -> Option<PathBuf> {
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
                            Ok(root) => return Some(root),
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

    match env::var_os("PHITSPATH") {
        Some(value) if !value.is_empty() => match canonical_phits_root(Path::new(&value)) {
            Ok(root) => Some(root),
            Err(error) => {
                messages.push(format!("環境変数PHITSPATHを利用できません: {error}"));
                None
            }
        },
        _ => None,
    }
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
    let output = match Command::new("codex").arg("--version").output() {
        Ok(output) => output,
        Err(error) => {
            messages.push(format!(
                "Codex CLIを起動できません。編集とPHITS実行は引き続き利用できます: {error}"
            ));
            return (None, None, false);
        }
    };
    if !output.status.success() {
        messages
            .push("Codex CLIのバージョン確認に失敗しました。Codex機能だけを無効化します。".into());
        return (Some("codex".into()), None, false);
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    let version = parse_semver(&text);
    let compatible = version
        .as_ref()
        .is_some_and(|version| *version >= VERIFIED_CODEX_VERSION);
    if let Some(parsed) = version {
        if parsed > VERIFIED_CODEX_VERSION {
            messages.push("Codex CLIは検証基準0.153.1より新しいため未検証です。".into());
        } else if parsed < VERIFIED_CODEX_VERSION {
            messages.push("Codex CLIが0.153.1より古いためCodex機能を無効化します。".into());
        }
    } else {
        messages.push("Codex CLIのバージョンを解釈できません。Codex機能を無効化します。".into());
    }
    (Some("codex".into()), Some(text), compatible)
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
}
