# AI Agent 提示词体系基线分析报告

## 1. 现状概述

### 1.1 当前架构

Edge Function `process-ai-tasks` 是 AI Agent 的核心处理器，位于 `supabase/functions/process-ai-tasks/index.ts`（共 1214 行）。

**提示词存储机制：**
- 主存储：`prompts` 数据库表（key, content, category, version, is_active）
- 缓存层：内存 Map，TTL 5 分钟
- 降级方案：`DEFAULT_PROMPTS` 硬编码常量

**当前提示词类型：**

| Key | 用途 | 行数 | 描述 |
|-----|------|------|------|
| `agent.system.base` | System Prompt | ~25行 | 定义角色、工具能力、工作流程指南 |
| `agent.task.build_site` | 任务提示词 | ~6行 | 构建网站任务指导 |
| `agent.task.refactor_code` | 任务提示词 | ~5行 | 代码重构任务指导 |

### 1.2 调用链路

```
HTTP Request
    ↓
Deno.serve() 主入口
    ↓
claimTask() - 使用 SELECT FOR UPDATE SKIP LOCKED 抢占任务
    ↓
processTask() - 核心处理函数
    ├── getMultiplePrompts() - 批量获取提示词
    ├── fetchRecentChatMessages() - 获取聊天历史
    ├── getProjectFileContext() - 读取项目文件上下文
    ├── 构建 messages 数组（system + user）
    └── while(true) Agent 循环
        ├── callOpenRouterChatCompletionsApi() - 调用 LLM
        ├── 解析 tool_calls
        ├── executeToolCall() - 执行工具
        └── 添加 tool 结果到消息历史
    ↓
writeAssistantMessage() - 写入最终响应
updateTaskStatus() - 更新任务状态
```

### 1.3 可用工具

| 工具名 | 功能 | 参数 |
|--------|------|------|
| `generate_image` | 生成图片 | prompt, aspect_ratio |
| `list_files` | 列出目录文件 | path (可选) |
| `read_file` | 读取文件内容 | path |
| `write_file` | 写入/创建文件 | path, content |
| `delete_file` | 删除文件 | path |
| `search_files` | 搜索文件内容 | keyword, file_extension |
| `get_project_structure` | 获取项目结构 | 无 |

---

## 2. 核心痛点分析

### 2.1 痛点一：输出不成工程结构

**现象：**
- Agent 倾向于将所有代码堆到单个文件（如 index.html 内联 CSS/JS）
- 没有明确的项目结构规划输出
- 缺乏模块化开发指导

**根因：**
1. 提示词中没有强制要求输出 `project_structure`（目录树）
2. 没有文件组织最佳实践指导（components/pages/utils/styles 等）
3. 缺乏"多文件工程偏好"的硬规则

**现有提示词问题示例：**
```
// agent.task.build_site 当前内容
**当前任务：构建网站**
你的任务是根据用户需求生成网站代码。请按以下步骤执行：
1. 首先使用 get_project_structure 了解现有项目结构
2. 根据需求规划要创建或修改的文件
3. 使用 write_file 工具创建必要的文件（如 index.html, styles.css, script.js 等）
4. 如果需要图片，使用 generate_image 生成
5. 完成后给出构建总结
```

**缺失内容：**
- 没有要求输出文件树规划
- 没有强制拆分组件/页面/工具函数
- 没有代码组织标准

### 2.2 痛点二：多文件能力弱

**现象：**
- 创建复杂应用时文件数量少
- 组件复用性差
- 缺乏文件间依赖关系处理

**根因：**
1. 提示词没有强调模块化开发的重要性
2. 没有提供多文件项目的示例结构
3. 缺乏代码拆分的具体指导（何时拆分、如何拆分）

**对比参考（prompt.txt）：**
```
## 5. 项目目录结构 (Project Structure)
遵循清晰的模块化结构：
/src
  /components
    /layout       # Header, Footer, Wrapper
    /ui           # Button, Input, Badge (原子组件)
  /pages          # 路由页面
  /lib            # cn (clsx + tailwind-merge), constants
  /hooks          # useAuth, useTheme
  App.tsx
  main.tsx
  index.css       # 全局样式
```

### 2.3 痛点三：错误后不会修复

**现象：**
- 工具执行失败后只记录日志，不尝试修复
- 没有错误诊断流程
- 缺乏自动修复循环机制

**根因：**
1. 没有 `debugger` 角色/提示词
2. 没有错误分析和假设验证流程
3. 缺乏"发现错误 → 定位原因 → 提出修复 → 验证修复"的闭环

**当前错误处理（index.ts:1122-1134）：**
```typescript
} catch (error) {
  console.error(`处理任务 ${task.id} 失败:`, error);
  await writeBuildLog(supabase, task.project_id, 'error', `AI 任务处理失败: ${error.message}`);
  
  if (task.attempts >= task.max_attempts) {
    await updateTaskStatus(supabase, task.id, 'failed', undefined, error.message);
  } else {
    await supabase.from('ai_tasks').update({
      status: 'queued',
      error: `Attempt ${task.attempts} failed: ${error.message}`
    }).eq('id', task.id);
  }
  throw error;
}
```

**问题：**
- 只有重试机制，没有智能修复
- 重试时使用相同的提示词，不会学习错误
- 没有错误类型分类和针对性处理

### 2.4 其他问题

**提示词架构问题：**
- 结构扁平，不可组合
- 没有分层设计（System Core / Planner / Coder / Reviewer / Debugger）
- 缺乏版本管理策略

**角色缺失：**
- 没有 Planner（任务拆解、文件结构规划）
- 没有 Reviewer（质量检查、风格一致性）
- 没有 Debugger（错误诊断、修复验证）

**工具使用指导不足：**
- 没有工具使用优先级指导
- 没有工具组合使用的最佳实践
- 缺乏工具调用后的验证要求

---

## 3. 改造目标对照表

| 维度 | 当前状态 | 目标状态 | 差距 |
|------|----------|----------|------|
| **提示词结构** | 扁平、硬编码 | 模块化、可组合、可配置 | 需要重构为分层架构 |
| **角色体系** | 仅 system + task | System Core + Planner + Coder + Reviewer + Debugger | 需要新增 4 个角色 |
| **工程输出** | 单文件倾向 | 多文件工程结构 | 需要强制规则 + 输出模板 |
| **错误处理** | 简单重试 | 智能诊断 + 自动修复循环 | 需要新增 debug loop |
| **质量保障** | 无 | 代码审查 + 风格检查 | 需要新增 reviewer |
| **版本管理** | 无 | key.v{n} 命名策略 | 需要设计版本方案 |

---

## 4. 参考文件分析

### 4.1 Roo Code / Kilocode 提示词体系

**模块化分层：**
```
system.ts           # 主入口，组合各个 section
sections/
  ├── capabilities.ts    # 能力描述
  ├── rules.ts           # 行为规则
  ├── objective.ts       # 目标和工作流程
  ├── tool-use.ts        # 工具使用规范
  ├── tool-use-guidelines.ts  # 工具使用指南
  └── ...
tools/
  ├── write-to-file.ts   # 工具描述定义
  ├── edit-file.ts
  └── ...
instructions/
  └── instructions.ts    # 特定任务指令
```

**关键设计原则：**
1. 迭代式工作流程（一次一个工具调用）
2. 工具调用后等待确认
3. 明确的错误处理指导
4. 代码编辑的完整性要求

### 4.2 prompt.txt (UI/UX 设计师风格)

**结构清晰：**
1. 角色与核心目标
2. 核心行为准则
3. 技术栈规范
4. 视觉/布局规范
5. 项目目录结构
6. 设计哲学

**值得借鉴：**
- 明确的角色定位
- 具体的行为准则（拒绝平庸、完整交付）
- 详细的技术规范
- 清晰的项目结构模板

---

## 5. 验证方法

本基线分析通过以下方式验证：

1. **代码审查**：完整阅读 `process-ai-tasks/index.ts` 全部 1214 行
2. **提示词提取**：识别所有 `DEFAULT_PROMPTS` 和 `promptKeys`
3. **调用链追踪**：从 `Deno.serve()` 到 `processTask()` 的完整流程
4. **参考对比**：与 Roo Code 提示词体系和 prompt.txt 进行对比分析

---

## 6. 下一步行动

基于以上分析，Step1 将设计新的 Prompt 架构，包括：

1. **分层设计**：System Core → Planner → Coder → Reviewer → Debugger
2. **命名策略**：`{role}.{task}.v{version}` 格式
3. **多文件工程硬规则**：强制输出 project_structure
4. **自我调 bug 闭环**：错误诊断 → 假设验证 → 修复 → 验证
5. **输出模板**：Plan / File Tree / Files / Run/Test / Debug Loop

---

*文档生成时间：2025-11-28*
*分析范围：supabase/functions/process-ai-tasks/*
