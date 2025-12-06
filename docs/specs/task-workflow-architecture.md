# AI Site Builder 任务与工作流架构

本文档详细说明了 AI Site Builder 项目中任务类型和工作流模式的设计架构，帮助新加入的工程师快速理解系统的核心概念。

## 一、系统架构概述

当前系统存在**两个独立的维度**，理解这两个维度是掌握系统设计的关键：

1. **任务类型 (Task Type)**：后端执行策略，决定如何处理 AI 任务
2. **工作流模式 (Workflow Mode)**：前端行为约束，控制 AI 的行为边界

## 二、任务类型 (Task Type)

任务类型定义在 `ai_tasks` 表的 `type` 字段，决定后端如何处理任务。

### 支持的任务类型

| 任务类型 | Prompt 组合 | 自我修复 | 用途 |
|---------|------------|---------|------|
| `chat_reply` | Core 层 | 跳过 | 轻量级对话/问答 |
| `build_site` | Core + Planner + Coder + Reviewer | 启用（最多 3 次） | 构建/修改网站 |
| `refactor_code` | Core + Coder + Reviewer | 启用（最多 3 次） | 代码重构 |

### 任务类型的 Prompt 路由

```typescript
// 位置：supabase/functions/_shared/ai/prompts/router.ts
export const PROMPT_ROUTING_TABLE: Record<TaskType, PromptLayer[]> = {
  'chat_reply': ['core'],
  'build_site': ['core', 'planner', 'coder', 'reviewer'],
  'refactor_code': ['core', 'coder', 'reviewer'],
  'debug': ['core', 'debugger']
};
```

### 自我修复循环

`build_site` 和 `refactor_code` 任务支持自我修复循环（Self-Repair Loop）：

- 当任务执行失败时，系统会自动调用 Debugger 层诊断错误
- 最多重试 3 次（`SELF_REPAIR_MAX = 3`）
- `chat_reply` 任务跳过自我修复循环，直接返回结果

## 三、工作流模式 (Workflow Mode)

工作流模式定义在 `prompts` 表的 `workflow.*` 提示词，约束 AI 的行为边界。

### 支持的工作流模式

| 工作流模式 | 提示词 Key | AI 角色 | 工具权限 |
|-----------|-----------|--------|---------|
| `default` | `workflow.default.v1` | 代码库分析专家 | 只读（read_file, list_files 等） |
| `planning` | `workflow.planning.v1` | 高级软件架构师 | 只读 + 输出 `[IMPLEMENT_READY]` 标记 |
| `build` | `workflow.build.v1` | 资深全栈工程师 | 完整权限（包括 write_file） |

### 工作流模式详解

#### 1. 默认模式 (default)

- **角色**：代码库分析专家
- **允许操作**：`read_file`、`list_files`、`search_files`、`get_project_structure`
- **禁止操作**：`write_file`、`delete_file`、`move_file`
- **用户引导**：如果用户要求修改代码，引导他们点击 **Plan** 按钮

#### 2. 规划模式 (planning)

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

#### 3. 构建模式 (build)

- **角色**：资深全栈工程师
- **核心原则**：严格按照已批准的计划执行
- **工具权限**：完整权限（包括 `write_file`、`delete_file`、`move_file`）
- **执行流程**：确认计划 → 按步骤执行 → 先读后写 → 完整输出

## 四、五层 Prompt 架构

这是**任务层**的 Prompt，与工作流模式不同，用于组装 AI 的系统提示词。

| Prompt Key | 层级 | 职责 |
|-----------|------|------|
| `core.system.base.v1` | Core | 角色定义、核心原则、工具能力 |
| `planner.web.structure.v1` | Planner | 任务拆解、文件结构规划 |
| `coder.web.implement.v1` | Coder | 逐文件实现代码 |
| `reviewer.quality.check.v1` | Reviewer | 质量检查 |
| `debugger.error.diagnosis.v1` | Debugger | 错误诊断、自我修复 |

### 动态规则

- **新项目**：强制插入 Planner + Reviewer 层
- **存在错误**：自动触发 Debugger 层插入

## 五、前端到后端的映射关系

```
用户操作                    前端状态                    后端任务
─────────────────────────────────────────────────────────────────
普通聊天                    mode=default               type=chat_reply
                           workflowMode=default        + workflow.default.v1

点击 Plan 按钮              mode=planning              type=chat_reply
                           workflowMode=planning       + workflow.planning.v1

AI 输出 [IMPLEMENT_READY]   显示"开始实现"按钮          (无后端调用)

点击"开始实现"              mode=build                 (仅切换前端状态)
                           workflowMode=build

在构建模式下发送消息         mode=build                 type=build_site
                           workflowMode=build          + workflow.build.v1
                                                       + Core+Planner+Coder+Reviewer
```

## 六、关键代码位置

### 前端

| 文件 | 职责 |
|------|------|
| `src/contexts/WorkflowContext.tsx` | 工作流状态管理（default/planning/build） |
| `src/components/ChatPanel.tsx` | 聊天界面，任务创建入口 |
| `src/components/ImplementationTrigger.tsx` | "开始实现"按钮组件 |
| `src/types/project.ts` | 类型定义（WorkflowMode、PlanSummary 等） |

### 后端

| 文件 | 职责 |
|------|------|
| `supabase/functions/process-ai-tasks/index.ts` | AI 任务处理主逻辑 |
| `supabase/functions/_shared/ai/prompts/router.ts` | Prompt 路由器 |
| `supabase/functions/_shared/ai/selfRepair/loop.ts` | 自我修复循环 |

### 数据库

| 表 | 职责 |
|---|------|
| `ai_tasks` | AI 任务队列，包含 type、payload（含 workflowMode）、status 等字段 |
| `prompts` | Prompt 库，按 category 分为 system、task、workflow 三类 |
| `chat_messages` | 聊天记录，用于构建对话上下文 |

## 七、常见问题

### Q1: 两个"Plan"有什么区别？

1. **工作流的"规划模式"**（`workflow.planning.v1`）：前端 Plan 按钮触发的工作流状态
2. **任务层的"Planner 层"**（`planner.web.structure.v1`）：后端 Prompt 组合中的规划层

### Q2: 为什么"开始实现"按钮点击后还需要发送消息？

"开始实现"按钮只是切换前端状态（调用 `enterBuildMode(planSummary)`），并不会立即创建 AI 任务。用户需要在构建模式下发送一条消息才能真正触发 `build_site` 任务。

### Q3: 工具权限是如何限制的？

当前工具权限仅靠 Prompt 约束，所有任务都传入完整的 TOOLS 列表。`default` 和 `planning` 模式禁止写文件完全依赖 Prompt 约束，没有 API 层面的硬限制。

## 八、相关文档

- [Prompt 系统规范](./prompt_spec.md)
- [process-ai-tasks 重构方案](./process-ai-tasks-refactor.md)
- [Agent 事件流规范](./agent_events_spec.md)
