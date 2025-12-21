# AI Site Builder 任务架构

本文档详细说明了 AI Site Builder 项目中任务类型的设计架构，帮助新加入的工程师快速理解系统的核心概念。

## 一、统一交互模式 (InteractionMode)

系统使用**统一交互模式**来决定 AI 的行为和工具权限。所有任务都通过 `ai_tasks.type` 字段标识，只有三种类型：

| 模式 | 工具权限 | 用途 |
|------|---------|------|
| `chat` | 只读工具 | 对话、问答、代码分析 |
| `plan` | 只读工具 | 需求澄清、方案规划 |
| `build` | 完整工具集 | 代码生成、文件修改、构建 |

### 数据库约束

```sql
-- ai_tasks.type 字段约束
CHECK (type IN ('chat', 'plan', 'build'))
```

## 二、各模式详解

### 1. Chat 模式

- **角色**：代码库分析专家
- **允许操作**：`read_file`、`list_files`、`search_files`、`get_project_structure`
- **禁止操作**：`write_file`、`delete_file`、`move_file`
- **用户引导**：如果用户要求修改代码，引导他们点击 **Plan** 按钮

### 2. Plan 模式

- **角色**：高级软件架构师
- **核心原则**：不写任何代码，通过多轮对话理解需求
- **工作流程**：需求澄清 → 可行性分析 → 方案制定
- **完成标记**：当方案制定完成时，输出 `[IMPLEMENT_READY]` 标记

```
[IMPLEMENT_READY]
{
  "requirement": "用户需求简述",
  "technicalPlan": "技术方案概述",
  "steps": ["步骤1", "步骤2", "步骤3"]
}
[/IMPLEMENT_READY]
```

### 3. Build 模式

- **角色**：资深全栈工程师
- **核心原则**：严格按照已批准的计划执行
- **工具权限**：完整权限（包括 `write_file`、`delete_file`、`move_file`）
- **执行流程**：确认计划 → 按步骤执行 → 先读后写 → 完整输出

## 三、Prompt 架构

系统使用 v3 Prompt 架构，每种模式加载一个专用提示词：

| 模式 | Prompt Key | 职责 |
|------|-----------|------|
| `chat` | `mode.chat.v*` | 只读分析能力 |
| `plan` | `mode.plan.v*` | 需求澄清和方案规划 |
| `build` | `mode.build.v*` | 完整实现能力 |

### Prompt 路由

```typescript
// 位置：supabase/functions/_shared/ai/prompts/router.ts
export async function routePromptByMode(
  supabase: SupabaseClient,
  mode: InteractionMode  // 'chat' | 'plan' | 'build'
): Promise<string> {
  const key = await getLatestModeKey(supabase, mode);
  return key;
}
```

## 四、前端到后端的映射关系

```
用户操作                    前端状态                    后端任务
─────────────────────────────────────────────────────────────────
普通聊天                    workflowMode=default       type='chat'

点击 Plan 按钮              workflowMode=planning      type='plan'

AI 输出 [IMPLEMENT_READY]   显示"开始实现"按钮          (无后端调用)

点击"开始实现"              workflowMode=build         (仅切换前端状态)

在构建模式下发送消息         workflowMode=build         type='build'
```

## 五、关键代码位置

### 前端

| 文件 | 职责 |
|------|------|
| `src/contexts/WorkflowContext.tsx` | 工作流状态管理（default/planning/build） |
| `src/components/chat/ChatPanel.tsx` | 聊天界面，任务创建入口 |
| `src/components/chat/ImplementationTrigger.tsx` | "开始实现"按钮组件 |
| `src/types/project.ts` | 类型定义（WorkflowMode、PlanSummary 等） |

### 后端

| 文件 | 职责 |
|------|------|
| `supabase/functions/process-ai-tasks/index.ts` | AI 任务处理主逻辑 |
| `supabase/functions/_shared/ai/prompts/router.ts` | Prompt 路由器 |
| `supabase/functions/_shared/ai/build/buildTaskHandler.ts` | Build 模式任务处理 |
| `supabase/functions/_shared/ai/types.ts` | 类型定义（InteractionMode 等） |

### 数据库

| 表 | 职责 |
|---|------|
| `ai_tasks` | AI 任务队列，包含 type（chat/plan/build）、payload、status 等字段 |
| `prompts` | Prompt 库，按 category 分为 system、task、mode 三类 |
| `chat_messages` | 聊天记录，用于构建对话上下文 |

## 六、常见问题

### Q1: 前端的 WorkflowMode 和后端的 type 有什么关系？

前端使用 `WorkflowMode`（default/planning/build）来控制 UI 状态和用户交互。当用户发送消息时，前端会根据当前 WorkflowMode 设置后端任务的 `type` 字段：
- `default` → `type='chat'`
- `planning` → `type='plan'`
- `build` → `type='build'`

### Q2: 为什么"开始实现"按钮点击后还需要发送消息？

"开始实现"按钮只是切换前端状态（调用 `enterBuildMode(planSummary)`），并不会立即创建 AI 任务。用户需要在构建模式下发送一条消息才能真正触发 `build` 任务。

### Q3: 工具权限是如何限制的？

工具权限通过 `TOOL_CAPABILITY_MATRIX` 配置，根据任务类型（chat/plan/build）过滤可用工具：
- `chat` 和 `plan` 模式只能使用只读工具
- `build` 模式可以使用所有工具

## 七、相关文档

- [Prompt 系统规范](./prompt_spec.md)
- [Agent 事件流规范](./agent_events_spec.md)
