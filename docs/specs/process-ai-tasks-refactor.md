# process-ai-tasks 边缘函数重构方案

## 1. 背景与问题

当前 `process-ai-tasks` 边缘函数包含约 2425 行代码，承担了过多职责，导致：

- 代码难以阅读和理解
- 维护和调试困难
- 单元测试难以编写
- 功能扩展受限

## 2. 现状分析

### 2.1 当前代码结构

通过分析 `supabase/functions/process-ai-tasks/index.ts`，识别出以下 12 个主要功能模块：

| 模块 | 行数范围 | 职责 | 依赖关系 |
|------|----------|------|----------|
| 配置与常量 | 1-70 | CORS、模型配置、类型定义 | 无 |
| 五层 Prompt 架构 | 73-389 | 系统提示词定义 | 无 |
| Prompt Router | 391-615 | 提示词路由与组装 | 配置、Prompt 架构 |
| 数据库操作 | 617-706 | 任务抢占、消息获取、文件上下文 | 配置 |
| 工具定义 | 708-861 | AI Agent 工具 schema | 无 |
| API 调用 | 863-1067 | OpenRouter API 交互 | 配置 |
| 文件操作工具 | 1069-1491 | 文件 CRUD 操作 | 数据库操作 |
| 日志与事件 | 1493-1602 | 构建日志、事件记录 | 数据库操作 |
| 自我修复循环 | 1604-1879 | 错误诊断与自动修复 | Prompt Router、API 调用、文件操作 |
| 主任务处理 | 1881-2151 | 任务执行核心逻辑 | 所有模块 |
| 自我修复包装 | 2153-2341 | 修复循环控制 | 主任务处理、自我修复循环 |
| HTTP 入口 | 2343-2425 | 请求处理、任务调度 | 数据库操作、自我修复包装 |

### 2.2 当前执行流程

```
HTTP 请求
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                    Deno.serve (HTTP 入口)                    │
│  - 初始化环境变量                                            │
│  - 创建 Supabase/Postgres 客户端                            │
│  - 解析请求参数                                              │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                    claimTask (任务抢占)                      │
│  - SELECT FOR UPDATE SKIP LOCKED                            │
│  - 更新任务状态为 running                                    │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│              processTaskWithSelfRepair (自我修复包装)        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  for (attempt = 0; attempt < SELF_REPAIR_MAX)       │   │
│  │      │                                               │   │
│  │      ▼                                               │   │
│  │  ┌─────────────────────────────────────────────┐    │   │
│  │  │           processTask (主任务处理)           │    │   │
│  │  │  - assembleSystemPrompt (Prompt Router)     │    │   │
│  │  │  - fetchRecentChatMessages                  │    │   │
│  │  │  - getProjectFileContext                    │    │   │
│  │  │  - while (true) Agent 迭代循环:             │    │   │
│  │  │      - callOpenRouterChatCompletionsApi     │    │   │
│  │  │      - executeToolCall (文件操作/图片生成)  │    │   │
│  │  │  - writeAssistantMessage                    │    │   │
│  │  │  - updateTaskStatus                         │    │   │
│  │  └─────────────────────────────────────────────┘    │   │
│  │      │                                               │   │
│  │      ▼ (如果失败且可修复)                            │   │
│  │  ┌─────────────────────────────────────────────┐    │   │
│  │  │         自我修复循环                         │    │   │
│  │  │  - collectErrorContext                      │    │   │
│  │  │  - invokeDebugger (调用 LLM 诊断)           │    │   │
│  │  │  - applyRepairSuggestions                   │    │   │
│  │  │  - runVerificationCommands                  │    │   │
│  │  └─────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
HTTP 响应
```

## 3. 重构方案

### 3.1 设计原则

1. **共享模块优先**：使用 `_shared` 目录的模块化拆分，而非创建多个 HTTP 端点
2. **最小化 HTTP 边界**：避免不必要的网络往返和状态序列化开销
3. **保持闭环逻辑**：自我修复循环等有状态逻辑保持在单个请求内完成
4. **数据库驱动**：Prompt 内容从 `prompts` 表动态读取，不使用硬编码备选

### 3.2 目标架构

#### 目标架构：共享模块化

```
supabase/functions/
├── _shared/                          # 共享模块目录
│   └── ai/                           # AI 相关模块
│       ├── config.ts                 # 配置与常量
│       ├── types.ts                  # 类型定义
│       ├── prompts/                  # Prompt 相关
│       │   └── router.ts             # Prompt Router（从 prompts 表读取）
│       ├── llm/                      # LLM 客户端
│       │   ├── client.ts             # OpenRouter API 调用
│       │   └── imageGenerator.ts     # 图片生成
│       ├── tools/                    # AI Agent 工具
│       │   ├── definitions.ts        # 工具 schema 定义
│       │   ├── fileOperations.ts     # 文件操作实现
│       │   └── executor.ts           # 工具执行器
│       ├── selfRepair/               # 自我修复
│       │   ├── errorPatterns.ts      # 错误模式（已存在）
│       │   ├── debugger.ts           # Debugger 调用
│       │   └── loop.ts               # 修复循环控制
│       └── logging/                  # 日志与事件
│           ├── buildLog.ts           # 构建日志
│           └── agentEvents.ts        # Agent 事件
│
├── process-ai-tasks/                 # 主编排器（精简后）
│   ├── index.ts                      # HTTP 入口 + 任务调度
│   ├── taskProcessor.ts              # 任务处理核心
│   └── README.md                     # 文档
│
├── proxy-image/                      # 现有：图片代理
├── initialize-project/               # 现有：项目初始化
├── create-version/                   # 现有：版本创建
└── copy-version-files/               # 现有：版本文件复制
```

### 3.3 模块职责划分

#### 3.3.1 `_shared/ai/config.ts`

```typescript
// 配置与常量
export const corsHeaders = { ... };
export const MODEL_CONFIG = { ... };
export const IMAGE_MODEL = '...';
export const SELF_REPAIR_MAX = 3;
```

#### 3.3.2 `_shared/ai/types.ts`

```typescript
// 类型定义
export interface ErrorContext { ... }
export interface FileModification { ... }
export interface DebuggerSuggestion { ... }
export interface RepairAttempt { ... }
export interface SelfRepairLoopResult { ... }
export interface ToolContext { ... }
export interface ChatMessage { ... }
export interface ParsedChatCompletionOutput { ... }
// ...
```

#### 3.3.3 `_shared/ai/prompts/router.ts`

```typescript
// Prompt Router
export const PROMPT_ROUTING_TABLE = { ... };
export const LAYER_TO_PROMPT_KEY = { ... };
export function routePrompts(context: PromptRouterContext): string[];
export async function assembleSystemPrompt(...): Promise<string>;
export async function getMultiplePrompts(...): Promise<Record<string, string>>;
```

#### 3.3.4 `_shared/ai/llm/client.ts`

```typescript
// OpenRouter API 客户端
export function parseChatCompletionOutput(data): ParsedChatCompletionOutput;
export async function callOpenRouterChatCompletionsApi(...): Promise<ParsedChatCompletionOutput>;
```

#### 3.3.5 `_shared/ai/llm/imageGenerator.ts`

```typescript
// 图片生成
export async function generateImage(prompt, apiKey, aspectRatio): Promise<string>;
export async function saveImageToStorage(...): Promise<string>;
```

#### 3.3.6 `_shared/ai/tools/definitions.ts`

```typescript
// 工具 schema 定义
export const TOOLS = [ ... ];
```

#### 3.3.7 `_shared/ai/tools/fileOperations.ts`

```typescript
// 文件操作实现
export function getMimeType(fileName: string): string;
export function getFileCategory(fileName: string): string;
export async function handleListFiles(ctx, args): Promise<...>;
export async function handleReadFile(ctx, args): Promise<...>;
export async function handleWriteFile(ctx, args): Promise<...>;
export async function handleDeleteFile(ctx, args): Promise<...>;
export async function handleMoveFile(ctx, args): Promise<...>;
export async function handleSearchFiles(ctx, args): Promise<...>;
export async function handleGetProjectStructure(ctx): Promise<...>;
```

#### 3.3.8 `_shared/ai/tools/executor.ts`

```typescript
// 工具执行器
export async function executeToolCall(toolName, args, ctx): Promise<...>;
```

#### 3.3.9 `_shared/ai/selfRepair/debugger.ts`

```typescript
// Debugger 调用
export function isRepairableError(error): boolean;
export async function collectErrorContext(...): Promise<ErrorContext>;
export async function invokeDebugger(...): Promise<DebuggerSuggestion | null>;
export function parseDebuggerOutput(content): DebuggerSuggestion | null;
```

#### 3.3.10 `_shared/ai/selfRepair/loop.ts`

```typescript
// 修复循环控制
export async function applyRepairSuggestions(...): Promise<...>;
export async function runVerificationCommands(...): Promise<VerificationResult>;
export async function processTaskWithSelfRepair(...): Promise<SelfRepairLoopResult>;
```

#### 3.3.11 `_shared/ai/logging/buildLog.ts`

```typescript
// 构建日志
export async function writeBuildLog(...): Promise<void>;
export async function writeAssistantMessage(...): Promise<string | null>;
export async function updateTaskStatus(...): Promise<void>;
```

#### 3.3.12 `_shared/ai/logging/agentEvents.ts`

```typescript
// Agent 事件
export async function logAgentEvent(...): Promise<void>;
export async function logFileEvent(...): Promise<void>;
export async function logSelfRepairAttempt(...): Promise<void>;
export async function logSelfRepairFinalStatus(...): Promise<void>;
```

### 3.4 重构后的 process-ai-tasks/index.ts

重构后的主入口文件将大幅精简，预计约 200-300 行：

```typescript
// process-ai-tasks/index.ts（重构后）
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { Client } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';

// 从共享模块导入
import { corsHeaders } from '../_shared/ai/config.ts';
import { processTaskWithSelfRepair } from '../_shared/ai/selfRepair/loop.ts';

// 数据库操作（保留在本文件或移至 taskProcessor.ts）
async function claimTask(pgClient, projectId) { ... }

// HTTP 入口
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // 初始化环境
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openrouterApiKey = Deno.env.get('OPENROUTER_KEY');
    const databaseUrl = Deno.env.get('SUPABASE_DB_URL');

    if (!openrouterApiKey || !supabaseUrl || !supabaseServiceKey || !databaseUrl) {
      throw new Error('缺少必要的环境变量设置');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const pgClient = new Client(databaseUrl);
    await pgClient.connect();

    try {
      const body = await req.json().catch(() => null);
      const projectId = body?.projectId;
      const projectFilesContext = body?.projectFilesContext;

      // 抢占任务
      const task = await claimTask(pgClient, projectId);
      if (!task) {
        return new Response(JSON.stringify({ message: '没有待处理的任务' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 处理任务（使用共享模块）
      const result = await processTaskWithSelfRepair(
        task,
        supabase,
        openrouterApiKey,
        projectFilesContext
      );

      return new Response(JSON.stringify({
        success: result.status === 'completed' || result.status === 'recovered',
        taskId: task.id,
        message: '...',
        selfRepairResult: result
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } finally {
      await pgClient.end();
    }
  } catch (error) {
    console.error('处理请求失败:', error);
    return new Response(JSON.stringify({
      error: '服务器错误',
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
```

## 4. 模块间交互

### 4.1 模块间交互方式（进程内调用）

```
┌─────────────────────────────────────────────────────────────────┐
│                    process-ai-tasks/index.ts                     │
│                         (HTTP 入口)                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ import
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    _shared/ai/selfRepair/loop.ts                 │
│              processTaskWithSelfRepair()                         │
└─────────────────────────────────────────────────────────────────┘
        │                     │                     │
        │ import              │ import              │ import
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ prompts/      │   │ llm/          │   │ tools/        │
│ router.ts     │   │ client.ts     │   │ executor.ts   │
└───────────────┘   └───────────────┘   └───────────────┘
        │                     │                     │
        │ import              │ import              │ import
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ prompts 表    │   │ llm/          │   │ tools/        │
│ (数据库)      │   │ imageGen.ts   │   │ fileOps.ts    │
└───────────────┘   └───────────────┘   └───────────────┘
```

## 5. 实施计划

### 5.1 实施步骤

| 步骤 | 任务 | 预计工时 | 风险等级 |
|------|------|----------|----------|
| 1 | 创建 `_shared/ai/` 目录结构 | 0.5h | 低 |
| 2 | 提取 `config.ts` 和 `types.ts` | 1h | 低 |
| 3 | 提取 `prompts/router.ts`（从 prompts 表读取） | 1.5h | 中 |
| 4 | 提取 `llm/client.ts` 和 `llm/imageGenerator.ts` | 1.5h | 中 |
| 5 | 提取 `tools/definitions.ts`、`tools/fileOperations.ts`、`tools/executor.ts` | 2h | 中 |
| 6 | 提取 `selfRepair/debugger.ts` 和 `selfRepair/loop.ts` | 2h | 高 |
| 7 | 提取 `logging/buildLog.ts` 和 `logging/agentEvents.ts` | 1h | 低 |
| 8 | 重构 `process-ai-tasks/index.ts` 使用共享模块 | 2h | 高 |
| 9 | 集成测试 | 2h | 高 |
| 10 | 文档更新 | 1h | 低 |

**总计**：约 14.5 小时

## 6. 预期收益

### 6.1 代码质量

- **可读性**：单文件从 2425 行降至约 200-300 行
- **可维护性**：职责单一，修改影响范围可控
- **可测试性**：模块化后可独立编写单元测试

### 6.2 开发效率

- **并行开发**：不同模块可由不同开发者同时修改
- **代码复用**：共享模块可被其他 Edge Function 复用
- **调试效率**：问题定位更快，日志更清晰

### 6.3 系统扩展性

- **功能扩展**：新增工具或 Prompt 层只需修改对应模块
- **性能优化**：可针对性优化热点模块

## 7. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 模块间循环依赖 | 编译失败 | 严格遵循依赖方向，使用依赖注入 |
| 共享模块打包问题 | 部署失败 | 提前验证 Supabase CLI 打包行为 |
| 状态传递复杂化 | 运行时错误 | 保持自我修复循环在单个模块内 |
| 性能回归 | 响应变慢 | 基准测试，避免不必要的 HTTP 边界 |

## 8. 验收标准

1. `process-ai-tasks/index.ts` 行数不超过 300 行
2. 所有共享模块可被正确导入
3. 现有功能全部正常工作（chat_reply、build_site、refactor_code）
4. 自我修复循环正常运行
5. 构建日志和事件记录正常
6. 无性能回归（响应时间增加不超过 10%）

## 9. 参考资料

- [Supabase Edge Functions 文档](https://supabase.com/docs/guides/functions)
- [Deno 模块系统](https://deno.land/manual/basics/modules)
- `docs/legacy/self_repair_notes.md` - 自我修复机制笔记
- `docs/specs/prompt_spec.md` - Prompt 系统规范
