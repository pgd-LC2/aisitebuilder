# Prompt 加载调试指南

## 概述

当 AI Agent 的 Prompt 加载出现问题时，使用本指南进行调试。

## v3 架构调试

### 1. 模式提示词未正确加载

**症状**：AI 响应不符合预期，缺少特定模式的指令

**排查步骤**：
1. 检查 `prompts` 表中是否存在对应模式的 Prompt 记录（如 `chat.prompt.v1`、`plan.prompt.v1`、`build.prompt.v1`）
2. 验证 Prompt 的 `key` 字段是否与 `MODE_TO_PROMPT_PREFIX` 中的配置匹配
3. 检查 Prompt 的 `is_active` 字段是否为 true

### 2. 模式路由错误

**症状**：使用了错误的提示词

**排查步骤**：
1. 检查任务的 `mode` 字段是否正确（chat/plan/build）
2. 如果使用旧的 `type` + `workflowMode`，验证 `mapToInteractionMode` 映射是否正确
3. 检查 Edge Function 日志中的 `[PromptRouter] 使用 v3 架构，加载模式 "xxx" 的提示词`

### 3. v3 回退到旧架构

**症状**：日志显示 "v3 架构提示词不可用，回退到旧架构"

**排查步骤**：
1. 检查 `prompts` 表中是否存在 v3 模式提示词
2. 验证提示词 key 格式是否正确（如 `chat.prompt.v1`）
3. 如果需要使用 v3 架构，确保已上传对应的提示词

## 向后兼容调试（旧架构）

### 1. Prompt 未正确加载

**症状**：AI 响应不符合预期，缺少特定层级的指令

**排查步骤**：
1. 检查 `prompts` 表中是否存在对应的 Prompt 记录
2. 验证 Prompt 的 `key` 字段是否与 `LAYER_TO_PROMPT_PREFIX` 中的配置匹配
3. 检查 Prompt 的 `is_active` 字段是否为 true

### 2. PromptRouter 路由错误

**症状**：使用了错误的 Prompt 组合

**排查步骤**：
1. 检查任务类型（task.type）是否正确
2. 验证 `PROMPT_ROUTING_TABLE` 中的配置
3. 检查是否有动态规则覆盖了默认路由

### 3. Prompt 缓存问题

**症状**：修改 Prompt 后未生效

**排查步骤**：
1. 检查缓存 TTL 设置（默认 5 分钟）
2. 手动清除缓存或等待缓存过期
3. 验证数据库中的 Prompt 内容是否已更新

## 调试工具

### 查看当前加载的 Prompt

在 Edge Function 日志中查找以下信息：
- v3 架构：`[PromptRouter] 使用 v3 架构，加载模式 "xxx" 的提示词`
- v3 架构：`[TaskRunner] v3 架构提示词加载成功，长度: xxx`
- 旧架构：`[TaskRunner] v3 架构提示词不可用，回退到旧架构`

### 验证 Prompt 内容

使用 Supabase MCP 查询 `prompts` 表：

```sql
-- 查询 v3 模式提示词
SELECT key, name, content, is_active 
FROM prompts 
WHERE key LIKE 'chat.prompt%' OR key LIKE 'plan.prompt%' OR key LIKE 'build.prompt%';

-- 查询旧架构层级提示词
SELECT key, name, content, is_active 
FROM prompts 
WHERE key LIKE 'core.%' OR key LIKE 'planner.%' OR key LIKE 'coder.%';
```

## 回退机制

当 Prompt 加载失败时：

1. **v3 架构**：回退到旧的多层架构
2. **旧架构**：降级到 Core Prompt
3. 记录回退事件到日志
4. 继续处理任务（而非失败）
