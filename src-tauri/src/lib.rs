mod codex;
mod codex_history;
mod codex_interaction;
mod codex_mcp;
mod contracts;
mod diagnostics;
mod documents;
mod error;
mod language;
mod runner;
mod settings;
mod startup;
mod startup_log;
mod state;
mod workspace;

use std::path::PathBuf;

use state::AppState;
use tauri::{Emitter, Manager};

pub use codex_mcp::run_mcp_child_from_args;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let requests = startup::requests_from_strings(&args, &cwd);
            app.state::<AppState>()
                .queue_open_requests(requests.iter().cloned());
            for request in requests {
                let _ = app.emit(startup::EVENT_OPEN_REQUEST, request);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .setup(|app| {
            startup_log::initialize(app.handle());
            let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
            let requests = startup::requests_from_os_args(std::env::args_os(), &cwd);
            app.state::<AppState>().queue_open_requests(requests);
            startup_log::append("application setup completed; main webview configured");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            startup::startup_take_open_requests,
            startup::startup_resolve_open_target,
            workspace::workspace_open,
            documents::document_read,
            documents::document_save,
            documents::document_save_as,
            diagnostics::runtime_diagnose,
            diagnostics::workspace_environment_diagnose,
            diagnostics::diagnostic_report_save,
            startup_log::open_startup_log_folder,
            diagnostics::codex_compatibility_probe,
            settings::phits_settings_get,
            settings::phits_settings_set,
            language::language_spec_load,
            runner::run_phits_normal,
            runner::run_phits_production,
            runner::run_phits_stop_graceful,
            runner::run_utility,
            codex::phits_agent_setup_inspect,
            codex::codex_sandbox_probe,
            codex::codex_sandbox_setup,
            codex::codex_connect,
            codex::codex_disconnect,
            codex::codex_thread_start,
            codex::codex_thread_resume,
            codex::codex_thread_rename,
            codex::codex_thread_delete,
            codex::codex_turn_start,
            codex::codex_turn_interrupt,
            codex::codex_approval_resolve,
            codex_history::codex_change_history_begin,
            codex_history::codex_change_history_complete,
            codex_history::codex_change_history_abort,
            codex_history::codex_change_history_list,
            codex_history::codex_change_history_list_groups,
            codex_history::codex_change_history_preview,
            codex_history::codex_change_history_preview_group,
            codex_history::codex_change_history_mark_reviewed,
            codex_history::codex_change_history_revert,
            codex_history::codex_change_history_revert_group,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PHITS AI Editor");
}
