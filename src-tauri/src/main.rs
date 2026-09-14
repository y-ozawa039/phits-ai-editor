fn main() {
    if phits_ai_editor_lib::run_mcp_child_from_args() {
        return;
    }
    phits_ai_editor_lib::run();
}
