# Edge Function 模块化架构规范

## 概述

`supabase/functions/_shared/ai/` 目录采用模块化架构，为所有 AI 相关的 Edge Functions 提供共享代码。这种架构确保代码复用、类型安全和易于维护。

## 目录结构

```
supabase/functions/_shared/ai/
├── index.ts           # 统一导出入口
├── config.ts          # 配置常量
├── types.ts           # 类型定义
├── build/             # Build 模式处理模块
│   ├── index.ts       # 统一导出
│   ├── types.ts       # 类型定义
│   ├── buildTaskHandler.ts  # 主处理逻辑
│   ├── buildConfig.ts # 配置
│   └── README.md      # 模块文档
├── core/              # 核心执行模块
│   ├── agentLoop.ts   # 统一 Agent 循环抽象
│   └── taskRunner.ts  # 阶段化任务执行主干
├── prompts/           # Prompt 模块
│   ├── index.ts       # 统一导出
│   ├── layers.ts      # 层级映射定义
│   ├── cache.ts       # 缓存管理
│   ├── router.ts      # 路由逻辑
│   └── assembler.ts   # 提示词组装
├── llm/               # LLM 客户端模块
│   ├── client.ts      # OpenRouter API 调用
│   ├── streamingClient.ts  # 流式输出客户端
│   └── imageGenerator.ts   # 图片生成
├── tools/             # 工具定义和执行
│   ├── definitions.ts # 工具定义和能力矩阵
│   ├── executor.ts    # 工具执行器
│   └── fileOperations.ts  # 文件操作实现
└── logging/           # 日志模块
    ├── buildLog.ts    # 构建日志
    └── agentEvents.ts # Agent 事件日志
```

## 核心模块说明

### core/ - 核心执行模块

**TaskRunner** (`taskRunner.ts`)：阶段化任务执行主干
- 阶段：claim → load_context → assemble_prompt → agent_loop → final_response → write_result → cleanup
- 工具权限由 InteractionMode 决定
- 支持流式输出

**AgentLoop** (`agentLoop.ts`)：统一的 Agent 循环抽象
- 调用 LLM（非流式）
- 执行工具调用并追加结果到消息历史
- 达到 maxIterations 则返回失败

### build/ - Build 模式处理模块

负责处理 `build` 模式的 AI 任务，复用 TaskRunner 执行任务。

设计原则：
- 单一职责：只负责 build 模式的业务编排
- 复用优先：直接复用 TaskRunner
- 简洁清晰：不实现自我修复循环，失败直接返回错误

## 模块导出规范

### 统一入口 (index.ts)

所有共享模块必须通过 `index.ts` 统一导出：

```typescript
// 配置
export * from './config.ts';

// 类型
export * from './types.ts';

// Prompts 模块（v3 架构：统一交互模式）
export { 
  MODE_TO_PROMPT_PREFIX,
  getLatestModeKey,
  routePromptByMode,
  assembleSystemPromptByMode,
  // 向后兼容
  routePromptsAsync,
  PROMPT_ROUTING_TABLE,
  assembleSystemPrompt
} from './prompts/index.ts';

// LLM 客户端
export { 
  parseChatCompletionOutput, 
  callOpenRouterChatCompletionsApi 
} from './llm/client.ts';

// 流式 LLM 客户端
export {
  callOpenRouterChatCompletionsApiStreaming,
  DEFAULT_STREAMING_CONFIG
} from './llm/streamingClient.ts';

// 工具（基于 InteractionMode）
export { 
  TOOLS, 
  getFilteredToolsByMode,
  getAllowedToolNamesByMode
} from './tools/definitions.ts';

// 工具执行器
export { executeToolCall } from './tools/executor.ts';

// AgentLoop
export { runAgentLoop } from './core/agentLoop.ts';

// TaskRunner
export { TaskRunner, createTaskRunner } from './core/taskRunner.ts';

// 日志
export { writeBuildLog, writeAssistantMessage, updateTaskStatus } from './logging/buildLog.ts';
export { logAgentEvent, logProgressEvent } from './logging/agentEvents.ts';

// Build 模块
export { handleBuildTask, BUILD_CONFIG } from './build/index.ts';
```

### 导入规范

在 Edge Function 中，始终从统一入口导入：

```typescript
// 正确
import {
  corsHeaders,
  createTaskRunner,
  mapToInteractionMode,
  getFilteredToolsByMode,
  handleBuildTask
} from '../_shared/ai/index.ts';

// 错误 - 不要直接导入子模块
import { TOOLS } from '../_shared/ai/tools/definitions.ts';
```

## 配置模块 (config.ts)

集中管理所有配置常量：

```typescript
// CORS 配置
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey'
};

// 模型配置
export const MODEL_CONFIG: Record<string, string> = {
  chat_reply: 'google/gemini-3-pro-preview',
  build_site: 'google/gemini-3-pro-preview',
  refactor_code: 'google/gemini-3-pro-preview',
  default: 'google/gemini-3-pro-preview'
};

// 图片生成模型
export const IMAGE_MODEL = 'google/gemini-3-pro-image-preview';

// 缓存配置
export const CACHE_TTL = 5 * 60 * 1000; // 5分钟

// OpenRouter API 配置
export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
```

## 类型模块 (types.ts)

定义所有共享类型接口：

```typescript
// 工具上下文
export interface ToolContext {
  supabase: ReturnType<typeof createClient>;
  projectId: string;
  versionId: string;
  bucket: string;
  basePath: string;
}

/**
 * 统一交互模式 - 替代 TaskType × WorkflowMode 双维度
 * 
 * | 模式   | 工具权限     | 用途                           |
 * |--------|-------------|--------------------------------|
 * | chat   | 只读工具     | 对话、问答、代码分析            |
 * | plan   | 只读工具     | 需求澄清、方案规划              |
 * | build  | 完整工具集   | 代码生成、文件修改、构建        |
 */
export type InteractionMode = 'chat' | 'plan' | 'build';

// TaskRunner 执行阶段
export type TaskPhase = 
  | 'claim'           // 抢占任务
  | 'load_context'    // 加载上下文
  | 'assemble_prompt' // 组装系统提示词
  | 'agent_loop'      // 执行 Agent 循环
  | 'final_response'  // 生成最终响应
  | 'write_result'    // 写入结果
  | 'cleanup';        // 清理资源

// 向后兼容（已废弃）
export type TaskType = 'chat_reply' | 'build_site' | 'refactor_code' | 'debug';
export type WorkflowMode = 'default' | 'planning' | 'build';
```

## 新增模块规范

添加新模块时，遵循以下步骤：

1. **创建模块文件**：在适当的子目录下创建 `.ts` 文件
2. **定义类型**：在 `types.ts` 中添加相关类型定义
3. **实现功能**：在模块文件中实现功能
4. **导出接口**：在 `index.ts` 中添加导出
5. **更新文档**：更新相关文档说明

## 注意事项

- 所有模块使用 Deno 运行时，导入路径需要包含 `.ts` 扩展名
- 使用 `npm:` 前缀导入 npm 包：`import { createClient } from 'npm:@supabase/supabase-js@2.57.4';`
- 避免循环依赖，保持模块间的单向依赖关系
