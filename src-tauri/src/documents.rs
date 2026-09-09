use std::{
    ffi::OsStr,
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use encoding_rs::SHIFT_JIS;
use uuid::Uuid;

use crate::{
    contracts::{DocumentData, LineEnding, TextEncoding},
    error::{AppError, AppResult},
    workspace::{
        canonical_workspace_root, path_to_string, resolve_existing_path, resolve_save_path,
        validate_relative_path,
    },
};

const UTF8_BOM: &[u8] = b"\xEF\xBB\xBF";

#[tauri::command]
pub fn document_read(workspace_root: String, relative_path: String) -> AppResult<DocumentData> {
    let root = canonical_workspace_root(Path::new(&workspace_root))?;
    let relative = Path::new(&relative_path);
    let target = resolve_existing_path(&root, relative)?;
    read_document(&target, relative)
}

#[tauri::command]
pub fn document_save(
    workspace_root: String,
    document: DocumentData,
    content: String,
) -> AppResult<DocumentData> {
    let root = canonical_workspace_root(Path::new(&workspace_root))?;
    let relative = Path::new(&document.relative_path);
    validate_relative_path(relative)?;
    let target = resolve_save_path(&root, relative)?;

    // Encode first so an unrepresentable edit cannot create metadata or alter
    // the previous-generation backup.
    let normalized = if content == document.content {
        content
    } else {
        normalize_line_endings(&content, &document.line_ending)
    };
    let encoded = encode_text(&normalized, &document.encoding)?;
    if target.exists() {
        create_one_generation_backup(&root, relative, &target)?;
    }
    atomic_write(&target, &encoded)?;
    read_document(&target, relative)
}

#[tauri::command]
pub fn document_save_as(
    workspace_root: String,
    target_path: String,
    content: String,
    source_document: Option<DocumentData>,
) -> AppResult<DocumentData> {
    let root = canonical_workspace_root(Path::new(&workspace_root))?;
    let requested = PathBuf::from(&target_path);
    if !requested.is_absolute() {
        return Err(AppError::Message(
            "名前を付けて保存するパスは絶対パスで指定してください。".to_owned(),
        ));
    }
    let file_name = requested
        .file_name()
        .ok_or_else(|| AppError::Message(format!("無効な保存先です: {}", requested.display())))?;
    let parent = requested.parent().ok_or_else(|| {
        AppError::Message(format!(
            "保存先の親フォルダーがありません: {}",
            requested.display()
        ))
    })?;
    let canonical_parent = dunce::canonicalize(parent)?;
    if !canonical_parent.starts_with(&root) {
        return Err(AppError::Message(
            "ワークスペース外には保存できません。".to_owned(),
        ));
    }
    let target = canonical_parent.join(file_name);
    let relative = target
        .strip_prefix(&root)
        .map_err(|_| AppError::Message("保存先の相対パスを取得できません。".to_owned()))?;
    validate_relative_path(relative)?;

    let encoding = source_document
        .as_ref()
        .map(|value| value.encoding.clone())
        .unwrap_or(TextEncoding::Utf8);
    let line_ending = source_document
        .as_ref()
        .map(|value| value.line_ending.clone())
        .unwrap_or_else(|| {
            if cfg!(windows) {
                LineEnding::Crlf
            } else {
                LineEnding::Lf
            }
        });
    let normalized = normalize_line_endings(&content, &line_ending);
    let encoded = encode_text(&normalized, &encoding)?;
    if target.exists() {
        let canonical_target = dunce::canonicalize(&target)?;
        if !canonical_target.starts_with(&root) || !canonical_target.is_file() {
            return Err(AppError::Message(
                "保存先がワークスペース外を参照しています。".to_owned(),
            ));
        }
        create_one_generation_backup(&root, relative, &canonical_target)?;
    }
    atomic_write(&target, &encoded)?;
    read_document(&target, relative)
}

fn read_document(target: &Path, relative: &Path) -> AppResult<DocumentData> {
    let bytes = fs::read(target)?;
    let (content, encoding) = decode_text(&bytes)?;
    let line_ending = detect_line_ending(&content);
    let modified_at_ms = fs::metadata(target)?
        .modified()?
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX);

    Ok(DocumentData {
        path: path_to_string(target),
        relative_path: path_to_string(relative),
        content,
        encoding,
        line_ending,
        modified_at_ms,
    })
}

pub(crate) fn decode_text(bytes: &[u8]) -> AppResult<(String, TextEncoding)> {
    if let Some(without_bom) = bytes.strip_prefix(UTF8_BOM) {
        return String::from_utf8(without_bom.to_vec())
            .map(|content| (content, TextEncoding::Utf8Bom))
            .map_err(|_| {
                AppError::Message("UTF-8 BOM付き文書の本文が不正なUTF-8です。".to_owned())
            });
    }

    if let Ok(content) = std::str::from_utf8(bytes) {
        return Ok((content.to_owned(), TextEncoding::Utf8));
    }

    let (decoded, _, had_errors) = SHIFT_JIS.decode(bytes);
    if had_errors {
        return Err(AppError::Message(
            "文書をUTF-8またはWindows-31Jとして読み取れません。".to_owned(),
        ));
    }
    Ok((decoded.into_owned(), TextEncoding::Windows31j))
}

fn encode_text(content: &str, encoding: &TextEncoding) -> AppResult<Vec<u8>> {
    match encoding {
        TextEncoding::Utf8 => Ok(content.as_bytes().to_vec()),
        TextEncoding::Utf8Bom => {
            let mut bytes = Vec::with_capacity(UTF8_BOM.len() + content.len());
            bytes.extend_from_slice(UTF8_BOM);
            bytes.extend_from_slice(content.as_bytes());
            Ok(bytes)
        }
        TextEncoding::Windows31j => {
            let (encoded, _, had_errors) = SHIFT_JIS.encode(content);
            if had_errors {
                return Err(AppError::Message(
                    "Windows-31Jで表現できない文字が含まれているため保存できません。".to_owned(),
                ));
            }
            Ok(encoded.into_owned())
        }
    }
}

fn detect_line_ending(content: &str) -> LineEnding {
    match content.find('\n') {
        Some(index) if index > 0 && content.as_bytes()[index - 1] == b'\r' => LineEnding::Crlf,
        _ => LineEnding::Lf,
    }
}

fn normalize_line_endings(content: &str, line_ending: &LineEnding) -> String {
    let lf = content.replace("\r\n", "\n").replace('\r', "\n");
    match line_ending {
        LineEnding::Lf => lf,
        LineEnding::Crlf => lf.replace('\n', "\r\n"),
    }
}

pub(crate) fn create_one_generation_backup(
    root: &Path,
    relative: &Path,
    original: &Path,
) -> AppResult<()> {
    create_one_generation_backup_from_bytes(root, relative, &fs::read(original)?)
}

pub(crate) fn create_one_generation_backup_from_bytes(
    root: &Path,
    relative: &Path,
    original_bytes: &[u8],
) -> AppResult<()> {
    let relative_parent = relative.parent().unwrap_or_else(|| Path::new(""));
    let requested_parent = root
        .join(".phits-editor")
        .join("backups")
        .join(relative_parent);
    let backup_parent = secure_create_directories(root, &requested_parent)?;
    let file_name = relative.file_name().ok_or_else(|| {
        AppError::Message(format!(
            "バックアップ先を決定できません: {}",
            relative.display()
        ))
    })?;
    let backup = backup_parent.join(file_name);
    atomic_write(&backup, original_bytes)
}

pub(crate) fn secure_create_directories(root: &Path, requested: &Path) -> AppResult<PathBuf> {
    let canonical_root = dunce::canonicalize(root)?;
    let relative = requested
        .strip_prefix(root)
        .or_else(|_| requested.strip_prefix(&canonical_root))
        .map_err(|_| {
            AppError::Message(format!(
                "ワークスペース外にフォルダーを作成できません: {}",
                requested.display()
            ))
        })?;
    let mut current = canonical_root.clone();
    for component in relative.components() {
        current.push(component.as_os_str());
        match fs::create_dir(&current) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.into()),
        }
        let canonical = dunce::canonicalize(&current)?;
        if !canonical.starts_with(&canonical_root) || !canonical.is_dir() {
            return Err(AppError::Message(format!(
                "バックアップフォルダーがワークスペース外を参照しています: {}",
                current.display()
            )));
        }
        current = canonical;
    }
    Ok(current)
}

pub(crate) fn atomic_write(target: &Path, bytes: &[u8]) -> AppResult<()> {
    let parent = target.parent().ok_or_else(|| {
        AppError::Message(format!(
            "保存先の親フォルダーがありません: {}",
            target.display()
        ))
    })?;
    let file_name = target.file_name().unwrap_or_else(|| OsStr::new("document"));
    let temp_path = parent.join(format!(
        ".{}.phits-ai-editor-{}.tmp",
        file_name.to_string_lossy(),
        Uuid::new_v4()
    ));
    let mut cleanup = TempFileGuard::new(temp_path.clone());

    let mut temporary = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp_path)?;
    temporary.write_all(bytes)?;
    temporary.flush()?;
    temporary.sync_all()?;
    drop(temporary);

    replace_file(&temp_path, target)?;
    cleanup.disarm();
    Ok(())
}

#[cfg(not(windows))]
fn replace_file(source: &Path, target: &Path) -> io::Result<()> {
    fs::rename(source, target)
}

#[cfg(windows)]
fn replace_file(source: &Path, target: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn MoveFileExW(
            existing_file_name: *const u16,
            new_file_name: *const u16,
            flags: u32,
        ) -> i32;
    }

    let target_wide: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x8;
    let succeeded = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            target_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if succeeded == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

struct TempFileGuard {
    path: PathBuf,
    armed: bool,
}

impl TempFileGuard {
    fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        if self.armed {
            let _ = fs::remove_file(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use encoding_rs::SHIFT_JIS;
    use tempfile::tempdir;

    use super::*;

    fn data(relative_path: &str, encoding: TextEncoding, line_ending: LineEnding) -> DocumentData {
        DocumentData {
            path: String::new(),
            relative_path: relative_path.to_owned(),
            content: String::new(),
            encoding,
            line_ending,
            modified_at_ms: 0,
        }
    }

    #[test]
    fn round_trips_utf8_bom_and_crlf() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("main.inp");
        let mut original = UTF8_BOM.to_vec();
        original.extend_from_slice("一行目\r\n二行目\r\n".as_bytes());
        fs::write(&path, &original).unwrap();

        let read = document_read(path_to_string(directory.path()), "main.inp".to_owned()).unwrap();
        assert!(matches!(read.encoding, TextEncoding::Utf8Bom));
        assert!(matches!(read.line_ending, LineEnding::Crlf));
        let saved = document_save(
            path_to_string(directory.path()),
            read,
            "一行目\n変更後\n".to_owned(),
        )
        .unwrap();

        assert!(matches!(saved.encoding, TextEncoding::Utf8Bom));
        assert!(matches!(saved.line_ending, LineEnding::Crlf));
        assert!(fs::read(&path).unwrap().starts_with(UTF8_BOM));
        assert_eq!(saved.content, "一行目\r\n変更後\r\n");
    }

    #[test]
    fn round_trips_windows_31j_without_conversion() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("main.pht");
        let (original, _, errors) = SHIFT_JIS.encode("日本語\r\nコメント\r\n");
        assert!(!errors);
        fs::write(&path, original.as_ref()).unwrap();

        let read = document_read(path_to_string(directory.path()), "main.pht".to_owned()).unwrap();
        assert!(matches!(read.encoding, TextEncoding::Windows31j));
        assert_eq!(read.content, "日本語\r\nコメント\r\n");
        document_save(
            path_to_string(directory.path()),
            read,
            "日本語\n更新\n".to_owned(),
        )
        .unwrap();

        let (expected, _, _) = SHIFT_JIS.encode("日本語\r\n更新\r\n");
        assert_eq!(fs::read(path).unwrap(), expected.as_ref());
    }

    #[test]
    fn no_op_save_preserves_exact_mixed_line_endings() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("mixed.inp");
        let original = b"first\r\nsecond\nthird\r\n";
        fs::write(&path, original).unwrap();

        let read = document_read(path_to_string(directory.path()), "mixed.inp".to_owned()).unwrap();
        let unchanged_content = read.content.clone();
        document_save(path_to_string(directory.path()), read, unchanged_content).unwrap();

        assert_eq!(fs::read(path).unwrap(), original);
    }

    #[test]
    fn overwrite_keeps_exact_previous_bytes_in_one_generation_backup() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("main.inp");
        fs::write(&path, b"first\n").unwrap();

        document_save(
            path_to_string(directory.path()),
            data("main.inp", TextEncoding::Utf8, LineEnding::Lf),
            "second\n".to_owned(),
        )
        .unwrap();
        let backup = directory
            .path()
            .join(".phits-editor")
            .join("backups")
            .join("main.inp");
        assert_eq!(fs::read(&backup).unwrap(), b"first\n");

        document_save(
            path_to_string(directory.path()),
            data("main.inp", TextEncoding::Utf8, LineEnding::Lf),
            "third\n".to_owned(),
        )
        .unwrap();
        assert_eq!(fs::read(path).unwrap(), b"third\n");
        assert_eq!(fs::read(backup).unwrap(), b"second\n");
    }

    #[test]
    fn creating_new_file_does_not_create_editor_metadata() {
        let directory = tempdir().unwrap();
        document_save(
            path_to_string(directory.path()),
            data("new.inp", TextEncoding::Utf8, LineEnding::Lf),
            "new\n".to_owned(),
        )
        .unwrap();

        assert!(!directory.path().join(".phits-editor").exists());
    }

    #[test]
    fn save_as_creates_utf8_document_inside_workspace() {
        let directory = tempdir().unwrap();
        let target = directory.path().join("notes.txt");
        let saved = document_save_as(
            path_to_string(directory.path()),
            path_to_string(&target),
            "first\nsecond\n".to_owned(),
            None,
        )
        .unwrap();
        assert_eq!(saved.relative_path, "notes.txt");
        assert!(matches!(saved.encoding, TextEncoding::Utf8));
        assert!(target.is_file());
    }

    #[test]
    fn allows_multiple_direct_inputs_and_nested_inputs() {
        let directory = tempdir().unwrap();
        fs::write(directory.path().join("main.inp"), b"main\n").unwrap();
        fs::create_dir(directory.path().join("parts")).unwrap();

        document_save(
            path_to_string(directory.path()),
            data("second.PHT", TextEncoding::Utf8, LineEnding::Lf),
            "second\n".to_owned(),
        )
        .unwrap();
        assert!(directory.path().join("second.PHT").is_file());

        document_save(
            path_to_string(directory.path()),
            data("parts/nested.inp", TextEncoding::Utf8, LineEnding::Lf),
            "include\n".to_owned(),
        )
        .unwrap();
        assert!(directory.path().join("parts").join("nested.inp").is_file());
    }

    #[test]
    fn rejects_traversal_for_read_and_save() {
        let directory = tempdir().unwrap();
        let root = path_to_string(directory.path());
        assert!(document_read(root.clone(), "../outside.txt".to_owned()).is_err());
        assert!(
            document_save(
                root,
                data("../outside.txt", TextEncoding::Utf8, LineEnding::Lf),
                "bad".to_owned(),
            )
            .is_err()
        );
    }

    #[test]
    fn refuses_unrepresentable_windows_31j_text_without_touching_original() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("main.inp");
        fs::write(&path, b"original\n").unwrap();

        let result = document_save(
            path_to_string(directory.path()),
            data("main.inp", TextEncoding::Windows31j, LineEnding::Lf),
            "emoji \u{1f600}".to_owned(),
        );
        assert!(result.is_err());
        assert_eq!(fs::read(path).unwrap(), b"original\n");
    }

    #[cfg(windows)]
    #[test]
    #[allow(clippy::permissions_set_readonly_false)]
    fn failed_atomic_replace_keeps_the_original_file() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("readonly.inp");
        fs::write(&path, b"original\n").unwrap();
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&path, permissions).unwrap();

        let result = atomic_write(&path, b"replacement\n");
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(false);
        fs::set_permissions(&path, permissions).unwrap();

        assert!(result.is_err());
        assert_eq!(fs::read(path).unwrap(), b"original\n");
    }
}
