use ts_rs::TS;

/// Tauri event names - Single source of truth
/// TypeScript bindings will be auto-generated from this struct
#[derive(TS)]
#[ts(export, export_to = "../src/bindings/")]
pub struct TauriEvents;

impl TauriEvents {
    // Message streaming events
    pub const MESSAGE_STARTED: &'static str = "message-started";
    pub const MESSAGE_CHUNK: &'static str = "message-chunk";
    pub const THINKING_CHUNK: &'static str = "thinking-chunk";
    pub const MESSAGE_COMPLETE: &'static str = "message-complete";
    pub const LLM_CALL_COMPLETE: &'static str = "llm-call-complete";

    // Conversation turn lifecycle events
    pub const CONVERSATION_TURN_STARTED: &'static str = "conversation-turn-started";
    pub const CONVERSATION_TURN_QUEUED: &'static str = "conversation-turn-queued";
    pub const CONVERSATION_TURN_PHASE_CHANGED: &'static str = "conversation-turn-phase-changed";
    pub const MESSAGE_ERROR: &'static str = "message-error";
    pub const MESSAGE_CANCELLED: &'static str = "message-cancelled";
    pub const MESSAGE_METADATA_UPDATED: &'static str = "message-metadata-updated";

    // Tool call events
    pub const TOOL_CALL_REQUEST: &'static str = "tool-call-request";
    pub const TOOL_CALL_RESPONSE: &'static str = "tool-call-response";
    pub const TOOL_CALL_ERROR: &'static str = "tool-call-error";
    pub const TOOL_CALLS_DETECTED: &'static str = "tool-calls-detected";
    pub const TOOL_EXECUTION_STARTED: &'static str = "tool-execution-started";
    pub const TOOL_EXECUTION_PROGRESS: &'static str = "tool-execution-progress";
    pub const TOOL_EXECUTION_COMPLETED: &'static str = "tool-execution-completed";
    pub const TOOL_EXECUTION_ERROR: &'static str = "tool-execution-error";
    pub const TOOL_PERMISSION_REQUEST: &'static str = "tool-permission-request";
    pub const USER_QUESTION_REQUEST: &'static str = "user-question-request";

    // Agent events
    pub const AGENT_LOOP_ITERATION: &'static str = "agent-loop-iteration";

    // Menu events
    pub const MENU_NEW_CHAT: &'static str = "menu-new-chat";
    pub const MENU_UNDO: &'static str = "menu-undo";
    pub const MENU_REDO: &'static str = "menu-redo";
    pub const MENU_CUT: &'static str = "menu-cut";
    pub const MENU_COPY: &'static str = "menu-copy";
    pub const MENU_PASTE: &'static str = "menu-paste";
    pub const MENU_TOGGLE_SIDEBAR: &'static str = "menu-toggle-sidebar";
    pub const MENU_THEME: &'static str = "menu-theme";
    pub const MENU_SETTINGS: &'static str = "menu-settings";
    pub const MENU_DOCUMENTATION: &'static str = "menu-documentation";
    pub const MENU_ABOUT: &'static str = "menu-about";
    pub const MENU_CHECK_UPDATES: &'static str = "menu-check-updates";
    pub const MENU_KEYBOARD_SHORTCUTS: &'static str = "menu-keyboard-shortcuts";

    // Chat events
    pub const CHAT_UPDATED: &'static str = "chat-updated";

    // Skill events
    pub const SKILLS_CHANGED: &'static str = "skills-changed";

    // Artifact events
    pub const ARTIFACT_CREATED: &'static str = "artifact-created";

    // Browser events
    pub const BROWSER_TAB_CREATED: &'static str = "browser-tab-created";
    pub const BROWSER_TAB_DESTROYED: &'static str = "browser-tab-destroyed";
    pub const BROWSER_ACTIVE_TAB_CHANGED: &'static str = "browser-active-tab-changed";
    pub const BROWSER_NAVIGATED: &'static str = "browser-navigated";
    pub const BROWSER_TITLE_CHANGED: &'static str = "browser-title-changed";
    pub const BROWSER_ERROR: &'static str = "browser-error";
}
