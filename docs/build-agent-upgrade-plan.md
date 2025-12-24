# Build 智能体升级规划文档

## 概述

本文档描述如何将 `buildTaskHandler.ts` 从当前的最小实现升级为一个真正的智能体系统，类似于 Cursor、Bolt、v0、Claude Code 这样的 AI 编程助手。

**目标**：让 AI 能够自主使用工具进行代码编写和调试，具备"像真正开发者一样"的工程化能力。

**分阶段实现**：
- **阶段 A（当前实现）**：AI 自主使用工具进行代码编写，静态工程闭环
- **阶段 B（后续实现）**：调试能力，运行命令获取反馈

---

## 1. 当前架构分析

### 1.1 任务类型（type 字段）

系统使用 `ai_tasks.type` 字段进行任务分发，取值为 `chat | plan | build`：

| 类型 | 工具权限 | 用途 |
|------|---------|------|
| chat | 只读工具 | 对话、问答、代码分析 |
| plan | 只读工具 | 需求澄清、方案规划 |
| build | 完整工具集 | 代码生成、文件修改、构建 |

**数据库字段说明**：
- `ai_tasks.type`：NOT NULL，存储任务类型（chat/plan/build）
- `ai_tasks.mode`：已废弃，当前全部为 NULL，计划删除

### 1.2 核心执行流程

```
process-ai-tasks/index.ts
    ↓
claimTask() → 根据 task.type 分发（chat/plan/build）
    ↓
type === 'build' → buildTaskHandler.ts → createTaskRunner() → runner.run()
type === 'chat' | 'plan' → 直接使用 TaskRunner
    ↓
TaskRunner 7 阶段执行:
    claim → load_context → assemble_prompt → agent_loop → final_response → write_result → cleanup
    ↓
AgentLoop: LLM 调用 → 工具执行 → 循环直到完成或达到 maxIterations
```

### 1.3 当前 buildTaskHandler.ts 的问题

```typescript
// 当前实现（最小化）
export async function handleBuildTask(input: BuildTaskInput): Promise<BuildTaskResult> {
  const runner = createTaskRunner(supabase, { apiKey, maxIterations }, context);
  const result = await runner.run();
  return { success: result.success, ... };
}
```

**问题清单**：
1. 没有自我修复循环，失败直接返回错误
2. 没有错误诊断和重试机制
3. 上下文构建不够完整（只列出根目录文件）
4. 工具失败后没有结构化的纠错流程
5. 进度事件打点不完整

### 1.4 工具系统现状

| 工具类型 | 工具名称 | 功能 |
|---------|---------|------|
| 只读工具 | `list_files` | 列出目录文件（不递归） |
| 只读工具 | `read_file` | 读取文件内容 |
| 只读工具 | `search_files` | 搜索文件内容（不递归） |
| 只读工具 | `get_project_structure` | 获取项目结构（不递归） |
| 写入工具 | `write_file` | 写入文件（全量覆盖） |
| 写入工具 | `delete_file` | 删除文件/目录 |
| 写入工具 | `move_file` | 移动文件 |
| 特殊工具 | `generate_image` | 生成图片 |

**关键限制**：
- `get_project_structure` 只列出根目录（limit: 200），不递归
- `search_files` 只搜索根目录（limit: 50），不递归
- `write_file` 是全量覆盖，大文件频繁修改风险高
- 没有 `run_command` 工具，无法执行 lint/typecheck

### 1.5 事件协议不对齐问题

**发现的问题**：
- 后端 `logProgressEvent` 写入时使用 `type: 'agent_phase'`
- 前端 `useAgentEvents.ts` 检查 `type === 'progress'` 才进入 progress 分支
- **结果**：前端无法正确接收和处理进度事件

**需要修复**：统一事件类型，确保后端写入的 `type` 与前端期望的一致。

---

## 2. 目标架构设计

### 2.1 "像真正开发者"的定义（阶段 A）

阶段 A 的智能体应具备以下能力：

1. **项目结构感知**：能够获取完整的项目文件树，理解项目结构
2. **定位与探索**：能够通过搜索和读取定位关键文件
3. **依赖顺序修改**：按依赖关系顺序修改文件，避免引用错误
4. **工具失败纠错**：遇到工具执行失败时能自我诊断并修复
5. **可观测性**：输出可回放的行动轨迹，用户能实时看到进度
6. **完成标准（DoD）**：有明确的验收标准，即使不能运行命令也能做结构化检查

### 2.2 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                    buildTaskHandler.ts                       │
│  (Build 模式入口，负责策略编排和自我修复循环)                   │
├─────────────────────────────────────────────────────────────┤
│                      TaskRunner                              │
│  (7 阶段执行主干，负责阶段化控制流)                            │
├─────────────────────────────────────────────────────────────┤
│                      AgentLoop                               │
│  (LLM 调用 + 工具执行循环)                                    │
├─────────────────────────────────────────────────────────────┤
│                    工具执行层                                 │
│  (executor.ts + fileOperations.ts)                          │
├─────────────────────────────────────────────────────────────┤
│                    日志与事件层                               │
│  (buildLog.ts + agentEvents.ts)                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 新增/修改模块清单

| 模块 | 类型 | 职责 |
|------|------|------|
| `build/buildTaskHandler.ts` | 修改 | 增加自我修复循环、repair 预算、终止条件 |
| `build/buildContextBuilder.ts` | 新增 | 结构化上下文构建（文件树、关键入口、计划摘要） |
| `tools/definitions.ts` | 修改 | 增强 `get_project_structure`，规划 `apply_patch` |
| `tools/fileOperations.ts` | 修改 | 实现递归文件列表、增强搜索 |
| `logging/agentEvents.ts` | 修改 | 统一事件类型，补齐打点 |
| `llm/client.ts` | 修改 | 修复 `tool_choice` 类型不一致 |
| `prompts/v3/build.prompt.v*.md` | 修改 | 增加工作流状态机、DoD、错误处理契约 |

---

## 3. 核心模块设计

### 3.1 buildTaskHandler.ts 升级

#### 3.1.1 自我修复循环

```typescript
// build/buildTaskHandler.ts

interface BuildOrchestratorConfig {
  maxRepairAttempts: number;  // 最大修复尝试次数，建议 2-3
  maxIterations: number;       // AgentLoop 最大迭代次数
  repairBudget: number;        // 修复预算（迭代次数）
}

export async function handleBuildTask(input: BuildTaskInput): Promise<BuildTaskResult> {
  const config: BuildOrchestratorConfig = {
    maxRepairAttempts: BUILD_CONFIG.maxRepairAttempts || 2,
    maxIterations: BUILD_CONFIG.maxIterations,
    repairBudget: BUILD_CONFIG.repairBudget || 5
  };

  let repairAttempts = 0;
  let lastError: string | null = null;

  while (repairAttempts <= config.maxRepairAttempts) {
    try {
      // 1. 构建增强上下文
      const enhancedContext = await buildEnhancedContext(input);
      
      // 2. 创建 TaskRunner 并执行
      const runner = createTaskRunner(supabase, {
        apiKey,
        maxIterations: config.maxIterations - (repairAttempts * config.repairBudget)
      }, enhancedContext);
      
      const result = await runner.run();
      
      if (result.success) {
        return buildSuccessResult(result);
      }
      
      // 3. 执行失败，进入修复流程
      lastError = result.error || '未知错误';
      repairAttempts++;
      
      if (repairAttempts <= config.maxRepairAttempts) {
        await logRepairAttempt(supabase, taskId, projectId, repairAttempts, lastError);
        // 可选：调用 debugger prompt 生成修复计划
      }
      
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      repairAttempts++;
    }
  }

  return buildErrorResult(lastError, repairAttempts);
}
```

#### 3.1.2 终止条件

```typescript
// 终止条件检查
interface TerminationCondition {
  shouldTerminate: boolean;
  reason: string;
}

function checkTerminationConditions(
  iteration: number,
  maxIterations: number,
  consecutiveFailures: number,
  toolCallHistory: ToolCallRecord[]
): TerminationCondition {
  // 1. 达到最大迭代次数
  if (iteration >= maxIterations) {
    return { shouldTerminate: true, reason: `达到最大迭代次数 (${maxIterations})` };
  }
  
  // 2. 连续失败次数过多
  if (consecutiveFailures >= 3) {
    return { shouldTerminate: true, reason: `连续 ${consecutiveFailures} 次工具调用失败` };
  }
  
  // 3. 检测震荡（同一工具同一参数重复调用）
  const recentCalls = toolCallHistory.slice(-5);
  const duplicates = findDuplicateToolCalls(recentCalls);
  if (duplicates.length >= 3) {
    return { shouldTerminate: true, reason: '检测到工具调用震荡' };
  }
  
  return { shouldTerminate: false, reason: '' };
}
```

### 3.2 buildContextBuilder.ts（新增）

```typescript
// build/buildContextBuilder.ts

export interface BuildContext {
  // 文件树摘要（深度限制）
  fileTree: FileTreeSummary;
  // 关键入口文件列表
  entryPoints: string[];
  // 最近修改的文件
  recentlyModified: string[];
  // 计划摘要（来自 plan 阶段）
  planSummary?: PlanSummary;
  // 本次允许修改的范围
  allowedModificationScope?: string[];
  // 项目类型推断
  projectType: 'react' | 'vue' | 'vanilla' | 'unknown';
}

export interface FileTreeSummary {
  totalFiles: number;
  totalDirectories: number;
  tree: FileTreeNode[];
  truncated: boolean;
  maxDepth: number;
}

/**
 * 构建增强上下文
 * 
 * @param input - Build 任务输入
 * @param options - 构建选项
 * @returns 增强的上下文信息
 */
export async function buildEnhancedContext(
  input: BuildTaskInput,
  options: BuildContextOptions = {}
): Promise<BuildContext> {
  const {
    maxDepth = 3,
    maxFiles = 200,
    maxContentLength = 50000,
    includePatterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.json', '**/*.html', '**/*.css'],
    excludePatterns = ['node_modules/**', '.git/**', 'dist/**', 'build/**']
  } = options;

  // 1. 获取文件树（递归，带限制）
  const fileTree = await getFileTreeWithLimits(
    input.supabase,
    input.projectFilesContext,
    { maxDepth, maxFiles, includePatterns, excludePatterns }
  );

  // 2. 推断项目类型
  const projectType = inferProjectType(fileTree);

  // 3. 识别关键入口文件
  const entryPoints = identifyEntryPoints(fileTree, projectType);

  // 4. 获取计划摘要（如果有）
  const planSummary = await getPlanSummary(input.supabase, input.task.project_id);

  return {
    fileTree,
    entryPoints,
    recentlyModified: [],
    planSummary,
    projectType
  };
}

/**
 * 递归获取文件树（带限制）
 */
async function getFileTreeWithLimits(
  supabase: SupabaseClient,
  context: ProjectFilesContext,
  options: FileTreeOptions
): Promise<FileTreeSummary> {
  const { maxDepth, maxFiles, includePatterns, excludePatterns } = options;
  
  let totalFiles = 0;
  let totalDirectories = 0;
  let truncated = false;

  async function traverse(path: string, depth: number): Promise<FileTreeNode[]> {
    if (depth > maxDepth || totalFiles >= maxFiles) {
      truncated = true;
      return [];
    }

    const { data: items } = await supabase.storage
      .from(context.bucket)
      .list(`${context.path}/${path}`.replace(/\/+/g, '/'), {
        limit: 100,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (!items) return [];

    const nodes: FileTreeNode[] = [];
    
    for (const item of items) {
      if (totalFiles >= maxFiles) {
        truncated = true;
        break;
      }

      const itemPath = path ? `${path}/${item.name}` : item.name;
      
      // 检查排除模式
      if (matchesPattern(itemPath, excludePatterns)) continue;

      if (item.id) {
        // 文件
        if (matchesPattern(itemPath, includePatterns)) {
          totalFiles++;
          nodes.push({
            name: item.name,
            type: 'file',
            path: itemPath,
            size: item.metadata?.size
          });
        }
      } else {
        // 目录
        totalDirectories++;
        const children = await traverse(itemPath, depth + 1);
        nodes.push({
          name: item.name,
          type: 'directory',
          path: itemPath,
          children
        });
      }
    }

    return nodes;
  }

  const tree = await traverse('', 0);

  return {
    totalFiles,
    totalDirectories,
    tree,
    truncated,
    maxDepth
  };
}
```

### 3.3 工具系统增强

#### 3.3.1 增强 get_project_structure

```typescript
// tools/definitions.ts

// 增强的 get_project_structure 工具定义
{
  type: 'function',
  function: {
    name: 'get_project_structure',
    description: '获取项目文件结构。支持递归遍历和深度限制。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '要获取结构的路径，默认为项目根目录'
        },
        depth: {
          type: 'number',
          description: '递归深度限制，默认为 2，最大为 5'
        },
        include_patterns: {
          type: 'array',
          items: { type: 'string' },
          description: '包含的文件模式，如 ["*.ts", "*.tsx"]'
        },
        exclude_patterns: {
          type: 'array',
          items: { type: 'string' },
          description: '排除的文件模式，如 ["node_modules/**"]'
        }
      }
    }
  }
}
```

#### 3.3.2 规划 apply_patch 工具（阶段 A.2）

```typescript
// tools/definitions.ts（规划，暂不实现）

// apply_patch 工具定义
{
  type: 'function',
  function: {
    name: 'apply_patch',
    description: '应用 diff patch 到文件。比 write_file 更精确，适合小范围修改。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '要修改的文件路径'
        },
        patch: {
          type: 'string',
          description: 'unified diff 格式的 patch 内容'
        }
      },
      required: ['path', 'patch']
    }
  }
}

// 或者更简单的 edit_file 工具
{
  type: 'function',
  function: {
    name: 'edit_file',
    description: '编辑文件的指定范围。比 write_file 更精确。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '要修改的文件路径'
        },
        start_line: {
          type: 'number',
          description: '开始行号（1-indexed）'
        },
        end_line: {
          type: 'number',
          description: '结束行号（1-indexed，包含）'
        },
        new_content: {
          type: 'string',
          description: '替换的新内容'
        }
      },
      required: ['path', 'start_line', 'end_line', 'new_content']
    }
  }
}
```

#### 3.3.3 规划 run_command 工具（阶段 B）

```typescript
// tools/definitions.ts（规划，阶段 B 实现）

// run_command 工具定义
{
  type: 'function',
  function: {
    name: 'run_command',
    description: '执行受限的命令。仅支持白名单命令。',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          enum: ['npm_lint', 'npm_typecheck', 'npm_test', 'npm_build'],
          description: '要执行的命令'
        },
        timeout: {
          type: 'number',
          description: '超时时间（毫秒），默认 30000'
        }
      },
      required: ['command']
    }
  }
}
```

**执行环境说明**：
- Edge Function（Deno）不适合执行任意 shell 命令
- `run_command` 需要在 WebContainer 侧或受限 runner 服务中执行
- 需要设计安全策略：命令白名单、超时、输出截断、并发限制

### 3.4 修复 tool_choice 类型不一致

```typescript
// llm/client.ts

// 当前类型定义
export interface CallOpenRouterOptions {
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

// 修复后的类型定义
export interface CallOpenRouterOptions {
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
}

// 在 requestBody 组装时做兼容处理
function buildRequestBody(
  messages: ChatMessage[],
  model: string,
  options: CallOpenRouterOptions
): OpenRouterRequestBody {
  const body: OpenRouterRequestBody = {
    model,
    messages,
    // ...
  };

  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
    
    // tool_choice 兼容处理
    if (options.toolChoice) {
      if (options.toolChoice === 'required') {
        // OpenRouter 可能不支持 'required'，降级为 'auto' 并记录日志
        // 需要验证 OpenRouter 的实际支持情况
        console.log('[LLM] tool_choice: required -> 降级为 auto（待验证 OpenRouter 支持）');
        body.tool_choice = 'auto';
      } else {
        body.tool_choice = options.toolChoice;
      }
    }
  }

  return body;
}
```

### 3.5 事件协议统一

#### 3.5.1 后端修改

```typescript
// logging/agentEvents.ts

// 方案 1：后端改为写入 type: 'progress'
export async function logProgressEvent(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  projectId: string,
  kind: ProgressEventKind,
  data?: Partial<Omit<ProgressEventPayload, 'kind' | 'timestamp'>>
): Promise<void> {
  const payload: ProgressEventPayload = {
    kind,
    timestamp: new Date().toISOString(),
    ...data
  };
  
  // 改为 'progress' 以匹配前端期望
  await logAgentEvent(supabase, taskId, projectId, 'progress', payload as AgentEventPayload);
}
```

#### 3.5.2 前端修改（备选方案）

```typescript
// src/realtime/hooks/useAgentEvents.ts

// 方案 2：前端同时处理 'progress' 和 'agent_phase'
const handleAgentEvent = useCallback((event: DbAgentEvent) => {
  const { type, payload } = event;
  const kind = payload?.kind;

  // 同时处理 'progress' 和 'agent_phase' 类型
  if ((type === 'progress' || type === 'agent_phase') && kind) {
    switch (kind) {
      case 'stream_delta':
        // ...
        break;
      case 'stream_complete':
        // ...
        break;
      // ...
    }
  }
}, []);
```

**推荐方案**：方案 1（后端修改），保持类型语义清晰。

---

## 4. Prompt 系统升级

### 4.1 build.prompt 增强

#### 4.1.1 工作流状态机

```markdown
## 工作流状态机

你必须遵循以下工作流状态机执行任务：

### 状态定义

1. **EXPLORE（探索）**
   - 目标：理解项目结构和当前状态
   - 允许的工具：list_files, read_file, search_files, get_project_structure
   - 退出条件：已获得足够的上下文信息

2. **PLAN（规划）**
   - 目标：制定修改计划
   - 输出：简短的修改计划（不超过 5 步）
   - 退出条件：计划已确定

3. **IMPLEMENT（实现）**
   - 目标：执行修改
   - 允许的工具：write_file, delete_file, move_file
   - 规则：按依赖顺序修改，先修改被依赖的文件

4. **VERIFY（验证）**
   - 目标：验证修改是否正确
   - 方法：读取修改后的文件，检查引用关系
   - 退出条件：所有修改已验证

5. **FIX（修复）**
   - 触发条件：工具执行失败或验证发现问题
   - 目标：诊断问题并修复
   - 规则：先 search/read 定位问题，再修复

6. **SUMMARIZE（总结）**
   - 目标：输出变更摘要
   - 内容：修改了哪些文件、为什么、如何验证

### 状态转换

```
EXPLORE → PLAN → IMPLEMENT → VERIFY → SUMMARIZE
                    ↓           ↓
                   FIX ←───────┘
                    ↓
                IMPLEMENT
```

### 每次响应格式

在每次响应开始时，简要说明当前状态和下一步行动：

```
[状态: IMPLEMENT]
正在修改 src/components/Button.tsx，添加 onClick 处理函数。
```
```

#### 4.1.2 完成标准（Definition of Done）

```markdown
## 完成标准（Definition of Done）

在声明任务完成前，你必须确保：

### 必须满足的条件

1. **文件完整性**
   - 所有需要创建的文件已创建
   - 所有需要修改的文件已修改
   - 没有遗漏的文件操作

2. **引用一致性**
   - 所有 import 语句指向存在的文件
   - 所有导出的符号在使用处有对应的导入
   - 没有循环依赖（除非项目原本就有）

3. **语法正确性**
   - TypeScript/JavaScript 文件没有明显的语法错误
   - JSON 文件格式正确
   - HTML/CSS 文件结构完整

4. **变更可追踪**
   - 所有修改的文件路径已记录
   - 每个修改都有明确的原因

### 验证方法

由于当前环境不支持运行 lint/typecheck，你需要通过以下方式验证：

1. **读取验证**：修改后读取文件，确认内容正确
2. **引用检查**：搜索被修改文件的引用，确认兼容性
3. **结构检查**：检查文件的导入导出是否匹配

### 最终输出格式

任务完成时，输出以下摘要：

```
## 变更摘要

### 修改的文件
- src/components/Button.tsx: 添加 onClick 处理函数
- src/pages/Home.tsx: 更新 Button 组件的使用

### 验证结果
- [x] 文件完整性检查通过
- [x] 引用一致性检查通过
- [x] 语法正确性检查通过

### 如何验证
1. 运行 `npm run typecheck` 确认无类型错误
2. 运行 `npm run lint` 确认无 lint 错误
3. 在浏览器中测试 Button 组件的点击功能
```
```

#### 4.1.3 错误处理契约

```markdown
## 错误处理契约

### 工具执行失败时

当任何工具执行失败时，你必须：

1. **不要继续执行其他修改**
2. **诊断失败原因**：
   - 如果是文件不存在：使用 list_files 确认路径
   - 如果是权限错误：检查文件路径是否正确
   - 如果是内容格式错误：读取原文件确认格式
3. **制定修复方案**
4. **重试（最多 2 次）**

### 示例

```
[工具执行失败]
工具: write_file
错误: 文件路径不存在

[诊断]
使用 list_files 检查目录结构...
发现：目标目录 src/components/ 不存在

[修复方案]
1. 先创建 src/components/index.ts 作为目录入口
2. 再创建目标文件

[执行修复]
...
```

### 不可恢复的错误

以下情况应停止执行并报告：

- 连续 3 次相同工具调用失败
- 检测到工具调用震荡（重复调用同一工具同一参数）
- 超出最大迭代次数
```

#### 4.1.4 最小改动原则

```markdown
## 最小改动原则

### 核心规则

1. **优先局部修改**：能改一行就不改整个函数，能改一个函数就不改整个文件
2. **保留原有风格**：遵循文件现有的代码风格、命名约定、缩进方式
3. **避免大规模重写**：除非用户明确要求重构

### 修改前必做

在修改任何文件前，你必须：

1. **读取原文件**：了解现有代码结构和风格
2. **搜索调用点**：确认修改不会破坏其他文件
3. **确认修改范围**：明确要修改的具体位置

### 依赖顺序

修改多个文件时，按以下顺序：

1. 先修改被依赖的文件（如工具函数、类型定义）
2. 再修改依赖方文件（如组件、页面）
3. 最后修改入口文件（如 index.ts、App.tsx）

### 示例

```
[任务] 给 Button 组件添加 loading 状态

[错误做法]
直接重写整个 Button.tsx 文件

[正确做法]
1. 读取 Button.tsx，了解现有结构
2. 搜索 Button 的使用位置
3. 只添加 loading 相关的代码：
   - 添加 loading prop 类型
   - 添加 loading 状态渲染逻辑
   - 保留其他代码不变
```
```

---

## 5. 可观测性设计

### 5.1 进度事件协议

```typescript
// 统一的进度事件 kind
type ProgressEventKind =
  | 'stage_enter'      // 阶段进入
  | 'stage_exit'       // 阶段退出
  | 'iteration_start'  // 迭代开始
  | 'tool_start'       // 工具调用开始
  | 'tool_complete'    // 工具调用完成
  | 'thinking'         // AI 思考中
  | 'stream_delta'     // 流式输出增量
  | 'stream_complete'; // 流式输出完成

// 事件 payload 结构
interface ProgressEventPayload {
  kind: ProgressEventKind;
  timestamp: string;
  
  // stage_enter / stage_exit
  stage?: TaskPhase;
  message?: string;
  
  // iteration_start
  iteration?: number;
  totalIterations?: number;
  
  // tool_start / tool_complete
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  toolSuccess?: boolean;
  duration?: number;
  
  // stream_delta / stream_complete
  delta?: string;
  content?: string;
  messageId?: string;
  seq?: number;
  totalLength?: number;
}
```

### 5.2 打点位置

```typescript
// TaskRunner 打点
class TaskRunner {
  async run() {
    // 阶段进入/退出
    await this.executePhase('claim', async () => {
      await logStageEnter(supabase, taskId, projectId, 'claim');
      // ...
      await logStageExit(supabase, taskId, projectId, 'claim');
    });
    
    // agent_loop 阶段
    await this.executePhase('agent_loop', async () => {
      await logStageEnter(supabase, taskId, projectId, 'agent_loop');
      const result = await this.runAgentLoopPhase();
      await logStageExit(supabase, taskId, projectId, 'agent_loop');
      return result;
    });
  }
}

// AgentLoop 打点
async function runAgentLoop(...) {
  while (iteration < maxIterations) {
    iteration++;
    
    // 迭代开始
    await logIterationStart(supabase, taskId, projectId, iteration, maxIterations);
    
    // LLM 调用
    await logProgressEvent(supabase, taskId, projectId, 'thinking');
    const response = await callLLM(...);
    
    // 工具执行
    for (const toolCall of response.tool_calls) {
      await logToolStart(supabase, taskId, projectId, toolCall.name, toolCall.args);
      const result = await executeToolCall(...);
      await logToolComplete(supabase, taskId, projectId, toolCall.name, result, result.success);
    }
  }
}
```

### 5.3 前端 UI 展示建议

```typescript
// 建议的 UI 展示层级

// 1. Build 页面顶部：整体进度条
<BuildProgressBar 
  currentStage={currentStage}  // claim | load_context | agent_loop | ...
  iteration={currentIteration}
  maxIterations={maxIterations}
/>

// 2. Activity Timeline：详细事件列表
<ActivityTimeline events={agentEvents}>
  {events.map(event => (
    <TimelineItem key={event.id}>
      {event.kind === 'stage_enter' && <StageEnterItem stage={event.stage} />}
      {event.kind === 'tool_start' && <ToolStartItem tool={event.toolName} />}
      {event.kind === 'tool_complete' && <ToolCompleteItem tool={event.toolName} success={event.toolSuccess} />}
      {event.kind === 'stream_delta' && <StreamingText content={event.delta} />}
    </TimelineItem>
  ))}
</ActivityTimeline>

// 3. Build Logs：用户可读的摘要日志
<BuildLogs logs={buildLogs} />
```

---

## 6. 实现步骤

### 阶段 A：AI 自主使用工具进行代码编写

#### A.1 基础设施修复（优先级：高）

1. **清理废弃的 mode 字段**
   - 修改 `process-ai-tasks/index.ts`：直接使用 `task.type` 作为分发依据，删除 `task.mode` 相关逻辑
   - 删除 `mapToInteractionMode` 函数及相关的 legacy 类型（TaskType、WorkflowMode）
   - 数据库迁移：`ALTER TABLE ai_tasks DROP COLUMN mode;`
   - 受影响文件：
     - `supabase/functions/process-ai-tasks/index.ts`
     - `supabase/functions/_shared/ai/types.ts`

2. **修复事件协议不对齐**
   - 修改 `logging/agentEvents.ts`，将 `logProgressEvent` 的 type 改为 `'progress'`
   - 或修改前端同时处理 `'progress'` 和 `'agent_phase'`

3. **修复 tool_choice 类型不一致**
   - 修改 `llm/client.ts` 的 `CallOpenRouterOptions` 类型
   - 添加 `'required'` 到 toolChoice 类型
   - 添加运行时兼容处理（降级策略）

4. **补齐进度事件打点**
   - 在 TaskRunner 的每个阶段进入/退出时打点
   - 在 AgentLoop 的每次迭代、工具调用时打点

#### A.2 上下文构建增强（优先级：高）

1. **新增 buildContextBuilder.ts**
   - 实现递归文件树获取（带深度和数量限制）
   - 实现项目类型推断
   - 实现关键入口文件识别

2. **增强 get_project_structure 工具**
   - 添加 depth、include_patterns、exclude_patterns 参数
   - 实现递归遍历（复用 listAllFilesRecursively）

3. **增强 search_files 工具**
   - 支持递归搜索
   - 支持正则表达式
   - 返回行号

#### A.3 自我修复循环（优先级：中）

1. **升级 buildTaskHandler.ts**
   - 添加 repair 循环
   - 添加终止条件检查
   - 添加 repair 预算管理

2. **增强 AgentLoop 的工具失败处理**
   - 结构化错误反馈
   - 重试机制（同一工具同一参数最多重试 2 次）

#### A.4 Prompt 升级（优先级：中）

1. **升级 build.prompt.v*.md**
   - 添加工作流状态机
   - 添加完成标准（DoD）
   - 添加错误处理契约
   - 添加最小改动原则

#### A.5 精确编辑工具（优先级：低，可延后）

1. **规划 apply_patch 或 edit_file 工具**
   - 设计工具接口
   - 实现 diff 解析和应用
   - 添加到工具定义

### 阶段 B：调试能力（后续实现）

#### B.1 run_command 工具

1. **确定执行环境**
   - 评估 WebContainer 侧执行的可行性
   - 或设计受限 runner 服务

2. **设计安全策略**
   - 命令白名单
   - 超时限制
   - 输出截断
   - 并发限制

3. **实现工具**
   - 工具定义
   - 执行器实现
   - 结果解析

#### B.2 自动调试循环

1. **设计调试流程**
   - 运行命令 → 解析错误 → 定位问题 → 修复 → 重试

2. **实现 debugger prompt**
   - 错误诊断指令
   - 修复策略生成

---

## 7. 风险与注意事项

### 7.1 已知风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| OpenRouter 不支持 tool_choice: 'required' | build 模式工具调用不可用 | 运行时降级为 'auto'，记录日志 |
| write_file 全量覆盖 | 大文件频繁修改时不稳定 | 规划 apply_patch 工具，优先级提高 |
| 递归文件扫描成本高 | 大项目上下文构建慢 | 设置硬限制（maxFiles、maxDepth） |
| 事件协议不对齐 | 前端无法显示进度 | 优先修复，作为 A.1 的第一项 |

### 7.2 注意事项

1. **Edge Function 限制**
   - 不能执行任意 shell 命令
   - 有执行时间限制
   - 内存有限

2. **Storage API 限制**
   - list() 不递归，需要手动遍历
   - 每次 list 有数量限制

3. **WebContainer 限制**
   - 单例约束
   - 需要 COOP/COEP
   - 主要用于前端预览

---

## 8. 验收标准

### 阶段 A 验收标准

1. **功能验收**
   - [ ] AI 能够获取完整的项目结构（递归）
   - [ ] AI 能够按依赖顺序修改多个文件
   - [ ] AI 遇到工具失败时能自我诊断并重试
   - [ ] 前端能实时显示 AI 的执行进度
   - [ ] AI 完成任务时输出符合 DoD 的变更摘要

2. **质量验收**
   - [ ] 事件协议前后端对齐
   - [ ] tool_choice 类型一致
   - [ ] 进度事件打点完整
   - [ ] 无 TypeScript 类型错误
   - [ ] 通过 lint 检查

3. **性能验收**
   - [ ] 上下文构建时间 < 5 秒（200 文件以内）
   - [ ] 单次工具调用时间 < 2 秒
   - [ ] 整体任务完成时间合理（视任务复杂度）

---

## 附录

### A. 相关文件路径

```
supabase/functions/_shared/ai/
├── build/
│   ├── buildTaskHandler.ts      # 主处理逻辑（需修改）
│   ├── buildContextBuilder.ts   # 上下文构建（新增）
│   └── buildConfig.ts           # 配置
├── core/
│   ├── taskRunner.ts            # 阶段化执行（需修改）
│   └── agentLoop.ts             # Agent 循环（需修改）
├── tools/
│   ├── definitions.ts           # 工具定义（需修改）
│   ├── executor.ts              # 工具执行器
│   └── fileOperations.ts        # 文件操作（需修改）
├── llm/
│   └── client.ts                # LLM 客户端（需修改）
├── logging/
│   └── agentEvents.ts           # 事件日志（需修改）
└── prompts/
    └── router.ts                # Prompt 路由

prompts/v3/
└── build.prompt.v*.md           # Build 模式提示词（需修改）

src/realtime/
├── hooks/
│   └── useAgentEvents.ts        # Agent 事件 Hook（可能需修改）
└── types.ts                     # 类型定义
```

### B. 参考资料

- [Cursor 产品文档](https://cursor.sh/docs)
- [Bolt.new 产品介绍](https://bolt.new)
- [v0.dev 产品介绍](https://v0.dev)
- [Claude Code 文档](https://docs.anthropic.com)
- [OpenRouter API 文档](https://openrouter.ai/docs)
- [Supabase Storage API](https://supabase.com/docs/guides/storage)
