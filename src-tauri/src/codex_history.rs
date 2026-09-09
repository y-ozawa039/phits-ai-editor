use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    documents::{
        atomic_write, create_one_generation_backup, create_one_generation_backup_from_bytes,
        decode_text, secure_create_directories,
    },
    error::{AppError, AppResult},
    workspace::{
        canonical_workspace_root, path_to_string, resolve_existing_path, resolve_save_path,
        validate_relative_path,
    },
};

const HISTORY_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexHistoryChangeInput {
    pub path: String,
    pub after_path: Option<String>,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexHistoryFileV1 {
    pub relative_path: String,
    pub after_relative_path: String,
    pub kind: String,
    pub before_existed: bool,
    pub after_existed: Option<bool>,
    pub before_sha256: Option<String>,
    pub after_sha256: Option<String>,
    pub snapshot_index: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexChangeHistoryEntryV1 {
    pub schema_version: u32,
    pub history_id: String,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub reverted_at: Option<String>,
    pub status: String,
    #[serde(default = "legacy_review_state")]
    pub review_state: String,
    #[serde(default)]
    pub reviewed_at: Option<String>,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
    pub item_id: Option<String>,
    pub files: Vec<CodexHistoryFileV1>,
}

fn legacy_review_state() -> String {
    "reviewed".to_owned()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexChangeGroupV1 {
    pub group_id: String,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
    pub created_at: String,
    pub review_state: String,
    pub history_ids: Vec<String>,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexHistoryPreviewFile {
    pub path: String,
    pub after_path: String,
    pub kind: String,
    pub original: String,
    pub modified: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexHistoryPreview {
    pub history_id: String,
    pub created_at: String,
    pub status: String,
    pub files: Vec<CodexHistoryPreviewFile>,
}

fn hash_bytes(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn history_root(root: &Path) -> AppResult<PathBuf> {
    let requested = root.join(".phits-editor").join("codex").join("changes");
    secure_create_directories(root, &requested)
}

fn history_directory(root: &Path, history_id: &str) -> AppResult<PathBuf> {
    Uuid::parse_str(history_id)
        .map_err(|_| AppError::Message("Codex変更履歴IDが不正です。".to_owned()))?;
    let directory = history_root(root)?.join(history_id);
    let canonical = dunce::canonicalize(&directory)
        .map_err(|error| AppError::Message(format!("Codex変更履歴を開けません: {error}")))?;
    if !canonical.starts_with(root) || !canonical.is_dir() {
        return Err(AppError::Message(
            "Codex変更履歴がワークスペース外を参照しています。".to_owned(),
        ));
    }
    Ok(canonical)
}

fn manifest_path(directory: &Path) -> PathBuf {
    directory.join("manifest.json")
}

fn read_manifest(root: &Path, history_id: &str) -> AppResult<(PathBuf, CodexChangeHistoryEntryV1)> {
    let directory = history_directory(root, history_id)?;
    let manifest: CodexChangeHistoryEntryV1 =
        serde_json::from_slice(&fs::read(manifest_path(&directory))?)?;
    if manifest.schema_version != HISTORY_SCHEMA_VERSION || manifest.history_id != history_id {
        return Err(AppError::Message(
            "Codex変更履歴の形式が一致しません。".to_owned(),
        ));
    }
    Ok((directory, manifest))
}

fn write_manifest(directory: &Path, manifest: &CodexChangeHistoryEntryV1) -> AppResult<()> {
    atomic_write(
        &manifest_path(directory),
        &serde_json::to_vec_pretty(manifest)?,
    )
}

fn snapshot_path(directory: &Path, index: usize, name: &str) -> PathBuf {
    directory
        .join("files")
        .join(format!("{index:04}"))
        .join(name)
}

fn read_existing_bytes(root: &Path, relative: &Path) -> AppResult<Option<Vec<u8>>> {
    let requested = root.join(relative);
    if !requested.exists() {
        return Ok(None);
    }
    let target = resolve_existing_path(root, relative)?;
    Ok(Some(fs::read(target)?))
}

#[tauri::command]
pub fn codex_change_history_begin(
    workspace_root: String,
    thread_id: Option<String>,
    turn_id: Option<String>,
    item_id: Option<String>,
    changes: Vec<CodexHistoryChangeInput>,
) -> AppResult<String> {
    if changes.is_empty() {
        return Err(AppError::Message(
            "履歴へ保存するCodex変更がありません。".to_owned(),
        ));
    }
    let root = canonical_workspace_root(Path::new(&workspace_root))?;
    let history_id = Uuid::new_v4().to_string();
    let directory = secure_create_directories(&root, &history_root(&root)?.join(&history_id))?;
    let files_root = secure_create_directories(&root, &directory.join("files"))?;
    let mut files = Vec::with_capacity(changes.len());

    for (index, change) in changes.into_iter().enumerate() {
        let relative = Path::new(&change.path);
        let after_relative = Path::new(change.after_path.as_deref().unwrap_or(&change.path));
        validate_relative_path(relative)?;
        validate_relative_path(after_relative)?;
        let file_directory =
            secure_create_directories(&root, &files_root.join(format!("{index:04}")))?;
        let before = if change.kind.eq_ignore_ascii_case("add") {
            None
        } else {
            read_existing_bytes(&root, relative)?
        };
        if let Some(bytes) = before.as_deref() {
            atomic_write(&file_directory.join("before.bin"), bytes)?;
            create_one_generation_backup_from_bytes(&root, relative, bytes)?;
        }
        files.push(CodexHistoryFileV1 {
            relative_path: path_to_string(relative),
            after_relative_path: path_to_string(after_relative),
            kind: change.kind,
            before_existed: before.is_some(),
            after_existed: None,
            before_sha256: before.as_deref().map(hash_bytes),
            after_sha256: None,
            snapshot_index: index,
        });
    }

    let manifest = CodexChangeHistoryEntryV1 {
        schema_version: HISTORY_SCHEMA_VERSION,
        history_id: history_id.clone(),
        created_at: Utc::now().to_rfc3339(),
        completed_at: None,
        reverted_at: None,
        status: "pending".to_owned(),
        review_state: "pendingReview".to_owned(),
        reviewed_at: None,
        thread_id,
        turn_id,
        item_id,
        files,
    };
    write_manifest(&directory, &manifest)?;
    Ok(history_id)
}

fn group_key(manifest: &CodexChangeHistoryEntryV1) -> String {
    match (&manifest.thread_id, &manifest.turn_id) {
        (Some(thread), Some(turn)) => format!("turn:{thread}:{turn}"),
        (_, Some(turn)) => format!("turn:{turn}"),
        _ => format!("history:{}", manifest.history_id),
    }
}

#[tauri::command]
pub fn codex_change_history_list_groups(
    workspace_root: String,
) -> AppResult<Vec<CodexChangeGroupV1>> {
    let entries = codex_change_history_list(workspace_root)?;
    let mut groups: Vec<CodexChangeGroupV1> = Vec::new();
    for entry in entries
        .into_iter()
        .rev()
        .filter(|entry| entry.status == "completed" || entry.status == "reverted")
    {
        let key = group_key(&entry);
        if let Some(group) = groups.iter_mut().find(|group| group.group_id == key) {
            group.created_at = entry.created_at.clone();
            group.history_ids.push(entry.history_id.clone());
            for file in &entry.files {
                if !group.files.contains(&file.after_relative_path) {
                    group.files.push(file.after_relative_path.clone());
                }
            }
            if entry.status == "reverted" || entry.review_state == "reverted" {
                group.review_state = "reverted".to_owned();
            } else if entry.review_state == "pendingReview" && group.review_state != "reverted" {
                group.review_state = "pendingReview".to_owned();
            }
            continue;
        }
        groups.push(CodexChangeGroupV1 {
            group_id: key,
            thread_id: entry.thread_id.clone(),
            turn_id: entry.turn_id.clone(),
            created_at: entry.created_at.clone(),
            review_state: if entry.status == "reverted" {
                "reverted".to_owned()
            } else {
                entry.review_state.clone()
            },
            history_ids: vec![entry.history_id.clone()],
            files: entry
                .files
                .iter()
                .map(|file| file.after_relative_path.clone())
                .collect(),
        });
    }
    groups.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(groups)
}

fn validated_history_ids(history_ids: &[String]) -> AppResult<()> {
    if history_ids.is_empty() {
        return Err(AppError::Message(
            "Codex変更履歴が指定されていません。".to_owned(),
        ));
    }
    let mut unique = HashSet::new();
    for id in history_ids {
        Uuid::parse_str(id)
            .map_err(|_| AppError::Message("Codex変更履歴IDが不正です。".to_owned()))?;
        if !unique.insert(id) {
            return Err(AppError::Message(
                "同じCodex変更履歴が重複しています。".to_owned(),
            ));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn codex_change_history_mark_reviewed(
    workspace_root: String,
    history_ids: Vec<String>,
) -> AppResult<Vec<CodexChangeHistoryEntryV1>> {
    validated_history_ids(&history_ids)?;
    let root = canonical_workspace_root(Path::new(&workspace_root))?;
    let now = Utc::now().to_rfc3339();
    let manifests = history_ids
        .iter()
        .map(|id| read_manifest(&root, id))
        .collect::<AppResult<Vec<_>>>()?;
    if manifests
        .iter()
        .any(|(_, manifest)| manifest.status != "completed")
    {
        return Err(AppError::Message(
            "完了していないCodex変更は確認済みにできません。".to_owned(),
        ));
    }
    let mut updated = Vec::with_capacity(history_ids.len());
    for (directory, mut manifest) in manifests {
        manifest.review_state = "reviewed".to_owned();
        manifest.reviewed_at = Some(now.clone());
        write_manifest(&directory, &manifest)?;
        updated.push(manifest);
    }
    Ok(updated)
}

#[tauri::command]
pub fn codex_change_history_complete(
    workspace_root: String,
    history_id: String,
) -> AppResult<CodexChangeHistoryEntryV1> {
    let root = canonical_workspace_root(Path::new(&workspace_root))?;
    let (directory, mut manifest) = read_manifest(&root, &history_id)?;
    if manifest.status != "pending" {
        return Ok(manifest);
    }
    for file in &mut manifest.files {
        let bytes = read_existing_bytes(&root, Path::new(&file.after_relative_path))?;
        if let Some(bytes) = bytes.as_deref() {
            atomic_write(
                &snapshot_path(&directory, file.snapshot_index, "after.bin"),
                bytes,
            )?;
        }
        file.after_existed = Some(bytes.is_some());
        file.after_sha256 = bytes.as_deref().map(hash_bytes);
    }
    manifest.status = "completed".to_owned();
    manifest.completed_at = Some(Utc::now().to_rfc3339());
    write_manifest(&directory, &manifest)?;
    Ok(manifest)
}

#[tauri::command]
pub fn codex_change_history_abort(workspace_root: String, history_id: String) -> AppResult<()> {
    let root = canonical_workspace_root(Path::new(&workspace_root))?;
    let (directory, mut manifest) = read_manifest(&root, &history_id)?;
    if manifest.status == "pending" {
        manifest.status = "aborted".to_owned();
        manifest.completed_at = Some(Utc::now().to_rfc3339());
        write_manifest(&directory, &manifest)?;
    }
    Ok(())
}

#[tauri::command]
pub fn codex_change_history_list(
    workspace_root: String,
) -> AppResult<Vec<CodexChangeHistoryEntryV1>> {
    let root = canonical_workspace_root(Path::new(&workspace_root))?;
    let requested = root.join(".phits-editor").join("codex").join("changes");
    if !requested.exists() {
        return Ok(Vec::new());
    }
    let directory = dunce::canonicalize(&requested)?;
    if !directory.starts_with(&root) || !directory.is_dir() {
        return Err(AppError::Message(
            "Codex変更履歴フォルダーが不正です。".to_owned(),
        ));
    }
    let mut entries = Vec::new();
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let id = entry.file_name().to_string_lossy().into_owned();
        if let Ok((_, manifest)) = read_manifest(&root, &id) {
            entries.push(manifest);
        }
    }
    entries.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(entries)
}

#[tauri::command]
pub fn codex_change_history_preview(
    workspace_root: String,
    history_id: String,
) -> AppResult<CodexHistoryPreview> {
    let root = canonical_workspace_root(Path::new(&workspace_root))?;
    let (directory, manifest) = read_manifest(&root, &history_id)?;
    let mut files = Vec::with_capacity(manifest.files.len());
    for file in &manifest.files {
        let before = if file.before_existed {
            fs::read(snapshot_path(&directory, file.snapshot_index, "before.bin"))?
        } else {
            Vec::new()
        };
        let after = if file.after_existed == Some(true) {
            fs::read(snapshot_path(&directory, file.snapshot_index, "after.bin"))?
        } else {
            Vec::new()
        };
        let original = if before.is_empty() && !file.before_existed {
            String::new()
        } else {
            decode_text(&before)?.0
        };
        let modified = if after.is_empty() && file.after_existed != Some(true) {
            String::new()
        } else {
            decode_text(&after)?.0
        };
        files.push(CodexHistoryPreviewFile {
            path: file.relative_path.clone(),
            after_path: file.after_relative_path.clone(),
            kind: file.kind.clone(),
            original,
            modified,
        });
    }
    Ok(CodexHistoryPreview {
        history_id,
        created_at: manifest.created_at,
        status: manifest.status,
        files,
    })
}

fn load_group_manifests(
    root: &Path,
    history_ids: &[String],
) -> AppResult<Vec<(PathBuf, CodexChangeHistoryEntryV1)>> {
    validated_history_ids(history_ids)?;
    let mut manifests = history_ids
        .iter()
        .map(|id| read_manifest(root, id))
        .collect::<AppResult<Vec<_>>>()?;
    manifests.sort_by(|left, right| left.1.created_at.cmp(&right.1.created_at));
    let expected_group = group_key(&manifests[0].1);
    if manifests
        .iter()
        .any(|(_, manifest)| group_key(manifest) != expected_group)
    {
        return Err(AppError::Message(
            "異なるCodexターンの変更履歴を同時には扱えません。".to_owned(),
        ));
    }
    Ok(manifests)
}

#[tauri::command]
pub fn codex_change_history_preview_group(
    workspace_root: String,
    history_ids: Vec<String>,
) -> AppResult<CodexHistoryPreview> {
    let root = canonical_workspace_root(Path::new(&workspace_root))?;
    let manifests = load_group_manifests(&root, &history_ids)?;
    let mut files: Vec<CodexHistoryPreviewFile> = Vec::new();

    for (directory, manifest) in &manifests {
        for file in &manifest.files {
            let before = if file.before_existed {
                fs::read(snapshot_path(directory, file.snapshot_index, "before.bin"))?
            } else {
                Vec::new()
            };
            let after = if file.after_existed == Some(true) {
                fs::read(snapshot_path(directory, file.snapshot_index, "after.bin"))?
            } else {
                Vec::new()
            };
            let original = if file.before_existed {
                decode_text(&before)?.0
            } else {
                String::new()
            };
            let modified = if file.after_existed == Some(true) {
                decode_text(&after)?.0
            } else {
                String::new()
            };
            if let Some(existing) = files
                .iter_mut()
                .find(|entry| entry.path == file.relative_path)
            {
                existing.after_path = file.after_relative_path.clone();
                existing.kind = file.kind.clone();
                existing.modified = modified;
            } else {
                files.push(CodexHistoryPreviewFile {
                    path: file.relative_path.clone(),
                    after_path: file.after_relative_path.clone(),
                    kind: file.kind.clone(),
                    original,
                    modified,
                });
            }
        }
    }

    let review_state = if manifests
        .iter()
        .all(|(_, entry)| entry.status == "reverted")
    {
        "reverted"
    } else if manifests
        .iter()
        .any(|(_, entry)| entry.review_state == "pendingReview")
    {
        "pendingReview"
    } else {
        "reviewed"
    };
    Ok(CodexHistoryPreview {
        history_id: group_key(&manifests[0].1),
        created_at: manifests
            .last()
            .expect("group is non-empty")
            .1
            .created_at
            .clone(),
        status: review_state.to_owned(),
        files,
    })
}

#[tauri::command]
pub fn codex_change_history_revert(
    workspace_root: String,
    history_id: String,
) -> AppResult<CodexChangeHistoryEntryV1> {
    codex_change_history_revert_group(workspace_root.clone(), vec![history_id.clone()])?;
    let root = canonical_workspace_root(Path::new(&workspace_root))?;
    let (_, manifest) = read_manifest(&root, &history_id)?;
    Ok(manifest)
}

fn write_optional_bytes(root: &Path, relative: &str, bytes: Option<&[u8]>) -> AppResult<()> {
    let relative_path = Path::new(relative);
    validate_relative_path(relative_path)?;
    match bytes {
        Some(bytes) => {
            let target = resolve_save_path(root, relative_path)?;
            atomic_write(&target, bytes)
        }
        None => {
            if root.join(relative_path).exists() {
                let target = resolve_existing_path(root, relative_path)?;
                fs::remove_file(target)?;
            }
            Ok(())
        }
    }
}

#[tauri::command]
pub fn codex_change_history_revert_group(
    workspace_root: String,
    history_ids: Vec<String>,
) -> AppResult<Vec<CodexChangeHistoryEntryV1>> {
    let root = canonical_workspace_root(Path::new(&workspace_root))?;
    let mut manifests = load_group_manifests(&root, &history_ids)?;
    if manifests
        .iter()
        .any(|(_, manifest)| manifest.status != "completed")
    {
        return Err(AppError::Message(
            "このCodex変更グループは元に戻せる状態ではありません。".to_owned(),
        ));
    }

    let mut touched = Vec::<String>::new();
    for (_, manifest) in &manifests {
        for file in &manifest.files {
            for path in [&file.relative_path, &file.after_relative_path] {
                validate_relative_path(Path::new(path))?;
                if !touched.contains(path) {
                    touched.push((*path).clone());
                }
            }
        }
    }
    let initial = touched
        .iter()
        .map(|path| Ok((path.clone(), read_existing_bytes(&root, Path::new(path))?)))
        .collect::<AppResult<HashMap<_, _>>>()?;
    let mut desired = initial.clone();

    // Simulate every history backwards before touching the workspace. This is
    // what makes a multi-patch turn an all-or-nothing restore operation.
    for (directory, manifest) in manifests.iter().rev() {
        for file in manifest.files.iter().rev() {
            let expected_after = if file.after_existed == Some(true) {
                Some(fs::read(snapshot_path(
                    directory,
                    file.snapshot_index,
                    "after.bin",
                ))?)
            } else {
                None
            };
            let current_after = desired
                .get(&file.after_relative_path)
                .cloned()
                .unwrap_or(None);
            if current_after != expected_after {
                return Err(AppError::Message(format!(
                    "{} はCodex適用後に変更されているため、安全に元へ戻せません。",
                    file.after_relative_path
                )));
            }
            if file.after_relative_path != file.relative_path {
                if desired
                    .get(&file.relative_path)
                    .cloned()
                    .unwrap_or(None)
                    .is_some()
                {
                    return Err(AppError::Message(format!(
                        "移動元 {} が既に存在するため、安全に元へ戻せません。",
                        file.relative_path
                    )));
                }
                desired.insert(file.after_relative_path.clone(), None);
            }
            let before = if file.before_existed {
                Some(fs::read(snapshot_path(
                    directory,
                    file.snapshot_index,
                    "before.bin",
                ))?)
            } else {
                None
            };
            desired.insert(file.relative_path.clone(), before);
        }
    }

    for path in &touched {
        if initial.get(path).and_then(|bytes| bytes.as_ref()).is_some() {
            let current = resolve_existing_path(&root, Path::new(path))?;
            create_one_generation_backup(&root, Path::new(path), &current)?;
        }
    }

    let mut changed: Vec<String> = Vec::new();
    for path in &touched {
        if initial.get(path) == desired.get(path) {
            continue;
        }
        if let Err(error) = write_optional_bytes(
            &root,
            path,
            desired.get(path).and_then(|bytes| bytes.as_deref()),
        ) {
            let mut rollback_error = None;
            for changed_path in changed.iter().rev() {
                if let Err(error) = write_optional_bytes(
                    &root,
                    changed_path,
                    initial.get(changed_path).and_then(|bytes| bytes.as_deref()),
                ) {
                    rollback_error = Some(error);
                }
            }
            return Err(match rollback_error {
                Some(rollback) => AppError::Message(format!(
                    "Codex変更の復元とロールバックに失敗しました: {error}; {rollback}"
                )),
                None => error,
            });
        }
        changed.push((*path).clone());
    }

    let now = Utc::now().to_rfc3339();
    let mut updated = Vec::with_capacity(manifests.len());
    for (directory, mut manifest) in manifests.drain(..) {
        manifest.status = "reverted".to_owned();
        manifest.review_state = "reverted".to_owned();
        manifest.reverted_at = Some(now.clone());
        write_manifest(&directory, &manifest)?;
        updated.push(manifest);
    }
    Ok(updated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn records_exact_snapshots_and_reverts_a_completed_change() {
        let directory = tempdir().unwrap();
        let root = path_to_string(directory.path());
        let path = directory.path().join("main.inp");
        fs::write(&path, b"before\r\n").unwrap();
        create_one_generation_backup(directory.path(), Path::new("main.inp"), &path).unwrap();
        let id = codex_change_history_begin(
            root.clone(),
            Some("thread".into()),
            Some("turn".into()),
            Some("item".into()),
            vec![CodexHistoryChangeInput {
                path: "main.inp".into(),
                after_path: None,
                kind: "update".into(),
            }],
        )
        .unwrap();
        fs::write(&path, b"after\r\n").unwrap();
        let completed = codex_change_history_complete(root.clone(), id.clone()).unwrap();
        assert_eq!(completed.status, "completed");
        let preview = codex_change_history_preview(root.clone(), id.clone()).unwrap();
        assert_eq!(preview.files[0].original, "before\r\n");
        assert_eq!(preview.files[0].modified, "after\r\n");
        codex_change_history_revert(root, id).unwrap();
        assert_eq!(fs::read(path).unwrap(), b"before\r\n");
    }

    #[test]
    fn refuses_to_overwrite_a_later_manual_change() {
        let directory = tempdir().unwrap();
        let root = path_to_string(directory.path());
        let path = directory.path().join("main.inp");
        fs::write(&path, b"before\n").unwrap();
        create_one_generation_backup(directory.path(), Path::new("main.inp"), &path).unwrap();
        let id = codex_change_history_begin(
            root.clone(),
            None,
            None,
            None,
            vec![CodexHistoryChangeInput {
                path: "main.inp".into(),
                after_path: None,
                kind: "update".into(),
            }],
        )
        .unwrap();
        fs::write(&path, b"after\n").unwrap();
        codex_change_history_complete(root.clone(), id.clone()).unwrap();
        fs::write(&path, b"manual\n").unwrap();
        assert!(codex_change_history_revert(root, id).is_err());
        assert_eq!(fs::read(path).unwrap(), b"manual\n");
    }

    #[test]
    fn snapshots_current_bytes_instead_of_a_stale_editor_backup() {
        let directory = tempdir().unwrap();
        let root = path_to_string(directory.path());
        let path = directory.path().join("main.inp");
        fs::write(&path, b"older\r\n").unwrap();
        create_one_generation_backup(directory.path(), Path::new("main.inp"), &path).unwrap();
        fs::write(&path, b"current\r\n").unwrap();
        let id = codex_change_history_begin(
            root.clone(),
            None,
            Some("turn-current".into()),
            None,
            vec![CodexHistoryChangeInput {
                path: "main.inp".into(),
                after_path: None,
                kind: "update".into(),
            }],
        )
        .unwrap();
        fs::write(&path, b"after\r\n").unwrap();
        codex_change_history_complete(root.clone(), id.clone()).unwrap();
        let preview = codex_change_history_preview(root, id).unwrap();
        assert_eq!(preview.files[0].original, "current\r\n");
    }

    #[test]
    fn groups_multiple_patches_from_one_turn_and_reverts_them_together() {
        let directory = tempdir().unwrap();
        let root = path_to_string(directory.path());
        let main = directory.path().join("main.inp");
        fs::write(&main, b"before\n").unwrap();
        let first = codex_change_history_begin(
            root.clone(),
            Some("thread".into()),
            Some("turn".into()),
            Some("item-1".into()),
            vec![CodexHistoryChangeInput {
                path: "main.inp".into(),
                after_path: None,
                kind: "update".into(),
            }],
        )
        .unwrap();
        fs::write(&main, b"after-one\n").unwrap();
        codex_change_history_complete(root.clone(), first.clone()).unwrap();
        let second = codex_change_history_begin(
            root.clone(),
            Some("thread".into()),
            Some("turn".into()),
            Some("item-2".into()),
            vec![
                CodexHistoryChangeInput {
                    path: "main.inp".into(),
                    after_path: None,
                    kind: "update".into(),
                },
                CodexHistoryChangeInput {
                    path: "notes.txt".into(),
                    after_path: None,
                    kind: "add".into(),
                },
            ],
        )
        .unwrap();
        fs::write(&main, b"after-two\n").unwrap();
        fs::write(directory.path().join("notes.txt"), b"created\n").unwrap();
        codex_change_history_complete(root.clone(), second.clone()).unwrap();

        let groups = codex_change_history_list_groups(root.clone()).unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].history_ids, vec![first.clone(), second.clone()]);
        assert_eq!(groups[0].review_state, "pendingReview");
        let preview =
            codex_change_history_preview_group(root.clone(), vec![first.clone(), second.clone()])
                .unwrap();
        let main_preview = preview
            .files
            .iter()
            .find(|file| file.path == "main.inp")
            .unwrap();
        assert_eq!(main_preview.original, "before\n");
        assert_eq!(main_preview.modified, "after-two\n");

        codex_change_history_mark_reviewed(root.clone(), vec![first.clone(), second.clone()])
            .unwrap();
        let reviewed_groups = codex_change_history_list_groups(root.clone()).unwrap();
        assert_eq!(reviewed_groups[0].review_state, "reviewed");

        codex_change_history_revert_group(root, vec![first, second]).unwrap();
        assert_eq!(fs::read(main).unwrap(), b"before\n");
        assert!(!directory.path().join("notes.txt").exists());
    }

    #[test]
    fn group_preflight_prevents_a_partial_restore() {
        let directory = tempdir().unwrap();
        let root = path_to_string(directory.path());
        let first_path = directory.path().join("first.inp");
        let second_path = directory.path().join("second.txt");
        fs::write(&first_path, b"first-before\n").unwrap();
        fs::write(&second_path, b"second-before\n").unwrap();
        let id = codex_change_history_begin(
            root.clone(),
            None,
            Some("turn".into()),
            None,
            vec![
                CodexHistoryChangeInput {
                    path: "first.inp".into(),
                    after_path: None,
                    kind: "update".into(),
                },
                CodexHistoryChangeInput {
                    path: "second.txt".into(),
                    after_path: None,
                    kind: "update".into(),
                },
            ],
        )
        .unwrap();
        fs::write(&first_path, b"first-after\n").unwrap();
        fs::write(&second_path, b"second-after\n").unwrap();
        codex_change_history_complete(root.clone(), id.clone()).unwrap();
        fs::write(&second_path, b"manual\n").unwrap();

        assert!(codex_change_history_revert_group(root, vec![id]).is_err());
        assert_eq!(fs::read(first_path).unwrap(), b"first-after\n");
        assert_eq!(fs::read(second_path).unwrap(), b"manual\n");
    }

    #[test]
    fn listing_groups_does_not_create_editor_metadata() {
        let directory = tempdir().unwrap();
        let root = path_to_string(directory.path());
        assert!(codex_change_history_list_groups(root).unwrap().is_empty());
        assert!(!directory.path().join(".phits-editor").exists());
    }
}
