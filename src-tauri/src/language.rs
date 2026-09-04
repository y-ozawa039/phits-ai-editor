use std::{env, fs, path::PathBuf};

use serde_json::Value;

use crate::error::{AppError, AppResult};

const MAX_LANGUAGE_SPEC_BYTES: u64 = 8 * 1024 * 1024;

#[tauri::command]
pub fn language_spec_load(phits_root: Option<String>) -> AppResult<Value> {
    let root = phits_root
        .or_else(|| env::var("PHITSPATH").ok())
        .map(PathBuf::from)
        .ok_or_else(|| AppError::Message("PHITSPATH is not configured".into()))?;
    let root = dunce::canonicalize(root)?;
    let path = root
        .join("workbench")
        .join("language_support")
        .join("data")
        .join("phits-spec.json");
    let metadata = fs::metadata(&path).map_err(|error| {
        AppError::Message(format!(
            "PHITS language specification was not found: {error}"
        ))
    })?;
    if metadata.len() > MAX_LANGUAGE_SPEC_BYTES {
        return Err(AppError::Message(
            "PHITS language specification exceeds the 8 MiB safety limit".into(),
        ));
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_explicit_root_is_an_error() {
        let result = language_spec_load(Some("Z:\\missing-phits-root".into()));
        assert!(result.is_err());
    }
}
