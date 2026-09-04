use std::{
    collections::HashSet,
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
};

use tauri::{AppHandle, Emitter};

use crate::{
    contracts::WorkspaceInfo,
    error::{AppError, AppResult},
};

const EDITOR_METADATA_DIRECTORY: &str = ".phits-editor";

#[tauri::command]
pub fn workspace_open(app: AppHandle, path: String) -> AppResult<WorkspaceInfo> {
    let info = inspect_workspace(path)?;
    if let Ok(Some(status)) = crate::runner::restore_last_run(&info.root) {
        let _ = app.emit("phits://state", status);
    }
    Ok(info)
}

pub fn inspect_workspace(path: String) -> AppResult<WorkspaceInfo> {
    let root = canonical_workspace_root(Path::new(&path))?;
    let mut candidate_inputs = Vec::new();

    for entry in fs::read_dir(&root)? {
        let entry = entry?;
        if is_primary_input(&entry.path()) {
            let canonical = dunce::canonicalize(entry.path()).map_err(|error| {
                AppError::Message(format!(
                    "主入力候補を検証できません ({}): {error}",
                    entry.path().display()
                ))
            })?;
            ensure_under_root(&root, &canonical)?;
            if !canonical.is_file() {
                continue;
            }
            candidate_inputs.push(path_to_string(Path::new(&entry.file_name())));
        }
    }
    sort_paths(&mut candidate_inputs);

    if candidate_inputs.len() > 1 {
        return Err(AppError::Message(format!(
            "ワークスペース直下に複数のPHITS入力があります。MVPでは主入力は1件だけです: {}",
            candidate_inputs.join(", ")
        )));
    }

    let mut auxiliary_files = Vec::new();
    let mut visited_directories = HashSet::new();
    visited_directories.insert(root.clone());
    collect_auxiliary_files(&root, &root, &mut auxiliary_files, &mut visited_directories)?;
    sort_paths(&mut auxiliary_files);

    Ok(WorkspaceInfo {
        root: path_to_string(&root),
        primary_input: candidate_inputs.first().cloned(),
        candidate_inputs,
        auxiliary_files,
        writable: !fs::metadata(&root)?.permissions().readonly(),
    })
}

pub(crate) fn canonical_workspace_root(root: &Path) -> AppResult<PathBuf> {
    if root.as_os_str().is_empty() {
        return Err(AppError::Message(
            "ワークスペースのパスが空です。".to_owned(),
        ));
    }

    let canonical = dunce::canonicalize(root).map_err(|error| {
        AppError::Message(format!(
            "ワークスペースを開けません ({}): {error}",
            root.display()
        ))
    })?;
    if !canonical.is_dir() {
        return Err(AppError::Message(format!(
            "ワークスペースはフォルダーである必要があります: {}",
            canonical.display()
        )));
    }
    Ok(canonical)
}

pub(crate) fn validate_relative_path(relative: &Path) -> AppResult<()> {
    if relative.as_os_str().is_empty() || relative.is_absolute() {
        return Err(AppError::Message(
            "文書パスには空でない相対パスを指定してください。".to_owned(),
        ));
    }

    for component in relative.components() {
        match component {
            Component::Normal(value) =>
            {
                #[cfg(windows)]
                if value.to_string_lossy().contains(':') {
                    return Err(AppError::Message(
                        "文書パスにWindowsの代替データストリームは使用できません。".to_owned(),
                    ));
                }
            }
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(AppError::Message(format!(
                    "ワークスペース外を参照する文書パスは使用できません: {}",
                    relative.display()
                )));
            }
        }
    }
    Ok(())
}

pub(crate) fn resolve_existing_path(root: &Path, relative: &Path) -> AppResult<PathBuf> {
    validate_relative_path(relative)?;
    let target = dunce::canonicalize(root.join(relative)).map_err(|error| {
        AppError::Message(format!(
            "文書を開けません ({}): {error}",
            relative.display()
        ))
    })?;
    ensure_under_root(root, &target)?;
    if !target.is_file() {
        return Err(AppError::Message(format!(
            "文書パスはファイルではありません: {}",
            relative.display()
        )));
    }
    Ok(target)
}

pub(crate) fn resolve_save_path(root: &Path, relative: &Path) -> AppResult<PathBuf> {
    validate_relative_path(relative)?;
    let requested = root.join(relative);
    if requested.exists() {
        return resolve_existing_path(root, relative);
    }

    let file_name = requested
        .file_name()
        .ok_or_else(|| AppError::Message(format!("無効な文書パスです: {}", relative.display())))?;
    let parent = requested
        .parent()
        .ok_or_else(|| AppError::Message(format!("無効な文書パスです: {}", relative.display())))?;
    let canonical_parent = dunce::canonicalize(parent).map_err(|error| {
        AppError::Message(format!(
            "文書の親フォルダーを開けません ({}): {error}",
            relative.display()
        ))
    })?;
    ensure_under_root(root, &canonical_parent)?;
    if !canonical_parent.is_dir() {
        return Err(AppError::Message(format!(
            "文書の親パスはフォルダーではありません: {}",
            relative.display()
        )));
    }
    Ok(canonical_parent.join(file_name))
}

pub(crate) fn ensure_primary_save_allowed(root: &Path, relative: &Path) -> AppResult<()> {
    let normal_component_count = relative
        .components()
        .filter(|component| matches!(component, Component::Normal(_)))
        .count();
    if normal_component_count != 1 || !is_primary_input(relative) {
        return Ok(());
    }

    let mut conflicts = Vec::new();
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        if !is_primary_input(&entry.path()) {
            continue;
        }
        let canonical = dunce::canonicalize(entry.path())?;
        ensure_under_root(root, &canonical)?;
        let is_requested_file = relative
            .file_name()
            .is_some_and(|requested| file_names_equal(&entry.file_name(), requested));
        if !is_requested_file {
            conflicts.push(path_to_string(Path::new(&entry.file_name())));
        }
    }
    sort_paths(&mut conflicts);
    if conflicts.is_empty() {
        Ok(())
    } else {
        Err(AppError::Message(format!(
            "主入力が既に存在するため、2件目のPHITS入力を保存できません: {}",
            conflicts.join(", ")
        )))
    }
}

fn ensure_under_root(root: &Path, target: &Path) -> AppResult<()> {
    if !target.starts_with(root) {
        return Err(AppError::Message(format!(
            "ワークスペース外のパスにはアクセスできません: {}",
            target.display()
        )));
    }
    Ok(())
}

fn collect_auxiliary_files(
    root: &Path,
    directory: &Path,
    output: &mut Vec<String>,
    visited_directories: &mut HashSet<PathBuf>,
) -> AppResult<()> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        let relative = path.strip_prefix(root).map_err(|_| {
            AppError::Message(format!(
                "ワークスペース内の相対パスを取得できません: {}",
                path.display()
            ))
        })?;

        if relative.components().next().is_some_and(|component| {
            component
                .as_os_str()
                .to_string_lossy()
                .eq_ignore_ascii_case(EDITOR_METADATA_DIRECTORY)
        }) {
            continue;
        }

        let file_type = entry.file_type()?;
        if file_type.is_dir() || file_type.is_symlink() {
            let Ok(canonical) = dunce::canonicalize(&path) else {
                continue;
            };
            if !canonical.starts_with(root) {
                continue;
            }
            if canonical.is_dir() {
                if visited_directories.insert(canonical) {
                    collect_auxiliary_files(root, &path, output, visited_directories)?;
                }
            } else if canonical.is_file()
                && !is_direct_primary(root, &path)
                && is_probably_text_file(&canonical)
            {
                output.push(path_to_string(relative));
            }
        } else if file_type.is_file()
            && !is_direct_primary(root, &path)
            && is_probably_text_file(&path)
        {
            output.push(path_to_string(relative));
        }
    }
    Ok(())
}

fn is_direct_primary(root: &Path, path: &Path) -> bool {
    path.parent() == Some(root) && is_primary_input(path)
}

fn is_primary_input(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("inp") || extension.eq_ignore_ascii_case("pht")
        })
}

#[cfg(windows)]
fn file_names_equal(left: &std::ffi::OsStr, right: &std::ffi::OsStr) -> bool {
    left.to_string_lossy()
        .eq_ignore_ascii_case(&right.to_string_lossy())
}

#[cfg(not(windows))]
fn file_names_equal(left: &std::ffi::OsStr, right: &std::ffi::OsStr) -> bool {
    left == right
}

fn is_probably_text_file(path: &Path) -> bool {
    const SAMPLE_LIMIT: u64 = 64 * 1024;

    let Ok(file) = fs::File::open(path) else {
        return false;
    };
    let mut sample = Vec::new();
    if file.take(SAMPLE_LIMIT).read_to_end(&mut sample).is_err() || sample.contains(&0) {
        return false;
    }
    let without_bom = sample
        .strip_prefix(b"\xEF\xBB\xBF")
        .unwrap_or(sample.as_slice());
    if std::str::from_utf8(without_bom).is_ok() {
        return true;
    }
    let (_, _, had_errors) = encoding_rs::SHIFT_JIS.decode(without_bom);
    !had_errors
}

fn sort_paths(paths: &mut [String]) {
    paths.sort_by_cached_key(|path| path.to_lowercase());
}

pub(crate) fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::*;

    #[test]
    fn accepts_zero_or_one_primary_input_and_lists_auxiliary_files() {
        let directory = tempdir().unwrap();
        fs::write(directory.path().join("geometry.inc"), "cell data").unwrap();
        fs::write(directory.path().join("binary.bin"), b"abc\0def").unwrap();
        fs::create_dir(directory.path().join("parts")).unwrap();
        fs::write(directory.path().join("parts").join("nested.INP"), "include").unwrap();

        let empty = inspect_workspace(path_to_string(directory.path())).unwrap();
        assert_eq!(empty.primary_input, None);
        assert!(empty.candidate_inputs.is_empty());
        assert_eq!(empty.auxiliary_files.len(), 2);
        assert!(
            !empty
                .auxiliary_files
                .iter()
                .any(|path| path == "binary.bin")
        );

        fs::write(directory.path().join("Main.InP"), "[Parameters]").unwrap();
        let one = inspect_workspace(path_to_string(directory.path())).unwrap();
        assert_eq!(one.primary_input.as_deref(), Some("Main.InP"));
        assert_eq!(one.candidate_inputs, ["Main.InP"]);
        assert!(!one.auxiliary_files.iter().any(|path| path == "Main.InP"));
    }

    #[test]
    fn rejects_multiple_primary_inputs_and_lists_them() {
        let directory = tempdir().unwrap();
        fs::write(directory.path().join("b.PHT"), "").unwrap();
        fs::write(directory.path().join("A.inp"), "").unwrap();

        let error = inspect_workspace(path_to_string(directory.path())).unwrap_err();
        let message = error.to_string();
        assert!(message.contains("A.inp"));
        assert!(message.contains("b.PHT"));
    }

    #[test]
    fn rejects_traversal_and_absolute_document_paths() {
        assert!(validate_relative_path(Path::new("../outside.inp")).is_err());
        assert!(validate_relative_path(Path::new("a/../../outside.inp")).is_err());
        assert!(validate_relative_path(Path::new("C:\\outside.inp")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_that_resolves_outside_workspace() {
        use std::os::unix::fs::symlink;

        let directory = tempdir().unwrap();
        let outside = tempdir().unwrap();
        fs::write(outside.path().join("outside.txt"), "secret").unwrap();
        symlink(
            outside.path().join("outside.txt"),
            directory.path().join("link.txt"),
        )
        .unwrap();

        let root = canonical_workspace_root(directory.path()).unwrap();
        assert!(resolve_existing_path(&root, Path::new("link.txt")).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn rejects_windows_link_that_resolves_outside_workspace_when_links_are_available() {
        use std::os::windows::fs::symlink_file;

        let directory = tempdir().unwrap();
        let outside = tempdir().unwrap();
        fs::write(outside.path().join("outside.txt"), "secret").unwrap();
        if symlink_file(
            outside.path().join("outside.txt"),
            directory.path().join("link.txt"),
        )
        .is_err()
        {
            // Creating symbolic links requires Developer Mode or a platform
            // privilege on some Windows installations.
            return;
        }

        let root = canonical_workspace_root(directory.path()).unwrap();
        assert!(resolve_existing_path(&root, Path::new("link.txt")).is_err());
    }
}
