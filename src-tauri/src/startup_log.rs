use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Mutex, Once, OnceLock},
};

use chrono::Utc;
use tauri::{AppHandle, Manager};

const MAX_LOG_BYTES: u64 = 256 * 1024;
static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();
static LOG_LOCK: Mutex<()> = Mutex::new(());
static PANIC_HOOK: Once = Once::new();

pub fn initialize(app: &AppHandle) {
    let Ok(base) = app.path().app_data_dir() else {
        return;
    };
    let directory = base.join("logs");
    if fs::create_dir_all(&directory).is_err() {
        return;
    }
    let path = directory.join("startup.log");
    let _ = LOG_PATH.set(path);
    PANIC_HOOK.call_once(|| {
        let previous = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            append("application terminated by an unexpected panic");
            previous(info);
        }));
    });
    append(&format!(
        "application setup started; version={}; arch={}",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::ARCH
    ));
}

pub fn append(message: &str) {
    let Some(path) = LOG_PATH.get() else {
        return;
    };
    let _guard = LOG_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    rotate_if_needed(path);
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    let safe = message.replace(['\r', '\n'], " ");
    let _ = writeln!(file, "{} {safe}", Utc::now().to_rfc3339());
}

pub fn path() -> Option<PathBuf> {
    LOG_PATH.get().cloned()
}

fn rotate_if_needed(path: &Path) {
    if fs::metadata(path).map(|value| value.len()).unwrap_or(0) < MAX_LOG_BYTES {
        return;
    }
    let previous = path.with_file_name("startup.previous.log");
    let _ = fs::remove_file(&previous);
    let _ = fs::rename(path, previous);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_limit_is_bounded() {
        assert_eq!(MAX_LOG_BYTES, 256 * 1024);
    }
}
