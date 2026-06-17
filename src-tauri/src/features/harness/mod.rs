//! Agent harness core — orchestrates conversation turns, tool execution, and context.
//!
//! Architecture reference: `harness.py` at repo root.
#![allow(dead_code)] // mock/stub components retained for future implementation

pub mod tool_execution_context;
pub mod adapters;
pub mod context;
pub mod factory;
pub mod intent_router;
pub mod loop_detector;
pub mod providers;
pub mod registry;
pub mod session;
pub mod tools_resolver;
pub mod traits;
pub mod turn;
pub mod types;
pub mod verifier;

pub use factory::HarnessFactory;
pub use types::MessageTurnRequest;
