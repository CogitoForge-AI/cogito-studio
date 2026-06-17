# Harness Polish

Trạng thái: `[ ]` chưa làm · `[~]` đang làm · `[x]` xong

## Quick wins

- [ ] Agent loop progress UI (`agent-loop-iteration`)
- [x] Handle `message-cancelled` + fix `hasToolCallsRef`
- [ ] i18n `AgentCard` + tool permission labels
- [ ] Loading skeleton khi switch chat
- [ ] `AskUserPanel`: `allowMultiple` (checkbox)
- [ ] Mở rộng `model_supports_tools` / workspace toggle

## UX

- [ ] Incremental tool progress (bỏ full refetch)
- [ ] Wire `tool-execution-started`
- [ ] Clear ask-user / permission state khi switch chat
- [ ] Ask-user indicator khi đang ở chat khác
- [ ] AskUser step dots / jump-to-question
- [ ] Retry sau `message-error`
- [ ] Toast khi agent task hoàn thành
- [ ] Thống nhất blocking: permission + ask_user

## Backend reliability

- [ ] History fidelity: reconstruct `tool_calls` cho LLM
- [ ] Loop detection + wire `TurnOutcome`
- [ ] Context compaction (`ContextManager`)
- [ ] Response verification + feed `tool_results`
- [ ] Intent routing (behind flag)
- [ ] Tool batch error handling (không silent fail)
- [ ] Unified tool registry

## Cleanup

- [ ] Wire `TurnOutcome` → events → UI
- [ ] Consolidate message state (RTK Query vs legacy Redux)
- [ ] Remove `#![allow(dead_code)]` trên harness mod
