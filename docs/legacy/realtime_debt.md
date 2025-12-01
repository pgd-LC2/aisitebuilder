# Realtime 技术债务盘点

本文档记录了前端代码中所有与实时更新相关的技术债务，包括轮询、watchdog、手动刷新等机制。

## 1. ChatPanel.tsx - 聊天面板

### 1.1 轮询机制 (pollTimerRef)

**位置**: `src/components/ChatPanel.tsx:33, 122-141`

**代码片段**:
```typescript
const pollTimerRef = useRef<number | null>(null);

const startPollingForReply = useCallback(() => {
  if (pollTimerRef.current) {
    clearInterval(pollTimerRef.current);
  }
  const startedAt = Date.now();
  console.log('开始轮询 AI 回复');
  pollTimerRef.current = window.setInterval(() => {
    if (!pendingReplyRef.current || Date.now() - startedAt > 60000) {
      console.log('AI 回复轮询超时或已完成，停止轮询');
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      pendingReplyRef.current = null;
      return;
    }
    console.log('轮询 AI 回复：调用 loadMessages()');
    loadMessages();
  }, 2500);
}, [loadMessages]);
```

**用途**: 每 2.5 秒轮询一次消息列表，作为 Realtime 订阅的备用机制，确保 AI 回复能被检测到。

**问题**:
- 频繁的数据库查询，增加服务器负载
- 与 Realtime 订阅功能重复
- 60 秒超时后可能丢失消息

**可否被事件流替代**: 是，通过统一的 Agent 事件流可以完全替代

---

### 1.2 Watchdog 定时器 (watchdogTimerRef)

**位置**: `src/components/ChatPanel.tsx:32, 361-376`

**代码片段**:
```typescript
const watchdogTimerRef = useRef<NodeJS.Timeout | null>(null);

// 在 handleSend 中
if (enableWatchdog) {
  watchdogTimerRef.current = setTimeout(() => {
    console.log('watchdog 触发：5秒内未收到 AI 回复，执行刷新');
    loadMessages();
    
    watchdogTimerRef.current = setTimeout(() => {
      console.log('watchdog 二次触发：15秒内仍未收到 AI 回复，再次刷新');
      loadMessages();
      watchdogTimerRef.current = null;
    }, 10000);
  }, 5000);
}
```

**用途**: 发送消息后 5 秒和 15 秒时触发刷新，作为 Realtime 订阅失败的兜底机制。

**问题**:
- 增加了代码复杂度
- 需要用户手动开关（在设置面板中）
- 可能导致不必要的数据库查询

**可否被事件流替代**: 是，通过可靠的事件流机制可以完全替代

---

### 1.3 手动刷新逻辑 (loadMessages)

**位置**: `src/components/ChatPanel.tsx:61-120`

**用途**: 从数据库加载完整消息列表，在多处被调用：
- 组件初始化时
- Realtime 订阅成功后的 catch-up 刷新
- watchdog 触发时
- 轮询触发时
- AI 任务完成但消息未到达时

**问题**:
- 每次都加载完整消息列表，效率低
- 多处调用导致逻辑分散

**可否被事件流替代**: 部分可以，初始加载仍需要，但后续更新应通过事件增量更新

---

### 1.4 CustomEvent 机制 (buildlog-added)

**位置**: `src/components/ChatPanel.tsx:355, 459-464`

**代码片段**:
```typescript
window.dispatchEvent(new CustomEvent('buildlog-added', { detail: logResult.data }));

const handleBuildLogAdded = useCallback((log: BuildLog) => {
  if (log.message === 'AI 任务处理完成' || log.message.includes('AI 任务处理完成')) {
    console.log('检测到 AI 任务处理完成日志，强制刷新消息');
    loadMessages();
  }
}, [loadMessages]);
```

**用途**: 通过 CustomEvent 在组件间传递构建日志，检测 AI 任务完成后刷新消息。

**问题**:
- 使用全局事件而非 React 状态管理
- 依赖日志消息内容来判断任务状态

**可否被事件流替代**: 是，通过统一的 Agent 事件流可以完全替代

---

## 2. BuildLogPanel.tsx - 构建日志面板

### 2.1 Realtime 订阅 (直接使用 supabase.channel)

**位置**: `src/components/BuildLogPanel.tsx:50-107`

**代码片段**:
```typescript
const channel = supabase
  .channel(channelName)
  .on('postgres_changes', {...}, (payload) => {
    appendLog(log);
  })
  .subscribe((status, err) => {...});
```

**用途**: 订阅 build_logs 表的 INSERT 事件，实时显示构建日志。

**问题**:
- 直接在组件中使用 supabase.channel，未通过统一的通道层
- 订阅状态频繁切换（SUBSCRIBED/CLOSED 循环）
- 与 CustomEvent 机制并存，逻辑重复

**可否被事件流替代**: 是，应收敛到统一的 Realtime 通道层

---

### 2.2 CustomEvent 监听器

**位置**: `src/components/BuildLogPanel.tsx:90-100`

**代码片段**:
```typescript
const handleBuildLogAdded = ((e: CustomEvent) => {
  const log = e.detail as BuildLog;
  appendLog(log);
}) as EventListener;

window.addEventListener('buildlog-added', handleBuildLogAdded);
```

**用途**: 监听 ChatPanel 发出的 buildlog-added 事件，作为 Realtime 的备用机制。

**问题**:
- 与 Realtime 订阅功能重复
- 使用全局事件而非 React 状态管理

**可否被事件流替代**: 是，通过统一的事件流可以完全替代

---

## 3. PreviewPanel.tsx - 预览面板

### 3.1 计时器 (setInterval for elapsed time)

**位置**: `src/components/PreviewPanel.tsx:899-904`

**代码片段**:
```typescript
const interval = setInterval(() => {
  setElapsedTime(Math.floor((Date.now() - installStartTime) / 1000));
}, 1000);
```

**用途**: 显示安装依赖的已用时间。

**问题**: 无，这是合理的 UI 计时器使用

**可否被事件流替代**: 否，这是纯 UI 功能，不涉及数据同步

---

## 4. SettingsContext.tsx - 设置上下文

### 4.1 Watchdog 开关设置

**位置**: `src/contexts/SettingsContext.tsx:4, 9-10, 17, 30-36, 48-55, 61-62`

**用途**: 提供 enableWatchdog 设置，允许用户开关 watchdog 功能。

**问题**:
- watchdog 本身是技术债务的兜底方案
- 增加了用户理解成本

**可否被事件流替代**: 是，移除 watchdog 后此设置也应移除

---

## 5. UserProfilePanel.tsx - 用户设置面板

### 5.1 Watchdog 开关 UI

**位置**: `src/components/UserProfilePanel.tsx:93-113`

**用途**: 显示 watchdog 开关的 UI 控件。

**可否被事件流替代**: 是，移除 watchdog 后此 UI 也应移除

---

## 6. Services 层 - 订阅方法

### 6.1 messageService.subscribeToMessages

**位置**: `src/services/messageService.ts:45-63`

**用途**: 提供消息订阅功能，但未被组件直接使用（组件直接使用 supabase.channel）。

**问题**: 服务层提供了订阅方法，但组件未使用，导致代码重复

**可否被事件流替代**: 是，应收敛到统一的 Realtime 通道层

---

### 6.2 aiTaskService.subscribeToTasks

**位置**: `src/services/aiTaskService.ts:62-80`

**用途**: 提供任务订阅功能，但未被组件直接使用。

**问题**: 同上

**可否被事件流替代**: 是，应收敛到统一的 Realtime 通道层

---

### 6.3 buildLogService.subscribeToBuildLogs

**位置**: `src/services/buildLogService.ts:42-60`

**用途**: 提供构建日志订阅功能，但未被组件直接使用。

**问题**: 同上

**可否被事件流替代**: 是，应收敛到统一的 Realtime 通道层

---

## 7. 其他 setTimeout 使用

### 7.1 UI 动画/延迟相关

以下 setTimeout 使用是合理的 UI 行为，不属于技术债务：

- `ChatPanel.tsx:56-58` - 添加消息后滚动到底部
- `ChatPanel.tsx:117-119` - 加载消息后滚动到底部
- `ChatPanel.tsx:283-286` - 获取消息失败后重试
- `ChatPanel.tsx:342-344` - 发送消息后滚动到底部
- `FileManagerPanel.tsx:385-389` - 上传完成后清理状态
- `CodeViewer.tsx:38` - 复制代码后的延迟
- `CodeViewer.tsx:59` - 复制成功提示消失
- `PreviewPanel.tsx:1127, 1137` - 小游戏翻牌延迟
- `ProjectsPage.tsx:41, 50` - 删除项目的动画延迟
- `HomePage.tsx:32-37` - 打字机效果动画
- `StatusIndicator.tsx:46` - 状态指示器动画
- `InitializingPage.tsx:60, 72` - 初始化页面动画

---

## 总结

### 需要移除的技术债务

| 位置 | 类型 | 优先级 |
|------|------|--------|
| ChatPanel.tsx - pollTimerRef | 轮询 | 高 |
| ChatPanel.tsx - watchdogTimerRef | Watchdog | 高 |
| ChatPanel.tsx - CustomEvent | 全局事件 | 中 |
| BuildLogPanel.tsx - CustomEvent | 全局事件 | 中 |
| SettingsContext.tsx - enableWatchdog | 设置项 | 低 |
| UserProfilePanel.tsx - watchdog UI | UI 控件 | 低 |

### 需要收敛到统一通道层的订阅

| 位置 | 订阅目标 |
|------|----------|
| ChatPanel.tsx | chat_messages INSERT |
| ChatPanel.tsx | ai_tasks UPDATE |
| BuildLogPanel.tsx | build_logs INSERT |
| messageService.ts | chat_messages INSERT |
| aiTaskService.ts | ai_tasks INSERT |
| buildLogService.ts | build_logs INSERT |

### 重构后的目标架构

所有 Realtime 订阅应收敛到 `src/realtime/` 目录，通过统一的通道层管理：
- 单一入口点初始化和管理连接
- 统一的错误处理和重连逻辑
- 组件通过 hooks 订阅事件，无需直接操作 supabase.channel
