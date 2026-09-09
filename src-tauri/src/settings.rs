use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::{
    contracts::PhitsAppSettings,
    diagnostics::validate_configured_phits_root,
    error::{AppError, AppResult},
};

const SETTINGS_FILE: &str = "phits-settings.json";

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StoredSettings {
    #[serde(default = "settings_schema_version")]
    schema_version: u32,
    #[serde(default)]
    phits_root: Option<String>,
}

const fn settings_schema_version() -> u32 {
    1
}

fn settings_path(app: &AppHandle) -> AppResult<PathBuf> {
    app.path()
        .app_config_dir()
        .map(|path| path.join(SETTINGS_FILE))
        .map_err(|error| {
            AppError::Message(format!("アプリ設定フォルダーを取得できません: {error}"))
        })
}

fn read_stored_settings(app: &AppHandle) -> AppResult<StoredSettings> {
    let path = settings_path(app)?;
    if !path.is_file() {
        return Ok(StoredSettings {
            schema_version: settings_schema_version(),
            phits_root: None,
        });
    }
    let bytes = fs::read(&path)?;
    serde_json::from_slice(&bytes)
        .map_err(|error| AppError::Message(format!("PHITS実行環境の設定を読み取れません: {error}")))
}

pub(crate) fn app_phits_root(app: &AppHandle) -> AppResult<Option<PathBuf>> {
    Ok(read_stored_settings(app)?.phits_root.map(PathBuf::from))
}

#[tauri::command]
pub fn phits_settings_get(app: AppHandle) -> AppResult<PhitsAppSettings> {
    let stored = read_stored_settings(&app)?;
    Ok(PhitsAppSettings {
        phits_root: stored.phits_root,
    })
}

#[tauri::command]
pub fn phits_settings_set(
    app: AppHandle,
    phits_root: Option<String>,
) -> AppResult<PhitsAppSettings> {
    let normalized = match phits_root
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(value) => Some(
            validate_configured_phits_root(Path::new(value))?
                .to_string_lossy()
                .into_owned(),
        ),
        None => None,
    };
    let path = settings_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let stored = StoredSettings {
        schema_version: settings_schema_version(),
        phits_root: normalized.clone(),
    };
    fs::write(&path, serde_json::to_vec_pretty(&stored)?)?;
    Ok(PhitsAppSettings {
        phits_root: normalized,
    })
}
