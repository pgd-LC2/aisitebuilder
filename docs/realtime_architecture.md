# Realtime 事件驱动架构设计

本文档定义了前端 Realtime 系统的目标架构，用于替代现有的轮询/watchdog 机制。

## 1. 架构概述

### 1.1 设计原则

1. **单一通道层**: 所有 Realtime 订阅通过统一的通道层管理，禁止组件直接使用 `supabase.channel()`
2. **事件驱动**: UI 状态更新由事件触发，而非轮询
3. **初始快照 + 增量更新**: 启动时拉取完整数据，后续通过事件增量更新
4. **类型安全**: 所有事件和状态都有完整的 TypeScript 类型定义
5. **可靠性**: 内置重连机制和错误处理

### 1.2 目录结构

```
src/realtime/
├── index.ts                    # 统一导出
├── realtimeClient.ts           # Realtime 客户端管理
├── types.ts                    # 事件类型定义
├── subscribeAgentEvents.ts     # Agent 事件订阅
├── subscribeFileEvents.ts      # 文件事件订阅
├── subscribeBuildLogs.ts       # 构建日志订阅
└── hooks/
    ├── useAgentEvents.ts       # Agent 事件 Hook
    ├── useFileEvents.ts        # 文件事件 Hook
    └── useBuildLogs.ts         # 构建日志 Hook
```

## 2. 事件类型定义

### 2.1 Agent 事件流

Agent 事件流用于追踪 AI 任务的状态变化。

```typescript
// 事件类型
type AgentEventType = 
  | 'task_created'      // 任务创建
  | 'task_started'      // 任务开始执行
  | 'task_completed'    // 任务完成
  | 'task_failed'       // 任务失败
  | 'message_created';  // 新消息创建

// Agent 事件
interface AgentEvent {
  type: AgentEventType;
  timestamp: string;
  payload: {
    taskId?: string;
    messageId?: string;
    projectId: string;
    status?: AITaskStatus;
    result?: Record<string, unknown>;
    error?: string;
  };
}

// Agent 状态
interface AgentState {
  currentTask: AITask | null;
  messages: ChatMessage[];
  isProcessing: boolean;
  lastError: string | null;
}
```

### 2.2 文件事件流

文件事件流用于追踪项目文件的变化。

```typescript
// 事件类型
type FileEventType = 
  | 'file_created'      // 文件创建
  | 'file_updated'      // 文件更新
  | 'file_deleted';     // 文件删除

// 文件事件
interface FileEvent {
  type: FileEventType;
  timestamp: string;
  payload: {
    fileId: string;
    projectId: string;
    filePath: string;
    fileName: string;
  };
}

// 文件状态
interface FileState {
  files: ProjectFile[];
  lastUpdated: string | null;
}
```

### 2.3 构建日志事件流

构建日志事件流用于实时显示构建过程。

```typescript
// 构建日志事件
interface BuildLogEvent {
  type: 'log_created';
  timestamp: string;
  payload: BuildLog;
}

// 构建日志状态
interface BuildLogState {
  logs: BuildLog[];
}
```

## 3. Realtime 通道层

### 3.1 realtimeClient.ts

负责管理 Supabase Realtime 连接的单例客户端。

```typescript
interface RealtimeClientConfig {
  onConnectionChange?: (connected: boolean) => void;
  onError?: (error: Error) => void;
}

interface RealtimeClient {
  // 初始化客户端
  initialize(config?: RealtimeClientConfig): void;
  
  // 订阅频道
  subscribe<T>(
    channelName: string,
    table: string,
    event: 'INSERT' | 'UPDATE' | 'DELETE',
    filter: string,
    callback: (payload: T) => void
  ): () => void;  // 返回取消订阅函数
  
  // 获取连接状态
  isConnected(): boolean;
  
  // 清理所有订阅
  cleanup(): void;
}
```

**关键特性**:
- 单例模式，确保全局只有一个 Realtime 连接
- 自动重连机制
- 统一的错误日志输出
- 订阅引用计数，避免重复订阅

### 3.2 subscribeAgentEvents.ts

提供 Agent 事件订阅功能。

```typescript
interface SubscribeAgentEventsOptions {
  projectId: string;
  onTaskUpdate?: (task: AITask) => void;
  onMessageCreated?: (message: ChatMessage) => void;
  onError?: (error: Error) => void;
}

function subscribeAgentEvents(options: SubscribeAgentEventsOptions): () => void;
```

**实现细节**:
- 订阅 `ai_tasks` 表的 UPDATE 事件
- 订阅 `chat_messages` 表的 INSERT 事件
- 返回统一的取消订阅函数

### 3.3 subscribeFileEvents.ts

提供文件事件订阅功能。

```typescript
interface SubscribeFileEventsOptions {
  projectId: string;
  versionId?: string;
  onFileCreated?: (file: ProjectFile) => void;
  onFileUpdated?: (file: ProjectFile) => void;
  onFileDeleted?: (fileId: string) => void;
  onError?: (error: Error) => void;
}

function subscribeFileEvents(options: SubscribeFileEventsOptions): () => void;
```

### 3.4 subscribeBuildLogs.ts

提供构建日志订阅功能。

```typescript
interface SubscribeBuildLogsOptions {
  projectId: string;
  onLogCreated?: (log: BuildLog) => void;
  onError?: (error: Error) => void;
}

function subscribeBuildLogs(options: SubscribeBuildLogsOptions): () => void;
```

## 4. React Hooks

### 4.1 useAgentEvents

```typescript
interface UseAgentEventsOptions {
  projectId: string | undefined;
  onTaskCompleted?: (task: AITask) => void;
}

interface UseAgentEventsReturn {
  messages: ChatMessage[];
  currentTask: AITask | null;
  isProcessing: boolean;
  isConnected: boolean;
  appendMessage: (message: ChatMessage) => void;
  refreshMessages: () => Promise<void>;
}

function useAgentEvents(options: UseAgentEventsOptions): UseAgentEventsReturn;
```

**使用示例**:
```typescript
function ChatPanel({ projectId }) {
  const {
    messages,
    currentTask,
    isProcessing,
    isConnected,
    appendMessage,
    refreshMessages
  } = useAgentEvents({ projectId });
  
  // 组件渲染...
}
```

### 4.2 useFileEvents

```typescript
interface UseFileEventsOptions {
  projectId: string | undefined;
  versionId?: string;
}

interface UseFileEventsReturn {
  files: ProjectFile[];
  isLoading: boolean;
  isConnected: boolean;
  refreshFiles: () => Promise<void>;
}

function useFileEvents(options: UseFileEventsOptions): UseFileEventsReturn;
```

### 4.3 useBuildLogs

```typescript
interface UseBuildLogsOptions {
  projectId: string | undefined;
  onLogAdded?: (log: BuildLog) => void;
}

interface UseBuildLogsReturn {
  logs: BuildLog[];
  isLoading: boolean;
  isConnected: boolean;
  appendLog: (log: BuildLog) => void;
}

function useBuildLogs(options: UseBuildLogsOptions): UseBuildLogsReturn;
```

## 5. 状态 Reducer

### 5.1 Agent 状态 Reducer

```typescript
type AgentAction =
  | { type: 'SET_MESSAGES'; payload: ChatMessage[] }
  | { type: 'APPEND_MESSAGE'; payload: ChatMessage }
  | { type: 'SET_CURRENT_TASK'; payload: AITask | null }
  | { type: 'TASK_COMPLETED'; payload: AITask }
  | { type: 'TASK_FAILED'; payload: { taskId: string; error: string } }
  | { type: 'SET_PROCESSING'; payload: boolean };

function agentReducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case 'SET_MESSAGES':
      return { ...state, messages: action.payload };
    case 'APPEND_MESSAGE':
      if (state.messages.some(m => m.id === action.payload.id)) {
        return state;
      }
      return { ...state, messages: [...state.messages, action.payload] };
    case 'SET_CURRENT_TASK':
      return { ...state, currentTask: action.payload };
    case 'TASK_COMPLETED':
      return { 
        ...state, 
        currentTask: null, 
        isProcessing: false 
      };
    case 'TASK_FAILED':
      return { 
        ...state, 
        currentTask: null, 
        isProcessing: false,
        lastError: action.payload.error 
      };
    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.payload };
    default:
      return state;
  }
}
```

### 5.2 构建日志 Reducer

```typescript
type BuildLogAction =
  | { type: 'SET_LOGS'; payload: BuildLog[] }
  | { type: 'APPEND_LOG'; payload: BuildLog };

function buildLogReducer(state: BuildLogState, action: BuildLogAction): BuildLogState {
  switch (action.type) {
    case 'SET_LOGS':
      return { logs: action.payload };
    case 'APPEND_LOG':
      if (state.logs.some(l => l.id === action.payload.id)) {
        return state;
      }
      return { logs: [...state.logs, action.payload] };
    default:
      return state;
  }
}
```

## 6. 数据流

### 6.1 初始化流程

```
组件挂载
    ↓
调用 useAgentEvents/useBuildLogs
    ↓
初始化 realtimeClient（如果尚未初始化）
    ↓
拉取初始快照（loadMessages/loadLogs）
    ↓
建立 Realtime 订阅
    ↓
订阅成功后，检查是否需要 catch-up 刷新
    ↓
组件就绪，等待事件
```

### 6.2 事件处理流程

```
Supabase Realtime 推送事件
    ↓
realtimeClient 接收事件
    ↓
调用订阅回调函数
    ↓
Hook 内部 dispatch action
    ↓
Reducer 更新状态
    ↓
React 重新渲染组件
```

### 6.3 清理流程

```
组件卸载
    ↓
useEffect cleanup 函数执行
    ↓
调用 unsubscribe 函数
    ↓
realtimeClient 移除订阅
    ↓
如果没有其他订阅，关闭频道
```

## 7. 错误处理

### 7.1 连接错误

- 自动重连，最多重试 3 次
- 重连间隔指数退避（1s, 2s, 4s）
- 重连失败后通知用户

### 7.2 订阅错误

- 记录错误日志
- 通过 onError 回调通知组件
- 组件可以显示错误状态或降级到手动刷新

### 7.3 数据一致性

- 每次订阅成功后执行 catch-up 刷新
- 使用版本号防止过期数据覆盖新数据
- 消息/日志去重（通过 ID 检查）

## 8. SSR 兼容性

为确保 SSR/静态构建不会报错：

```typescript
// realtimeClient.ts
function initialize(config?: RealtimeClientConfig): void {
  // 检查是否在浏览器环境
  if (typeof window === 'undefined') {
    console.warn('Realtime client 只能在浏览器环境中初始化');
    return;
  }
  
  // 初始化逻辑...
}
```

所有 hooks 也应在 useEffect 中进行订阅，避免 SSR 时执行。

## 9. 迁移计划

### 第一阶段：创建基础设施
1. 创建 `src/realtime/` 目录
2. 实现 `realtimeClient.ts`
3. 实现事件类型定义

### 第二阶段：实现订阅函数
1. 实现 `subscribeAgentEvents.ts`
2. 实现 `subscribeBuildLogs.ts`
3. 实现 `subscribeFileEvents.ts`（预留）

### 第三阶段：实现 Hooks
1. 实现 `useAgentEvents.ts`
2. 实现 `useBuildLogs.ts`
3. 实现 `useFileEvents.ts`（预留）

### 第四阶段：迁移组件
1. 迁移 `ChatPanel.tsx` 使用新 hooks
2. 迁移 `BuildLogPanel.tsx` 使用新 hooks
3. 移除旧的轮询/watchdog 逻辑

### 第五阶段：清理
1. 移除 `SettingsContext.tsx` 中的 watchdog 设置
2. 移除 `UserProfilePanel.tsx` 中的 watchdog UI
3. 移除 services 层中未使用的订阅方法
4. 更新文档

## 10. 测试要点

1. **连接测试**: 验证 Realtime 连接建立和重连
2. **订阅测试**: 验证事件订阅和取消订阅
3. **数据一致性测试**: 验证初始快照和增量更新的一致性
4. **错误处理测试**: 验证各种错误场景的处理
5. **内存泄漏测试**: 验证组件卸载后订阅正确清理
