# Prompts v3 - 统一交互模式架构

## 版本说明

v3 版本将任务类型统一为三种交互模式（InteractionMode）：`chat`、`plan`、`build`，每种模式使用独立的提示词文件，不再使用多层拼装架构。

## 核心变更

### 1. 统一交互模式

| 模式 | 用途 | 工具权限 |
|------|------|----------|
| `chat` | 对话/问答/只读分析 | 只读工具 |
| `plan` | 需求澄清/方案规划 | 只读工具 |
| `build` | 代码生成/文件修改/构建 | 完整工具集 |

### 2. 提示词文件

| 文件 | 用途 |
|------|------|
| `chat.prompt.v1.md` | Chat 模式 - 代码分析顾问，只读分析 |
| `plan.prompt.v1.md` | Plan 模式 - 需求规划，输出 `[IMPLEMENT_READY]` |
| `build.prompt.v1.md` | Build 模式 - 完整构建能力，工具驱动执行 |
| `chat.assistant.readonly.v3.md` | (遗留) 旧版 Chat 只读模式 |

### 3. 与旧架构的区别

| 特性 | 旧架构 (v1/v2) | 新架构 (v3) |
|------|----------------|-------------|
| 任务类型 | `chat_reply`, `build_site`, `refactor_code`, `debug` | `chat`, `plan`, `build` |
| Prompt 加载 | 5 层拼装 + workflow prompt 叠加 | 每种模式独立加载一个 prompt |
| 工具权限判断 | TaskType × WorkflowMode 双维度 | InteractionMode 单维度 |
| 复杂度 | 高（多层组合） | 低（单一映射） |

## 设计原则

### 1. 单一职责

每种交互模式有且只有一个对应的提示词文件，职责清晰：
- `chat`: 只读分析，引导用户使用其他模式
- `plan`: 需求澄清和方案制定，输出 `[IMPLEMENT_READY]` 标记
- `build`: 工具驱动执行，完整的文件操作能力

### 2. 硬约束优于软约束

- **技术层面限制**：通过 `MODE_TOOL_MATRIX` 在 API 调用层面控制工具可用性
- **提示词层面引导**：明确告知 AI 其角色和能力边界
- **用户引导**：当用户需要不同能力时，引导他们切换模式

### 3. 向后兼容

在迁移期间，系统支持旧任务类型到新交互模式的映射：
- `chat_reply` + `planning` → `plan`
- `chat_reply` + 其他 → `chat`
- `build_site` / `refactor_code` / `debug` → `build`

## [IMPLEMENT_READY] 规范

Plan 模式必须在方案完备时输出 `[IMPLEMENT_READY]` 标记：

```
[IMPLEMENT_READY]
{
  "requirement": "用户需求简述",
  "technicalPlan": "技术方案概述",
  "steps": ["步骤1", "步骤2", "步骤3"]
}
[/IMPLEMENT_READY]
```

前端通过 `parseImplementReadyMarker()` 解析此标记，显示"开始实施"按钮。

## 使用说明

PromptRouter 根据 `InteractionMode` 加载对应的提示词：
- `mode = 'chat'` → 加载 `chat.prompt.v1`
- `mode = 'plan'` → 加载 `plan.prompt.v1`
- `mode = 'build'` → 加载 `build.prompt.v1`

---

*Last Updated: 2025-12-21*
