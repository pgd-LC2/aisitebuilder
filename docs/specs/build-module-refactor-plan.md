# Build 模块重构方案

> **版本**: v2.0
> **日期**: 2025-12-21
> **状态**: 待审批

## 一、概述

### 1.1 目标

**彻底删除**现有的 `selfRepair/`、`subagent/` 目录及 `spawn_subagent` 工具（"屎山"代码），创建全新的 `build/` 模块，统一 build 模式的处理逻辑。

### 1.2 设计原则

1. **单一职责**：`build/` 模块只负责 build 模式的业务编排，不重复实现 AgentLoop/工具执行/流式输出等通用能力
2. **复用优先**：直接复用 TaskRunner，与 chat/plan 模式保持一致的执行流程
3. **彻底清除**：**不保留任何向后兼容**，完全删除所有 selfRepair/subagent 相关代码、类型、事件
4. **最小改动**：主程序只做 claim + 分发，build 的"怎么跑"都在 build 模块里

### 1.3 行为变更说明

> **重要**：此次重构是**产品/行为变更**，不是 dead-code cleanup。

删除 selfRepair 后：
- ❌ 不再有自动错误修复循环（最多 3 次重试）
- ❌ 不再有 Debugger 诊断和自动修复建议
- ❌ 不再有 spawn_subagent 工具（子代理能力）
- ❌ 历史 self_repair 事件将被清除，不再显示
- ✅ 所有失败将直接失败并反馈给用户
- ✅ 代码更简洁，所有模式统一流程

---

## 二、新模块架构

### 2.1 目录结构

```
supabase/functions/_shared/ai/build/
├── index.ts              # 对外唯一入口，export handleBuildTask
├── types.ts              # Build 专属类型（BuildTaskInput, BuildTaskResult）
├── buildTaskHandler.ts   # build 主流程：映射 → 执行 TaskRunner → 返回
├── buildConfig.ts        # build 专属配置（maxIterations、模型选择等）
└── README.md             # 模块自解释文档
```

### 2.2 对外 API

```typescript
// build/index.ts
export { handleBuildTask } from './buildTaskHandler.ts';
export type { BuildTaskInput, BuildTaskResult } from './types.ts';
```

### 2.3 核心接口

```typescript
// build/types.ts
export interface BuildTaskInput {
  task: {
    id: string;
    type: string;
    project_id: string;
    payload?: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
  };
  supabase: SupabaseClient;
  apiKey: string;
  projectFilesContext?: {
    bucket: string;
    path: string;
    versionId?: string;
  };
}

export interface BuildTaskResult {
  success: boolean;
  taskId: string;
  finalResponse?: string;
  modifiedFiles?: string[];
  generatedImages?: string[];
  error?: string;
}
```

### 2.4 主处理函数

```typescript
// build/buildTaskHandler.ts
import { createTaskRunner } from '../core/taskRunner.ts';
import { BUILD_CONFIG } from './buildConfig.ts';
import type { BuildTaskInput, BuildTaskResult } from './types.ts';

export async function handleBuildTask(input: BuildTaskInput): Promise<BuildTaskResult> {
  const { task, supabase, apiKey, projectFilesContext } = input;

  const versionId = projectFilesContext?.versionId || 'default';
  const bucket = projectFilesContext?.bucket || 'project-files';
  const basePath = projectFilesContext?.path || `${task.project_id}/${versionId}`;

  const runner = createTaskRunner(supabase, {
    apiKey,
    maxIterations: BUILD_CONFIG.maxIterations,
  });

  const result = await runner.run({
    taskId: task.id,
    projectId: task.project_id,
    mode: 'build',
    versionId,
    bucket,
    basePath,
    payload: task.payload,
  });

  return {
    success: result.success,
    taskId: result.taskId,
    finalResponse: result.finalResponse,
    modifiedFiles: result.modifiedFiles,
    generatedImages: result.generatedImages,
    error: result.error,
  };
}
```

---

## 三、删除清单

### 3.1 代码删除

| 路径 | 类型 | 说明 |
|------|------|------|
| `_shared/ai/selfRepair/debugger.ts` | 文件 | 307 行，错误诊断模块 |
| `_shared/ai/selfRepair/loop.ts` | 文件 | 231 行，自我修复循环 |
| `_shared/ai/selfRepair/` | 目录 | 整个目录删除 |
| `_shared/ai/subagent/index.ts` | 文件 | 52 行，统一导出 |
| `_shared/ai/subagent/types.ts` | 文件 | 类型定义 |
| `_shared/ai/subagent/registry.ts` | 文件 | 注册表 |
| `_shared/ai/subagent/executor.ts` | 文件 | 执行器 |
| `_shared/ai/subagent/handlers/refactorCode.ts` | 文件 | 重构代码 handler |
| `_shared/ai/subagent/handlers/` | 目录 | handlers 目录 |
| `_shared/ai/subagent/` | 目录 | 整个目录删除 |

### 3.2 代码修改

#### 3.2.1 `_shared/ai/index.ts`

删除以下导出：

```typescript
// 删除：自我修复导出（第 132-144 行）
export {
  isRepairableError,
  classifyError,
  collectErrorContext,
  parseDebuggerOutput,
  invokeDebugger
} from './selfRepair/debugger.ts';

export {
  applyRepairSuggestions,
  processTaskWithSelfRepair
} from './selfRepair/loop.ts';

// 删除：Subagent 系统导出（第 146-164 行）
export type {
  SubagentType,
  SubagentConfig,
  SubagentContext,
  SubagentTaskParams,
  SubagentResult
} from './subagent/index.ts';

export {
  MAX_NESTING_LEVEL,
  executeSubagent,
  canSpawnSubagent,
  getAvailableSubagentTypes,
  initializeBuiltinSubagents,
  registerSubagent,
  hasSubagent,
  getRegisteredSubagentTypes
} from './subagent/index.ts';
```

新增 build 模块导出：

```typescript
// 新增：Build 模块
export { handleBuildTask } from './build/index.ts';
export type { BuildTaskInput, BuildTaskResult } from './build/index.ts';
```

#### 3.2.2 `_shared/ai/tools/definitions.ts`

删除 `spawn_subagent` 工具定义（第 230-255 行）：

```typescript
// 删除整个 spawn_subagent 工具定义
{
  type: 'function',
  function: {
    name: 'spawn_subagent',
    // ...
  }
}
```

修改 `SPECIAL_TOOLS` 常量（第 21 行）：

```typescript
// 修改前
const SPECIAL_TOOLS = ['generate_image', 'spawn_subagent'];

// 修改后
const SPECIAL_TOOLS = ['generate_image'];
```

#### 3.2.3 `_shared/ai/tools/executor.ts`

删除 `spawn_subagent` 的 case 处理（搜索 `spawn_subagent` 相关代码）。

#### 3.2.4 `_shared/ai/logging/buildLog.ts`

**删除**以下函数：
- `logSelfRepairAttemptToBuildLog()`
- `logSelfRepairFinalStatusToBuildLog()`

#### 3.2.5 `_shared/ai/logging/agentEvents.ts`

**删除**以下函数：
- `logSelfRepairAttempt()`
- `logSelfRepairFinalStatus()`

#### 3.2.6 `_shared/ai/types.ts`

**删除**以下类型定义：

```typescript
// 删除：自我修复相关类型（第 8-53 行）
export interface ErrorContext { ... }
export interface FileModification { ... }
export interface DebuggerSuggestion { ... }
export interface VerificationResult { ... }
export interface RepairAttempt { ... }
export interface SelfRepairLoopResult { ... }
```

**修改** `AgentEventType`，移除 `'self_repair'`：

```typescript
// 修改前
export type AgentEventType = 'agent_phase' | 'tool_call' | 'file_update' | 'self_repair' | 'log' | 'error';

// 修改后
export type AgentEventType = 'agent_phase' | 'tool_call' | 'file_update' | 'log' | 'error';
```

#### 3.2.7 `_shared/ai/config.ts`

删除 `SELF_REPAIR_MAX` 常量（如果存在）。

#### 3.2.8 `process-ai-tasks/index.ts`

**删除**：
- selfRepair 相关导入（第 30-31 行）
- subagent 初始化（第 36-37 行）
- build 模式的 selfRepair 分支（第 214-236 行）

**修改**：

```typescript
// 修改前（第 167-236 行）
const mode = task.mode
  ? (task.mode as 'chat' | 'plan' | 'build')
  : mapToInteractionMode(task.type as TaskType, ...);

if (mode === 'chat' || mode === 'plan') {
  // 使用 TaskRunner
} else {
  // 使用 selfRepair（删除这个分支）
}

// 修改后
import { handleBuildTask } from '../_shared/ai/build/index.ts';

const mode = task.mode
  ? (task.mode as 'chat' | 'plan' | 'build')
  : mapToInteractionMode(task.type as TaskType, ...);

if (mode === 'chat' || mode === 'plan') {
  // 使用 TaskRunner（保持不变）
  const runner = createTaskRunner(supabase, { apiKey: openrouterApiKey });
  await runner.run({ ... });
} else {
  // build 模式：调用新的 build 模块
  await handleBuildTask({
    task,
    supabase,
    apiKey: openrouterApiKey,
    projectFilesContext,
  });
}
```

---

## 四、前端代码删除

### 4.1 `src/realtime/types.ts`

**修改** `TimelineEventType`，移除 `'self_repair'`：

```typescript
// 修改前
export type TimelineEventType =
  | 'agent_phase'
  | 'tool_call'
  | 'file_update'
  | 'self_repair'
  | 'log'
  | 'error';

// 修改后
export type TimelineEventType =
  | 'agent_phase'
  | 'tool_call'
  | 'file_update'
  | 'log'
  | 'error';
```

**删除** `SelfRepairEvent` 接口（第 142-153 行）。

**修改** `TimelineEvent` 联合类型，移除 `SelfRepairEvent`。

**修改** `TimelineState`，移除 `repairs` 字段。

**修改** `UseTimelineEventsReturn`，移除 `repairs` 字段。

**修改** `DbAgentEvent.type`，移除 `'self_repair'`。

### 4.2 `src/realtime/index.ts`

**删除** `SelfRepairEvent` 导出（第 26 行）。

### 4.3 `src/realtime/hooks/useTimelineEvents.ts`

**删除** `SelfRepairEvent` 导入（第 19 行）。

**修改** `initialState`，移除 `repairs` 字段。

**删除** `timelineReducer` 中的 `self_repair` case（第 67-68 行）。

**删除** `SET_EVENTS` 中的 `repairs` 过滤（第 88 行）。

**删除** `parseDbAgentEventToTimelineEvent` 中的 `self_repair` case（第 189-216 行）。

**修改**返回值，移除 `repairs` 和 `limitedRepairs`。

### 4.4 `src/components/chat/ActivityTimeline.tsx`

**删除** `SelfRepairEvent` 导入（第 37 行）。

**删除** `BoltRepairItem` 组件（第 161-188 行）。

**修改** `useTimelineEvents` 解构，移除 `repairs`。

**删除**自修复事件渲染部分（第 349-356 行）。

### 4.5 测试文件修改

`tests/generated/realtime/hooks/useTimelineEvents.test.ts`：
- **删除**所有 `self_repair` 相关测试用例

---

## 五、文档更新

### 5.1 需要更新的文档

| 文档路径 | 修改内容 |
|----------|----------|
| `README.md` | 更新目录结构，移除 selfRepair/ 和 subagent/，添加 build/ |
| `AGENTS.md` | 如有提及 selfRepair/subagent，需要更新 |
| `docs/specs/task-workflow-architecture.md` | **删除**"自我修复循环"章节 |
| `docs/specs/process-ai-tasks-refactor.md` | 更新架构图和模块说明 |
| `docs/specs/agent_events_spec.md` | **删除** self_repair 事件类型说明 |

### 5.2 需要删除的文档

| 文档路径 | 处理方式 |
|----------|----------|
| `docs/legacy/self_repair_notes.md` | **完全删除** |

### 5.3 README.md 目录结构更新

```markdown
│   │   │       ├── build/            # Build 模式处理模块（新）
│   │   │       │   ├── index.ts      # 统一导出
│   │   │       │   ├── types.ts      # 类型定义
│   │   │       │   ├── buildTaskHandler.ts  # 主处理逻辑
│   │   │       │   └── buildConfig.ts       # 配置
# 以下目录已删除，不再出现在目录结构中：
# - selfRepair/
# - subagent/
```

---

## 六、数据库清理迁移

### 6.1 需要删除的历史数据

| 表 | 字段/值 | 操作 |
|----|---------|------|
| `agent_events` | `type = 'self_repair'` | **删除所有记录** |
| `build_logs` | `metadata.selfRepairStatus` | **从 metadata 中移除该字段** |
| `build_logs` | `metadata.selfRepairAttempt` | **从 metadata 中移除该字段** |

### 6.2 数据库迁移脚本

创建迁移文件：`supabase/migrations/YYYYMMDDHHMMSS_remove_self_repair_events.sql`

```sql
-- 删除所有 self_repair 事件
DELETE FROM agent_events WHERE type = 'self_repair';

-- 更新 agent_events.type 的 CHECK 约束，移除 'self_repair'
ALTER TABLE agent_events DROP CONSTRAINT IF EXISTS agent_events_type_check;
ALTER TABLE agent_events ADD CONSTRAINT agent_events_type_check
  CHECK (type IN ('agent_phase', 'tool_call', 'file_update', 'log', 'error', 'progress'));

-- 清理 build_logs 中的 selfRepair 相关 metadata
UPDATE build_logs
SET metadata = metadata - 'selfRepairStatus' - 'selfRepairAttempt'
WHERE metadata ? 'selfRepairStatus' OR metadata ? 'selfRepairAttempt';
```

### 6.3 `ai_tasks.mode` 字段处理

**重要**：`ai_tasks.mode` 字段目前不填写，为以后的功能做准备。

**要求**：
1. 后端代码不应主动填写 `mode` 字段
2. 前端代码不应主动填写 `mode` 字段
3. 字段位置应调整到 `type` 字段右边（如需调整表结构）

**原因**：
- 当前 `mode` 字段的使用存在混乱（前端写 `type`，后端用 `mapToInteractionMode` 推断）
- 保留该字段为空，等待后续统一设计
- 避免产生不一致的历史数据

**代码修改**：
- 移除所有主动写入 `mode` 字段的代码
- 后端使用 `mapToInteractionMode(task.type)` 推断模式（已有逻辑）

### 6.4 迁移执行

使用 MCP 执行迁移
用 CLI 部署 Edge Function

---

## 七、知识库更新

### 7.1 需要删除的知识笔记

| 笔记名称 | 处理方式 |
|----------|----------|
| "自修复系统：错误分类、流程与优化要点" | **完全删除** |

### 7.2 需要更新的知识笔记

| 笔记名称 | 处理方式 |
|----------|----------|
| "Edge Function 模块化架构规范" | 更新目录结构，移除 selfRepair/ 和 subagent/，添加 build/ 模块说明 |
| "工具能力矩阵与权限控制" | **删除** spawn_subagent 相关内容 |

---

## 八、验收清单

### 8.1 后端代码验收

- [ ] `selfRepair/` 目录已删除
- [ ] `subagent/` 目录已删除
- [ ] `spawn_subagent` 工具已从 definitions.ts 移除
- [ ] `spawn_subagent` 处理已从 executor.ts 移除
- [ ] `build/` 模块已创建并正确导出
- [ ] `process-ai-tasks/index.ts` 已更新为调用 build 模块
- [ ] `_shared/ai/index.ts` 导出已更新
- [ ] `_shared/ai/types.ts` 中 selfRepair 相关类型已删除
- [ ] `_shared/ai/types.ts` 中 `AgentEventType` 已移除 `'self_repair'`
- [ ] `_shared/ai/logging/buildLog.ts` 中 selfRepair 函数已删除
- [ ] `_shared/ai/logging/agentEvents.ts` 中 selfRepair 函数已删除
- [ ] `_shared/ai/config.ts` 中 `SELF_REPAIR_MAX` 常量已删除

### 8.2 前端代码验收

- [ ] `src/realtime/types.ts` 中 `SelfRepairEvent` 接口已删除
- [ ] `src/realtime/types.ts` 中 `TimelineEventType` 已移除 `'self_repair'`
- [ ] `src/realtime/types.ts` 中 `TimelineState.repairs` 字段已删除
- [ ] `src/realtime/index.ts` 中 `SelfRepairEvent` 导出已删除
- [ ] `src/realtime/hooks/useTimelineEvents.ts` 中 self_repair 处理已删除
- [ ] `src/components/chat/ActivityTimeline.tsx` 中 `BoltRepairItem` 组件已删除
- [ ] `src/components/chat/ActivityTimeline.tsx` 中 repairs 渲染已删除

### 8.3 数据库验收

- [ ] 迁移脚本已创建：`remove_self_repair_events.sql`
- [ ] `agent_events` 表中 `type='self_repair'` 记录已删除
- [ ] `agent_events.type` CHECK 约束已更新（移除 'self_repair'）
- [ ] `build_logs.metadata` 中 selfRepair 字段已清理

### 8.4 测试验收

- [ ] `npm run lint` 通过
- [ ] `npm run typecheck` 通过
- [ ] `npm run test` 通过
- [ ] `tests/generated/realtime/hooks/useTimelineEvents.test.ts` 中 self_repair 测试已删除
- [ ] 手动测试：chat 模式正常工作
- [ ] 手动测试：plan 模式正常工作
- [ ] 手动测试：build 模式正常工作（使用新模块）

### 8.5 文档验收

- [ ] README.md 目录结构已更新
- [ ] task-workflow-architecture.md 已更新
- [ ] agent_events_spec.md 已更新
- [ ] `docs/legacy/self_repair_notes.md` 已删除
- [ ] 知识库笔记已更新/删除

---

## 九、执行步骤

### 阶段 1：创建新模块（预计 1 小时）

1. 创建 `_shared/ai/build/` 目录
2. 创建 `types.ts`、`buildConfig.ts`、`buildTaskHandler.ts`、`index.ts`
3. 更新 `_shared/ai/index.ts` 添加 build 模块导出

### 阶段 2：修改主程序（预计 30 分钟）

1. 修改 `process-ai-tasks/index.ts`
2. 删除 selfRepair 导入和调用
3. 删除 subagent 初始化
4. 添加 build 模块调用

### 阶段 3：删除后端旧代码（预计 1 小时）

1. 删除 `selfRepair/` 目录
2. 删除 `subagent/` 目录
3. 修改 `tools/definitions.ts` 移除 spawn_subagent
4. 修改 `tools/executor.ts` 移除 spawn_subagent 处理
5. 修改 `_shared/ai/types.ts` 删除 selfRepair 相关类型，移除 `AgentEventType` 中的 `'self_repair'`
6. 修改 `_shared/ai/logging/buildLog.ts` 删除 selfRepair 函数
7. 修改 `_shared/ai/logging/agentEvents.ts` 删除 selfRepair 函数
8. 修改 `_shared/ai/config.ts` 删除 `SELF_REPAIR_MAX` 常量

### 阶段 4：删除前端旧代码（预计 1 小时）

1. 修改 `src/realtime/types.ts`：
   - 删除 `SelfRepairEvent` 接口
   - 移除 `TimelineEventType` 中的 `'self_repair'`
   - 移除 `TimelineEvent` 联合类型中的 `SelfRepairEvent`
   - 移除 `TimelineState` 中的 `repairs` 字段
   - 移除 `UseTimelineEventsReturn` 中的 `repairs` 字段
   - 移除 `DbAgentEvent.type` 中的 `'self_repair'`
2. 修改 `src/realtime/index.ts`：删除 `SelfRepairEvent` 导出
3. 修改 `src/realtime/hooks/useTimelineEvents.ts`：
   - 删除 `SelfRepairEvent` 导入
   - 删除 `initialState` 中的 `repairs` 字段
   - 删除 `timelineReducer` 中的 `self_repair` case
   - 删除 `SET_EVENTS` 中的 `repairs` 过滤
   - 删除 `parseDbAgentEventToTimelineEvent` 中的 `self_repair` case
   - 修改返回值，移除 `repairs` 和 `limitedRepairs`
4. 修改 `src/components/chat/ActivityTimeline.tsx`：
   - 删除 `SelfRepairEvent` 导入
   - 删除 `BoltRepairItem` 组件
   - 修改 `useTimelineEvents` 解构，移除 `repairs`
   - 删除自修复事件渲染部分

### 阶段 5：创建数据库迁移（预计 30 分钟）

1. 创建迁移文件 `supabase/migrations/YYYYMMDDHHMMSS_remove_self_repair_events.sql`
2. 编写 SQL：删除 self_repair 事件、更新 CHECK 约束、清理 metadata
3. 执行迁移
4. 部署edgefuction
5. 验证结果

### 阶段 6：运行测试（预计 30 分钟）

1. 删除 `tests/generated/realtime/hooks/useTimelineEvents.test.ts` 中的 self_repair 测试用例
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. 修复任何错误

### 阶段 7：更新文档（预计 1 小时）

1. 更新 README.md 目录结构
2. 更新 task-workflow-architecture.md（删除自我修复章节）
3. 更新 agent_events_spec.md（删除 self_repair 事件类型）
4. 删除 `docs/legacy/self_repair_notes.md`
5. 删除知识库笔记 "自修复系统：错误分类、流程与优化要点"
6. 更新知识库笔记 "Edge Function 模块化架构规范"
7. 更新知识库笔记 "工具能力矩阵与权限控制"

### 阶段 8：创建 PR（预计 15 分钟）

1. 创建分支
2. 提交所有更改
3. 创建 PR
4. 等待 CI 通过

---

## 十、未来扩展（V2）

以下功能可在 V2 版本中考虑添加，但不在本次重构范围内：

1. **Build 专属验证**：`npm run lint/typecheck/build` 验证
2. **轻量级重试策略**：简单的失败重试（不使用 Debugger）
3. **构建产物整理**：规范化 modifiedFiles、generatedImages 的 metadata
4. **可配置的验证命令**：用户自定义验证步骤

---

## 十一、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 历史 self_repair 事件被删除 | 用户无法查看历史修复记录 | **预期行为**：这是用户要求的完全清除 |
| build 模式功能退化 | 失去自动修复能力 | 明确告知用户这是预期行为变更 |
| 遗漏引用导致运行时错误 | 系统崩溃 | 执行全仓库 grep 检查 |
| 前端类型错误 | TypeScript 编译失败 | 确保删除所有 self_repair 相关类型引用 |
| 数据库迁移失败 | 历史数据残留 | 迁移前备份，迁移后验证 |

---

## 十二、全仓库 Grep 检查清单

在实施前后，执行以下命令确保没有遗漏引用：

```bash
# 检查后端 selfRepair 引用
rg -l "selfRepair|self_repair|SelfRepair" supabase/

# 检查后端 subagent 引用
rg -l "subagent|Subagent|spawn_subagent" supabase/

# 检查 processTaskWithSelfRepair 引用
rg -l "processTaskWithSelfRepair" --type ts

# 检查 initializeBuiltinSubagents 引用
rg -l "initializeBuiltinSubagents" --type ts

# 检查前端 self_repair 引用
rg -l "self_repair|SelfRepair|selfRepair" src/

# 检查前端 repairs 字段引用
rg -l "repairs" src/realtime/ src/components/chat/

# 检查前端 BoltRepairItem 引用
rg -l "BoltRepairItem" src/

# 检查文档中的 selfRepair 引用
rg -l "selfRepair|self_repair|SelfRepair" docs/ README.md AGENTS.md

# 检查测试文件中的 self_repair 引用
rg -l "self_repair|SelfRepair" tests/
```

**实施后验证**：所有上述命令应返回空结果（除了本文档和迁移脚本）。

---

## 附录 A：任务类型统一说明

> **注意**：系统已统一为 InteractionMode 单维度架构。

### 当前状态

系统已完成从旧的 `TaskType × WorkflowMode` 双维度到新的 `InteractionMode` 单维度的迁移：

- 数据库 `ai_tasks.type` 字段现在只接受三种值：`'chat' | 'plan' | 'build'`
- 旧的 `TaskType`（`chat_reply`、`build_site`、`refactor_code`、`debug`）已被标记为 `@deprecated`
- `mapToInteractionMode()` 函数用于向后兼容，将旧类型映射到新类型

### 映射规则

| 旧类型 | 新类型 |
|--------|--------|
| `chat_reply` + `default` | `chat` |
| `chat_reply` + `planning` | `plan` |
| `chat_reply` + `build` | `build` |
| `build_site` / `refactor_code` / `debug` | `build` |

### 数据库约束

```sql
CHECK (type IN ('chat', 'plan', 'build'))
```
