# AI 响应存储与数据流

## 存储规范

所有 AI 响应（无论任务类型）都应存储在 `chat_messages` 表中（而非 `ai_tasks.result`）。

当 ai_task 完成时，Edge Function 将 AI 响应作为新行写入 `chat_messages`，role 为 'assistant'。

## 前端处理要求

1. **订阅 chat_messages INSERT 事件**（不仅仅是 ai_tasks UPDATE）
2. **获取关联消息**: 当 ai_tasks UPDATE 显示 status='completed' 时，使用 task.result 中的 messageId 从 chat_messages 获取关联消息
3. **避免竞态条件**: refreshMessages() 可能覆盖新追加的 assistant 消息，应使用增量合并或在任务完成后延迟刷新

## 数据流

```
Edge Function 完成任务 
→ 写入 chat_messages 
→ 前端接收 INSERT 事件 或 通过 messageId 获取 
→ 追加到 ChatPanel 状态
```

## 已知问题

存在一个持续性问题：首次订阅时无法接收来自 Edge Functions 的实时 INSERT 事件，但退出并重新进入项目后可正常工作。

**症状**: 通道成功达到 SUBSCRIBED 状态，但事件仍然丢失。

**可能原因**: 通道订阅建立与 Edge Function 插入数据之间存在时序问题。

**调试标准**: 验证构建日志显示 "开始处理 AI 任务: chat_reply (Model: google/gemini-3-pro-preview)" 且无需页面刷新。
