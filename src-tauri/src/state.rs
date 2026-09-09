use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::Mutex as SyncMutex,
};
use tokio::sync::Mutex;

use crate::contracts::StartupOpenRequest;

#[derive(Default)]
pub struct AppState {
    pub active_run_directories: Mutex<HashSet<PathBuf>>,
    pub pending_open_requests: SyncMutex<Vec<StartupOpenRequest>>,
}

impl AppState {
    pub async fn try_acquire_run_directory(&self, directory: PathBuf) -> bool {
        self.active_run_directories.lock().await.insert(directory)
    }

    pub async fn release_run_directory(&self, directory: &Path) {
        self.active_run_directories.lock().await.remove(directory);
    }

    pub fn queue_open_requests(&self, requests: impl IntoIterator<Item = StartupOpenRequest>) {
        self.pending_open_requests
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .extend(requests);
    }

    pub fn take_open_requests(&self) -> Vec<StartupOpenRequest> {
        std::mem::take(
            &mut *self
                .pending_open_requests
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()),
        )
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
