# AI Prompt 系统架构与任务路由

## v3 架构：统一交互模式（当前架构）

项目已升级为 v3 架构，使用统一交互模式（InteractionMode）**完全替代**原有的 TaskType 系统。

**重要**：旧的 TaskType（chat_reply, build_site, refactor_code, debug）已被删除，不再使用。现在只有三种模式：chat、plan、build。

### 数据库字段说明

**重要**：数据库 `ai_tasks` 表中：
- `type` 字段存储任务类型值（chat/plan/build）
- `mode` 字段为 null，不使用

任务分发应该基于 `type` 字段（chat/plan/build），而不是 `mode` 字段。

### 交互模式

| 模式 | 提示词前缀 | 工具权限 | 用途 |
|------|-----------|---------|------|
| chat | `chat.prompt` | 只读工具 | 对话、问答、代码分析 |
| plan | `plan.prompt` | 只读工具 | 需求澄清、方案规划 |
| build | `build.prompt` | 完整工具集 | 代码生成、文件修改、构建 |

### 提示词加载

v3 架构中，每种模式只加载一个提示词，不再使用多层拼装：

```typescript
// MODE_TO_PROMPT_PREFIX 定义
const MODE_TO_PROMPT_PREFIX: Record<InteractionMode, string> = {
  'chat': 'chat.prompt',
  'plan': 'plan.prompt',
  'build': 'build.prompt'
};

// 使用 routePromptByMode 获取提示词 key
const key = await routePromptByMode(supabase, mode);

// 使用 assembleSystemPromptByMode 组装提示词
const systemPrompt = await assembleSystemPromptByMode(supabase, mode, fileContext);
```

## 向后兼容（已废弃，仅供参考）

> **注意**：以下内容已废弃，仅保留用于理解历史代码。新代码不应使用这些概念。

旧的 5 层 Prompt 架构和 TaskType 系统已被删除：
- ~~chat_reply~~
- ~~build_site~~
- ~~refactor_code~~
- ~~debug~~

如果代码中仍存在 `mapToInteractionMode` 函数或 TaskType 类型定义，这些是遗留代码，应该被清理。

## Prompt 创建最佳实践

**重要**：创建或修改 Prompt 时，不要在代码中硬编码。必须遵循以下流程：
1. 将 Prompt 内容保存到 `/prompts/` 文件夹中的 `.md` 文件
2. 将 Prompt 上传到 Supabase 的 `prompts` 表中
3. 通过 PromptRouter 进行动态读取

## 回退逻辑

当 v3 提示词不可用时，系统会回退到旧的多层架构：

1. 尝试使用 `assembleSystemPromptByMode` 加载 v3 提示词
2. 如果失败，回退到 `assembleSystemPrompt` 使用多层架构
3. 记录回退事件到日志

## 参考文档

- 基线文档: `docs/legacy/baseline.md`
- 数据库表结构: 使用 MCP 检查 `prompts` 表
