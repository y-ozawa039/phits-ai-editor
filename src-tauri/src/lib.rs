mod codex;
mod contracts;
mod diagnostics;
mod documents;
mod error;
mod language;
mod runner;
mod state;
mod workspace;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            workspace::workspace_open,
            documents::document_read,
            documents::document_save,
            documents::document_save_as,
            diagnostics::runtime_diagnose,
            language::language_spec_load,
            runner::run_phits_normal,
            runner::run_phits_production,
            runner::run_phits_stop_graceful,
            runner::run_utility,
            codex::codex_connect,
            codex::codex_disconnect,
            codex::codex_thread_start,
            codex::codex_thread_resume,
            codex::codex_turn_start,
            codex::codex_turn_interrupt,
            codex::codex_approval_resolve,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PHITS AI Editor");
}
