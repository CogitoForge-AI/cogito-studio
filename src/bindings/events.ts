/**
 * Tauri Event Names
 * Auto-generated from Rust constants in src-tauri/src/constants/events.rs
 * DO NOT EDIT MANUALLY - Update the Rust file instead
 */

export const TauriEvents = {
  // Conversation turn lifecycle events
  CONVERSATION_TURN_STARTED: 'conversation-turn-started',
  CONVERSATION_TURN_QUEUED: 'conversation-turn-queued',
  CONVERSATION_TURN_PHASE_CHANGED: 'conversation-turn-phase-changed',
  LLM_CALL_COMPLETE: 'llm-call-complete',

  // Message streaming events
  MESSAGE_STARTED: 'message-started',
  MESSAGE_CHUNK: 'message-chunk',
  THINKING_CHUNK: 'thinking-chunk',
  MESSAGE_COMPLETE: 'message-complete',
  MESSAGE_ERROR: 'message-error',
  MESSAGE_CANCELLED: 'message-cancelled',
  MESSAGE_METADATA_UPDATED: 'message-metadata-updated',

  // Tool call events
  TOOL_CALL_REQUEST: 'tool-call-request',
  TOOL_CALL_RESPONSE: 'tool-call-response',
  TOOL_CALL_ERROR: 'tool-call-error',
  TOOL_CALLS_DETECTED: 'tool-calls-detected',
  TOOL_EXECUTION_STARTED: 'tool-execution-started',
  TOOL_EXECUTION_PROGRESS: 'tool-execution-progress',
  TOOL_EXECUTION_COMPLETED: 'tool-execution-completed',
  TOOL_EXECUTION_ERROR: 'tool-execution-error',
  TOOL_PERMISSION_REQUEST: 'tool-permission-request',
  USER_QUESTION_REQUEST: 'user-question-request',

  // Agent events
  AGENT_LOOP_ITERATION: 'agent-loop-iteration',

  // Menu events
  MENU_NEW_CHAT: 'menu-new-chat',
  MENU_UNDO: 'menu-undo',
  MENU_REDO: 'menu-redo',
  MENU_CUT: 'menu-cut',
  MENU_COPY: 'menu-copy',
  MENU_PASTE: 'menu-paste',
  MENU_TOGGLE_SIDEBAR: 'menu-toggle-sidebar',
  MENU_THEME: 'menu-theme',
  MENU_SETTINGS: 'menu-settings',
  MENU_DOCUMENTATION: 'menu-documentation',
  MENU_ABOUT: 'menu-about',
  MENU_CHECK_UPDATES: 'menu-check-updates',
  MENU_KEYBOARD_SHORTCUTS: 'menu-keyboard-shortcuts',

  // Chat events
  CHAT_UPDATED: 'chat-updated',

  // Skill events
  SKILLS_CHANGED: 'skills-changed',

  // Artifact events
  ARTIFACT_CREATED: 'artifact-created',

  // Browser events
  BROWSER_TAB_CREATED: 'browser-tab-created',
  BROWSER_TAB_DESTROYED: 'browser-tab-destroyed',
  BROWSER_ACTIVE_TAB_CHANGED: 'browser-active-tab-changed',
  BROWSER_NAVIGATED: 'browser-navigated',
  BROWSER_TITLE_CHANGED: 'browser-title-changed',
  BROWSER_ERROR: 'browser-error',
} as const;

export type TauriEvent = (typeof TauriEvents)[keyof typeof TauriEvents];
