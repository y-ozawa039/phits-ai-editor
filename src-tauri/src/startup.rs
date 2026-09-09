use std::{ffi::OsString, path::Path};

use tauri::State;
use uuid::Uuid;

use crate::{
    contracts::{StartupOpenKind, StartupOpenRequest},
    error::{AppError, AppResult},
    state::AppState,
    workspace::path_to_string,
};

pub const EVENT_OPEN_REQUEST: &str = "startup://open-request";

fn is_supported_input(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("inp") || extension.eq_ignore_ascii_case("pht")
        })
}

pub fn resolve_open_target(path: &Path, cwd: &Path) -> AppResult<StartupOpenRequest> {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        cwd.join(path)
    };
    let canonical = dunce::canonicalize(&absolute).map_err(|error| {
        AppError::Message(format!(
            "起動対象を開けません ({}): {error}",
            absolute.display()
        ))
    })?;

    if canonical.is_dir() {
        let display = path_to_string(&canonical);
        return Ok(StartupOpenRequest {
            id: Uuid::new_v4().to_string(),
            kind: StartupOpenKind::Folder,
            path: display.clone(),
            workspace_root: display,
            relative_path: None,
        });
    }
    if !canonical.is_file() {
        return Err(AppError::Message(format!(
            "起動対象はファイルまたはフォルダーではありません: {}",
            canonical.display()
        )));
    }
    if !is_supported_input(&canonical) {
        return Err(AppError::Message(format!(
            "直接起動できるファイルは.inpまたは.phtです: {}",
            canonical.display()
        )));
    }

    let parent = canonical
        .parent()
        .ok_or_else(|| AppError::Message("起動対象の親フォルダーがありません。".to_owned()))?;
    let file_name = canonical
        .file_name()
        .ok_or_else(|| AppError::Message("起動対象のファイル名がありません。".to_owned()))?;
    Ok(StartupOpenRequest {
        id: Uuid::new_v4().to_string(),
        kind: StartupOpenKind::File,
        path: path_to_string(&canonical),
        workspace_root: path_to_string(parent),
        relative_path: Some(path_to_string(Path::new(file_name))),
    })
}

pub fn requests_from_os_args(
    args: impl IntoIterator<Item = OsString>,
    cwd: &Path,
) -> Vec<StartupOpenRequest> {
    args.into_iter()
        .skip(1)
        .filter_map(|value| resolve_open_target(Path::new(&value), cwd).ok())
        .collect()
}

pub fn requests_from_strings(args: &[String], cwd: &str) -> Vec<StartupOpenRequest> {
    requests_from_os_args(args.iter().map(OsString::from), Path::new(cwd))
}

#[tauri::command]
pub fn startup_take_open_requests(state: State<'_, AppState>) -> Vec<StartupOpenRequest> {
    state.take_open_requests()
}

#[tauri::command]
pub fn startup_resolve_open_target(path: String) -> AppResult<StartupOpenRequest> {
    let cwd = std::env::current_dir()?;
    resolve_open_target(Path::new(&path), &cwd)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::*;

    #[test]
    fn resolves_input_file_to_its_parent_workspace() {
        let directory = tempdir().unwrap();
        let input = directory.path().join("Case.InP");
        fs::write(&input, "[ End ]").unwrap();

        let request = resolve_open_target(&input, directory.path()).unwrap();
        assert_eq!(request.kind, StartupOpenKind::File);
        assert_eq!(
            request.workspace_root,
            path_to_string(&dunce::canonicalize(directory.path()).unwrap())
        );
        assert_eq!(request.relative_path.as_deref(), Some("Case.InP"));
    }

    #[test]
    fn resolves_relative_arguments_and_ignores_the_executable() {
        let directory = tempdir().unwrap();
        fs::write(directory.path().join("main.pht"), "[ End ]").unwrap();
        let requests = requests_from_os_args(
            [OsString::from("editor.exe"), OsString::from("main.pht")],
            directory.path(),
        );
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].relative_path.as_deref(), Some("main.pht"));
    }

    #[test]
    fn rejects_non_phits_files_and_missing_targets() {
        let directory = tempdir().unwrap();
        let text = directory.path().join("notes.txt");
        fs::write(&text, "notes").unwrap();
        assert!(resolve_open_target(&text, directory.path()).is_err());
        assert!(
            resolve_open_target(&directory.path().join("missing.inp"), directory.path()).is_err()
        );
    }
}
