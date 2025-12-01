# Agent 事件规范 (Agent Events Specification)

本文档定义了 AI Agent 在执行任务过程中产生的所有事件类型及其数据结构。这些事件用于驱动前端 Activity Timeline 的实时展示。

## 0. 数据库表结构 (Step 3 新增)

### agent_events 表

```sql
CREATE TABLE agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid,                           -- 关联的 AI 任务 ID（可为空）
  project_id uuid NOT NULL,               -- 关联的项目 ID
  type text NOT NULL,                     -- 事件类型
  payload jsonb NOT NULL DEFAULT '{}',    -- 事件详细数据
  created_at timestamptz DEFAULT now()    -- 创建时间
);

-- 索引
CREATE INDEX idx_agent_events_project_id ON agent_events(project_id);
CREATE INDEX idx_agent_events_task_id ON agent_events(task_id);
CREATE INDEX idx_agent_events_created_at ON agent_events(created_at DESC);
CREATE INDEX idx_agent_events_type ON agent_events(type);

-- 启用 Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE agent_events;
ALTER TABLE agent_events REPLICA IDENTITY FULL;
```

### 数据库事件类型约束

```sql
CHECK (type IN ('agent_phase', 'tool_call', 'file_update', 'self_repair', 'log', 'error'))
```

### 数据库记录示例

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "task_id": "123e4567-e89b-12d3-a456-426614174000",
  "project_id": "789e0123-e45b-67d8-a901-234567890abc",
  "type": "agent_phase",
  "payload": {
    "phase": "started",
    "status": "running",
    "taskType": "build_site",
    "model": "google/gemini-3-pro-preview"
  },
  "created_at": "2025-11-29T14:00:00.000Z"
}
```

## 1. 事件基础结构

所有事件共享以下基础结构：

```typescript
interface BaseAgentEvent {
  id: string;                    // 事件唯一标识
  type: AgentEventType;          // 事件类型
  timestamp: string;             // ISO 8601 时间戳
  taskId: string;                // 关联的 AI 任务 ID
  projectId: string;             // 关联的项目 ID
}
```

## 2. 事件类型 (AgentEventType)

```typescript
type AgentEventType =
  | 'agent_phase'      // Agent 阶段变化（Planner/Coder/Reviewer/Debugger）
  | 'tool_call'        // 工具调用
  | 'file_update'      // 文件操作（create/update/delete/move）
  | 'self_repair'      // 自修复尝试
  | 'log'              // 通用日志
  | 'error';           // 错误事件
```

## 3. 详细事件定义

### 3.1 agent_phase - 阶段事件

表示 Agent 进入或退出某个处理阶段。

```typescript
interface AgentPhaseEvent extends BaseAgentEvent {
  type: 'agent_phase';
  payload: {
    phase: 'planner' | 'coder' | 'reviewer' | 'debugger';
    action: 'enter' | 'exit';
    summary?: string;            // 阶段摘要
  };
}
```

### 3.2 tool_call - 工具调用事件

表示 Agent 调用了某个工具。

```typescript
interface ToolCallEvent extends BaseAgentEvent {
  type: 'tool_call';
  payload: {
    toolName: string;            // 工具名称，包括 'move_file'
    argsSummary?: string;        // 参数摘要
    resultSummary?: string;      // 结果摘要
    success: boolean;            // 是否成功
    duration?: number;           // 执行时长（毫秒）
    
    // move_file 专用字段
    fromPath?: string;           // 源路径（move_file 时使用）
    toPath?: string;             // 目标路径（move_file 时使用）
  };
}
```

**支持的工具名称：**
- `generate_image` - 生成图片
- `list_files` - 列出文件
- `read_file` - 读取文件
- `write_file` - 写入文件
- `delete_file` - 删除文件
- `search_files` - 搜索文件
- `get_project_structure` - 获取项目结构
- `move_file` - 移动/重命名文件 **（新增）**

### 3.3 file_update - 文件操作事件

表示文件系统发生了变化。

```typescript
interface FileUpdateEvent extends BaseAgentEvent {
  type: 'file_update';
  payload: {
    path: string;                // 目标路径（move 时为 toPath）
    op: 'create' | 'update' | 'delete' | 'move';
    summary?: string;            // 操作摘要
    
    // move 专用字段
    fromPath?: string;           // 源路径（仅 op='move' 时存在）
    toPath?: string;             // 目标路径（仅 op='move' 时存在）
    
    // 可选元数据
    fileSize?: number;           // 文件大小
    mimeType?: string;           // MIME 类型
  };
}
```

### 3.4 self_repair - 自修复事件

表示 Agent 进入自修复循环。

```typescript
interface SelfRepairEvent extends BaseAgentEvent {
  type: 'self_repair';
  payload: {
    attemptNumber: number;       // 尝试次数（1-3）
    maxAttempts: number;         // 最大尝试次数
    trigger: string;             // 触发原因
    errorType?: string;          // 错误类型
    errorMessage?: string;       // 错误信息
    suggestion?: string;         // 修复建议
    result: 'pending' | 'success' | 'failed';
  };
}
```

### 3.5 log - 通用日志事件

用于未分类的日志信息。

```typescript
interface LogEvent extends BaseAgentEvent {
  type: 'log';
  payload: {
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    metadata?: Record<string, unknown>;
  };
}
```

### 3.6 error - 错误事件

表示发生了错误。

```typescript
interface ErrorEvent extends BaseAgentEvent {
  type: 'error';
  payload: {
    errorType: string;           // 错误类型
    message: string;             // 错误信息
    stack?: string;              // 堆栈信息
    recoverable: boolean;        // 是否可恢复
  };
}
```

## 4. 联合类型

```typescript
type AgentEvent =
  | AgentPhaseEvent
  | ToolCallEvent
  | FileUpdateEvent
  | SelfRepairEvent
  | LogEvent
  | ErrorEvent;
```

## 5. move_file 工具规范

### 5.1 工具定义

```typescript
{
  name: 'move_file',
  description: '移动或重命名文件。将文件从一个路径移动到另一个路径。',
  parameters: {
    type: 'object',
    properties: {
      fromPath: {
        type: 'string',
        description: '源文件路径，相对于项目根目录'
      },
      toPath: {
        type: 'string',
        description: '目标文件路径，相对于项目根目录'
      },
      overwrite: {
        type: 'boolean',
        description: '目标文件已存在时是否覆盖（默认 false）'
      }
    },
    required: ['fromPath', 'toPath']
  }
}
```

### 5.2 返回值

```typescript
interface MoveFileResult {
  success: boolean;
  message?: string;
}
```

### 5.3 错误场景

| 场景 | success | message |
|------|---------|---------|
| 源文件不存在 | false | "源文件不存在: {fromPath}" |
| 目标已存在且 overwrite=false | false | "目标文件已存在: {toPath}" |
| IO/权限错误 | false | "移动文件失败: {error}" |
| 成功 | true | "文件已移动: {fromPath} → {toPath}" |

## 6. 事件产生时机

### 6.1 tool_call 事件

当 Agent 调用 `move_file` 工具时，产生 `tool_call` 事件：

```typescript
{
  type: 'tool_call',
  payload: {
    toolName: 'move_file',
    argsSummary: 'src/old.ts → src/new.ts',
    fromPath: 'src/old.ts',
    toPath: 'src/new.ts',
    success: true,
    resultSummary: '文件已移动'
  }
}
```

### 6.2 file_update 事件

`move_file` 成功后，产生 `file_update` 事件：

```typescript
{
  type: 'file_update',
  payload: {
    path: 'src/new.ts',
    op: 'move',
    fromPath: 'src/old.ts',
    toPath: 'src/new.ts',
    summary: '移动文件 src/old.ts → src/new.ts'
  }
}
```

## 7. 前端处理指南

### 7.1 Timeline 展示

- `agent_phase`: 显示为大节点，带阶段图标
- `tool_call`: 显示为子节点，带工具图标
  - `move_file`: 使用专门的移动图标，显示 "from → to"
- `file_update`: 显示为文件操作子项
  - `op=move`: 显示 "移动 from → to"
- `self_repair`: 显示为警告节点，带尝试次数
- `error`: 显示为错误节点，红色高亮

### 7.2 FileTree 同步

当收到 `file_update` 且 `op=move` 时：
1. 从 FileTree 中移除 `fromPath` 对应的节点
2. 在 `toPath` 位置添加新节点
3. 如果当前选中的文件是 `fromPath`，自动切换到 `toPath`

### 7.3 内存管理

- 保留最近 100 条事件
- move 事件不能被截断成孤儿
- 优先保留最近一次 move 的双方信息

## 8. 旧日志兼容

### 8.1 解析规则

旧日志格式可能包含以下模式：

```
[SelfRepairLoop] Attempt 1/3: ...
[move] src/old.ts → src/new.ts
[rename] src/old.ts to src/new.ts
```

解析映射：
- `[SelfRepairLoop]` → `self_repair` 事件
- `[move]` / `[rename]` → `file_update` 事件 (op=move)
- 未识别的日志 → `log` 事件

### 8.2 降级处理

无法解析的日志降级为 `log` 类型：

```typescript
{
  type: 'log',
  payload: {
    level: 'info',
    message: '原始日志内容',
    metadata: { raw: true }
  }
}
```
