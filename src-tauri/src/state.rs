use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};
use tokio::sync::Mutex;

#[derive(Default)]
pub struct AppState {
    pub active_run_directories: Mutex<HashSet<PathBuf>>,
}

impl AppState {
    pub async fn try_acquire_run_directory(&self, directory: PathBuf) -> bool {
        self.active_run_directories.lock().await.insert(directory)
    }

    pub async fn release_run_directory(&self, directory: &Path) {
        self.active_run_directories.lock().await.remove(directory);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn locks_each_run_directory_once() {
        let state = AppState::default();
        let directory = PathBuf::from("run-folder");
        assert!(state.try_acquire_run_directory(directory.clone()).await);
        assert!(!state.try_acquire_run_directory(directory.clone()).await);
        state.release_run_directory(&directory).await;
        assert!(state.try_acquire_run_directory(directory).await);
    }
}
