# Realtime 订阅问题深度分析

## 问题概述

**现象**：首次进入项目时，Realtime 订阅虽然显示 `SUBSCRIBED` 状态，但无法接收到 Edge Function 插入的数据事件。退出项目后再次进入，Realtime 订阅恢复正常，可以正常接收事件。

**影响**：用户发送消息后，需要刷新页面才能看到 AI 回复，构建日志也无法实时显示。

## 日志分析

### 日志 1：首次进入项目（问题状态）

```
[RealtimeClient] 初始化完成
[RealtimeClient] supabase.getChannels() Array(0)
[RealtimeClient] 创建新频道: build-logs-3127bd15-b12c-4e30-95d3-b89e25c87d7c
[subscribeBuildLogs] 已订阅项目 3127bd15-b12c-4e30-95d3-b89e25c87d7c 的构建日志
...
[RealtimeClient] 频道 build-logs-xxx subscribe 原始回调: CLOSED
[RealtimeClient] 频道 build-logs-xxx 状态: CLOSED
[RealtimeClient] 频道 build-logs-xxx subscribe 原始回调: CHANNEL_ERROR
[RealtimeClient] 频道 build-logs-xxx 状态: CHANNEL_ERROR
[RealtimeClient] 频道 agent-events-xxx subscribe 原始回调: SUBSCRIBED
[RealtimeClient] 频道 agent-tasks-xxx subscribe 原始回调: SUBSCRIBED
[RealtimeClient] 频道 agent-messages-xxx subscribe 原始回调: SUBSCRIBED
```

**关键观察**：
1. `build-logs` 频道首先显示 `CLOSED`，然后显示 `CHANNEL_ERROR`
2. 其他频道（`agent-events`、`agent-tasks`、`agent-messages`）显示 `SUBSCRIBED`
3. 用户发送消息后，**没有任何** `[RealtimeClient] 收到事件` 日志
4. Edge Function 完成后，通过手动刷新消息列表获取 AI 回复

### 日志 2：再次进入项目（正常状态）

```
发送消息: xxx
[RealtimeClient] 收到事件 INSERT on chat_messages: {...}
[subscribeAgentEvents] 收到新消息: xxx user
[RealtimeClient] 收到事件 UPDATE on ai_tasks: {...}
[subscribeAgentEvents] 收到任务更新: xxx running
[RealtimeClient] 收到事件 INSERT on agent_events: {...}
[RealtimeClient] 收到事件 INSERT on chat_messages: {...}
[subscribeAgentEvents] 收到新消息: xxx assistant
```

**关键观察**：
1. 所有事件都正常接收（INSERT、UPDATE）
2. 消息、任务更新、agent_events 都能实时推送

## 根因假设

### 假设 1：`build_logs` 订阅错误导致整个 postgres_changes 流异常

**证据**：
- 日志 1 中，`build-logs` 频道是唯一显示 `CHANNEL_ERROR` 的频道
- 尽管其他频道显示 `SUBSCRIBED`，但没有任何事件被接收
- 日志 2 中，所有频道正常工作，所有事件都能接收

**推测机制**：
Supabase Realtime 的 postgres_changes 订阅可能在同一个 WebSocket 连接上共享某些状态。当 `build_logs` 订阅失败时，可能导致整个 postgres_changes 流处于异常状态，即使其他频道的握手成功（显示 `SUBSCRIBED`），实际的数据流也无法正常工作。

### 假设 2：订阅配置问题

**已排除**：
- 通过 Supabase MCP 工具确认，所有相关表（`build_logs`、`chat_messages`、`ai_tasks`、`agent_events`、`file_events`）都已添加到 `supabase_realtime` publication
- 订阅代码中的 filter 格式正确：`project_id=eq.${projectId}`

### 假设 3：时序问题

**可能性较低**：
- 如果只是时序问题，后续的事件应该能够接收
- 但日志 1 显示，整个会话期间都没有收到任何事件
- 这更像是"整条流挂掉了"而不是"早期丢了几条"

## 验证实验

### 实验 1：禁用 build_logs 订阅

**目的**：确认 `build_logs` 订阅是否是导致问题的根源

**步骤**：
1. 临时注释掉 `subscribeBuildLogs` 的调用
2. 只保留 `chat_messages`、`ai_tasks`、`agent_events` 的订阅
3. 发送消息，观察是否能收到事件

**预期结果**：
- 如果能收到事件，说明 `build_logs` 订阅确实是问题根源
- 如果仍然收不到，说明问题在其他地方

### 实验 2：增强错误日志

**目的**：获取 `CHANNEL_ERROR` 的详细错误信息

**步骤**：
1. 在 `subscribe` 回调中，当状态为 `CHANNEL_ERROR` 时，打印完整的 `statusOrObj` 对象
2. 包括 `reason`、`error`、`message` 等字段

## 修复方案

### 方案 1：错误隔离 + 自动重试

**思路**：当某个频道出现 `CHANNEL_ERROR` 时，不影响其他频道，并尝试自动重试

**实现**：
1. 在 `CHANNEL_ERROR` 时，记录详细错误信息
2. 自动移除失败的频道
3. 延迟一段时间后自动重试订阅
4. 设置最大重试次数，避免无限重试

### 方案 2：订阅顺序优化

**思路**：调整订阅顺序，确保关键订阅（`chat_messages`、`ai_tasks`）优先建立

**实现**：
1. 先订阅 `chat_messages` 和 `ai_tasks`（核心功能）
2. 再订阅 `agent_events`（Activity Timeline）
3. 最后订阅 `build_logs`（构建日志，非核心）
4. 如果 `build_logs` 失败，不影响其他订阅

### 方案 3：连接状态监控 + 重连机制

**思路**：监控 WebSocket 连接状态，在检测到异常时主动重连

**实现**：
1. 添加连接状态监控
2. 当检测到多个频道无法接收事件时，触发重连
3. 重连后重新建立所有订阅

## 推荐方案

综合考虑实现复杂度和效果，推荐采用 **方案 1 + 方案 2** 的组合：

1. **错误隔离**：单个频道的错误不影响其他频道
2. **订阅顺序优化**：关键订阅优先
3. **自动重试**：失败的订阅自动重试
4. **详细日志**：记录完整的错误信息便于调试

## 实现计划

### 第一步：增强错误日志

在 `realtimeClient.ts` 中，当状态为 `CHANNEL_ERROR` 或 `CLOSED` 时，打印完整的错误对象：

```typescript
if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
  console.error(`[RealtimeClient] 频道 ${uniqueChannelName} 状态异常:`, {
    status,
    fullResponse: JSON.stringify(statusOrObj),
    table,
    filter,
    event
  });
}
```

### 第二步：实现自动重试机制

```typescript
// 在 CHANNEL_ERROR 时自动重试
if (status === 'CHANNEL_ERROR') {
  const retryCount = this.retryCountMap.get(uniqueChannelName) || 0;
  if (retryCount < MAX_RETRY_COUNT) {
    this.retryCountMap.set(uniqueChannelName, retryCount + 1);
    setTimeout(() => {
      this.retrySubscription(subscriptionId);
    }, RETRY_DELAY_MS * (retryCount + 1));
  }
}
```

### 第三步：优化订阅顺序

在 `useAgentEvents` 和 `useBuildLogs` 中，确保关键订阅优先建立。

## 验收标准

1. 首次进入项目时，发送消息后能立即在构建日志中看到"开始处理 AI 任务: chat_reply"
2. AI 回复能通过 Realtime 实时推送，无需刷新页面
3. 控制台日志显示所有频道都能正常接收事件
4. 如果某个频道失败，不影响其他频道的正常工作

## 测试步骤

1. `npm install && npm run dev`
2. 使用测试账号登录（1145@1.com / 111111）
3. 打开一个项目
4. 发送一条测试消息
5. 观察控制台日志：
   - 应该看到 `[RealtimeClient] 收到事件 INSERT on chat_messages`
   - 应该看到 `[RealtimeClient] 收到事件 UPDATE on ai_tasks`
   - 应该看到 `[RealtimeClient] 收到事件 INSERT on build_logs`（如果 Edge Function 插入了构建日志）
6. 观察 UI：
   - 构建日志面板应该显示"开始处理 AI 任务: chat_reply"
   - AI 回复应该自动出现在聊天面板中
