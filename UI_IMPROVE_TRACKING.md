# UI Improve Tracking

Tài liệu theo dõi các issue hiệu năng frontend ảnh hưởng đến Tauri 2 webview.

## Tổng Quan

| ID          | Ưu tiên     | Issue                                                              | Trạng thái | File liên quan                                                                                                                        |
| ----------- | ----------- | ------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| UI-PERF-001 | High        | Main bundle quá lớn cho webview startup                            | Done       | `vite.config.ts`, `src/features/ui/ui/MainLayout.tsx`                                                                                 |
| UI-PERF-002 | High        | Dynamic import bị vô hiệu do cùng module cũng bị import tĩnh       | Todo       | `src/features/settings/index.ts`, `src/features/chat/index.ts`, `src/features/ui/ui/MainLayout.tsx`                                   |
| UI-PERF-003 | High        | Danh sách message chưa được virtualized                            | Todo       | `src/features/chat/ui/chat/ChatMessages.tsx`, `src/features/chat/ui/chat/MessageList.tsx`                                             |
| UI-PERF-004 | High        | Streaming markdown vẫn parse lại toàn bộ content sau mỗi lần flush | Todo       | `src/ui/organisms/markdown/MarkdownContent.tsx`, `src/ui/atoms/streamdown/lib/context.tsx`, `src/ui/atoms/streamdown/lib/markdown.ts` |
| UI-PERF-005 | Medium-High | `THINKING_CHUNK` chưa được batch như `MESSAGE_CHUNK`               | Todo       | `src/features/chat/hooks/useConversationEventProjector.ts`                                                                            |
| UI-PERF-006 | Medium      | Syntax highlighting có duplicate work khi cache miss               | Todo       | `src/ui/atoms/streamdown/lib/code-block/use-highlighted-code.ts`, `src/ui/atoms/streamdown/lib/code-block/highlight.ts`               |
| UI-PERF-007 | Medium      | Shiki token/highlighter cache chưa có giới hạn                     | Todo       | `src/ui/atoms/streamdown/lib/code-block/highlight.ts`                                                                                 |
| UI-PERF-008 | Medium      | Mermaid initialize/render lặp lại nhiều                            | Todo       | `src/ui/atoms/streamdown/lib/mermaid/utils.ts`, `src/ui/atoms/streamdown/lib/mermaid/index.tsx`                                       |
| UI-PERF-009 | Medium      | Resize sidebar update state/persist trên từng `mousemove`          | Todo       | `src/features/chat/ui/ChatLayout.tsx`                                                                                                 |
| UI-PERF-010 | Low-Medium  | `visibilitychange` listener không cleanup                          | Todo       | `src/App.tsx`                                                                                                                         |

## Mô Tả Issue

### UI-PERF-001: Main bundle quá lớn cho webview startup

Build hiện tại tạo `dist/assets/index-*.js` khoảng 3.6 MB minified, khoảng 907 KB gzip, và source map khoảng 11 MB. Vite cũng cảnh báo chunk lớn hơn 500 KB.

Tác động: Tauri webview phải tải, parse và compile lượng JavaScript lớn ngay lúc mở app, làm startup chậm hơn và tăng memory ban đầu.

Hướng xử lý: lazy-load các màn hình/dialog nặng như Settings, WorkspaceSettings, ChatSearch, RightPanel, About; kiểm tra lại main chunk sau khi tách.

Kết quả: Đã lazy-load `SettingsScreen`, `WorkspaceSettingsDialog`, `ChatSearchDialog`, `ChatRightPanel`, `About` và bỏ barrel import reducer trên đường startup. Build sau xử lý tạo chunk riêng cho các màn hình/dialog này; main chunk giảm từ 3,617.63 KB minified / 907.10 KB gzip xuống 3,533.03 KB minified / 884.48 KB gzip. Các cảnh báo dynamic import còn lại thuộc phạm vi UI-PERF-002 và các issue markdown/Mermaid tiếp theo.

### UI-PERF-002: Dynamic import bị vô hiệu do cùng module cũng bị import tĩnh

Build báo nhiều dynamic import không tách chunk được vì cùng module đã bị import tĩnh ở nơi khác. Các nhóm bị ảnh hưởng gồm `chatsSlice`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-opener`, Mermaid, updater plugin và `sonner`.

Tác động: code-splitting không đạt hiệu quả mong muốn, khiến nhiều phần chỉ cần khi dùng tính năng lại bị đưa vào đường startup.

Hướng xử lý: giảm barrel export ở các `index.ts`, tránh import tĩnh qua barrel trên đường startup, và kiểm tra lại cảnh báo Vite sau từng bước.

### UI-PERF-003: Danh sách message chưa được virtualized

`ChatMessages` render toàn bộ `MessageList`, sau đó `MessageList` map toàn bộ message/render unit. Dù assistant message có dùng `contentVisibility: auto`, React vẫn giữ toàn bộ tree, state, memo, markdown components và event handlers trong memory.

Tác động: cuộc hội thoại dài sẽ làm webview chậm dần, đặc biệt khi có nhiều markdown, code block, ảnh hoặc tool activity.

Hướng xử lý: thêm virtualization cho message list, giữ scroll behavior ổn định, và đảm bảo streaming message cuối vẫn cập nhật mượt.

### UI-PERF-004: Streaming markdown vẫn parse lại toàn bộ content sau mỗi lần flush

`MarkdownContent` đã có buffer 400-500ms, nhưng mỗi lần flush vẫn truyền full `displayedContent` vào `Streamdown`. `Streamdown` tiếp tục chạy `remend`, `parseMarkdownIntoBlocks`, rồi từng block lại parse qua unified sync.

Tác động: message dài trong lúc streaming có thể gây main-thread jank trong webview.

Hướng xử lý: giảm phạm vi parse lại trong streaming, tái sử dụng block đã ổn định, hoặc trì hoãn markdown parsing nặng cho đến khi message hoàn tất.

### UI-PERF-005: `THINKING_CHUNK` chưa được batch như `MESSAGE_CHUNK`

Content chunk được batch bằng `pendingContent` và flush sau khoảng 400ms, nhưng reasoning chunk dispatch `messagesApi.util.updateQueryData` ngay mỗi event.

Tác động: nếu backend emit reasoning nhanh, RTK cache và React render có thể bị cập nhật quá dày.

Hướng xử lý: áp dụng buffer tương tự `pendingContent` cho reasoning, flush theo thời gian hoặc theo ngưỡng kích thước.

### UI-PERF-006: Syntax highlighting có duplicate work khi cache miss

`useHighlightedCode` gọi `getHighlightedTokens` hai lần khi chưa có cache. Lần đầu không có callback đã khởi động highlighting, lần thứ hai có callback có thể khởi động thêm một job khác trước khi token cache được set.

Tác động: nhiều code block hoặc code block dài có thể gây CPU work trùng lặp trên main thread.

Hướng xử lý: chỉ gọi `getHighlightedTokens` một lần với callback, hoặc thêm in-flight cache cho token jobs.

### UI-PERF-007: Shiki token/highlighter cache chưa có giới hạn

`highlighterCache`, `tokensCache` và `subscribers` là module-level `Map`; riêng `tokensCache` chưa có LRU/TTL.

Tác động: session dài với nhiều code block khác nhau có thể tăng memory của webview theo thời gian.

Hướng xử lý: giới hạn cache bằng LRU, tách cache theo theme/language, và cleanup subscriber chắc chắn khi component unmount hoặc job lỗi.

### UI-PERF-008: Mermaid initialize/render lặp lại nhiều

Mermaid được dynamic import, đây là điểm tốt. Tuy nhiên mỗi render vẫn gọi `mermaid.initialize(config)` và tạo ID mới bằng `Date.now()` + `Math.random()`. Khi chart thay đổi trong streaming/retry, render mới khó tận dụng identity ổn định.

Tác động: diagram trong markdown có thể tốn CPU hơn cần thiết, nhất là khi nội dung đang streaming hoặc có nhiều diagram.

Hướng xử lý: memo initialize theo config hash, dùng ID ổn định theo chart hash, và chỉ render Mermaid khi block đủ ổn định.

### UI-PERF-009: Resize sidebar update state/persist trên từng `mousemove`

Khi kéo sidebar, mỗi `mousemove` gọi `setSidebarWidth` và `persistSidebarWidth`.

Tác động: thao tác kéo có thể gây layout churn và storage/backend persistence quá dày, làm UI kém mượt trên một số webview.

Hướng xử lý: update visual bằng `requestAnimationFrame`, debounce hoặc chỉ persist khi mouseup/resize kết thúc.

### UI-PERF-010: `visibilitychange` listener không cleanup

App root add `visibilitychange` listener bằng inline callback và không remove listener trong cleanup.

Tác động: rủi ro runtime thấp vì app root thường mount một lần, nhưng trong dev/HMR hoặc remount bất thường có thể nhân listener và gọi `setFocus` thừa.

Hướng xử lý: đặt handler thành biến ổn định trong effect và remove listener trong cleanup.

## Quy Ước Trạng Thái

- `Todo`: Chưa xử lý.
- `In Progress`: Đang xử lý.
- `Blocked`: Cần quyết định thêm hoặc phụ thuộc task khác.
- `Done`: Đã sửa và đã verify.
- `Deferred`: Chủ động để lại sau.

## Verification Khi Sửa Code

- Frontend: chạy `yarn lint:fix`, `yarn typecheck`, và kiểm tra UI runtime.
- Build/performance: chạy `yarn ui:build`, so sánh chunk size và cảnh báo Vite.
- Nếu đụng Tauri IPC/backend: chạy thêm check Rust phù hợp trong `src-tauri`.
