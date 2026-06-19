#[cfg(test)]
mod tests {
    use crate::constants::{TauriCommands, TauriEvents};

    #[test]
    fn generate_typescript_bindings() {
        // This test will trigger ts-rs to export TypeScript bindings
        // The bindings will be generated at compile time

        // Just verify constants are accessible
        assert_eq!(TauriCommands::GET_PYTHON_RUNTIMES_STATUS, "get_python_runtimes_status");
        assert_eq!(TauriEvents::MESSAGE_CHUNK, "message-chunk");
        assert_eq!(TauriEvents::LLM_CALL_COMPLETE, "llm-call-complete");
        assert_eq!(
            TauriEvents::CONVERSATION_TURN_STARTED,
            "conversation-turn-started"
        );
        assert_eq!(TauriCommands::GET_CONVERSATION_STATE, "get_conversation_state");
    }
}
