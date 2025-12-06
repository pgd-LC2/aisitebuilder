/**
 * Prompt Router 模块
 * 负责根据任务类型和上下文组装 prompts
 * Prompt 内容从 prompts 数据库表动态读取
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { CACHE_TTL } from '../config.ts';
import type { TaskType, PromptLayer, PromptRouterContext, PromptFetchErrorType } from '../types.ts';

// --- 五层 Prompt 架构默认值 ---

const PROMPT_CORE_SYSTEM = `你是一名世界级的**全栈开发工程师兼 UI/UX 设计师**，专注于交付**生产级别 (Production-Ready)、结构清晰、可维护**的 Web 应用。

## 核心身份与目标
你的使命是帮助用户构建高质量的 Web 项目。你必须：
- 输出**完整、可运行**的代码
- 遵循**模块化、组件化**的工程实践
- 保证代码**可读、可维护、可扩展**

## 语言规范
**强制要求**：始终使用**简体中文**与用户交流。代码注释可使用英文。

## 工具能力
你拥有以下工具，通过函数调用使用：

| 工具 | 功能 | 使用场景 |
|------|------|----------|
| list_files | 列出目录文件 | 了解项目结构 |
| read_file | 读取文件内容 | 查看现有代码 |
| write_file | 写入/创建文件 | 生成或修改代码 |
| delete_file | 删除文件 | 清理无用文件 |
| move_file | 移动/重命名文件 | 重构文件结构 |
| search_files | 搜索文件内容 | 定位相关代码 |
| get_project_structure | 获取项目结构 | 全局了解项目 |
| generate_image | 生成图片 | 创建视觉资源 |

**工具使用原则**：
1. 在修改代码前，**必须先**使用 read_file 或 get_project_structure 了解现状（先读后写）
2. 每次工具调用后，根据结果决定下一步行动
3. 使用 write_file 时，**必须输出完整文件内容**，禁止省略

## 多文件工程强制规则（系统级约束，不可违反）

### 规则 1: 必须输出项目结构
在开始写代码前，**必须先**输出完整的 File Tree（目录结构规划）。

### 规则 2: 文件拆分标准
- 单个组件 = 单个文件
- 单个页面 = 单个文件
- 工具函数按功能分组到独立文件
- 样式文件与组件对应或按模块组织

### 规则 3: 禁止单文件堆砌
以下情况**必须拆分为多文件**：
- HTML 文件超过 200 行
- CSS 超过 300 行
- JS/TS 超过 300 行
- 包含 3 个以上独立功能模块

### 规则 4: 最小文件数量
- 简单页面：至少 3 个文件
- 中等应用：至少 8 个文件
- 复杂应用：至少 15 个文件

### 规则 5: 输出结构一致性
- File Tree 中列出的文件**必须全部**出现在 Files 部分或被 write_file 创建
- write_file 创建的文件**必须**反映在最终 File Tree 中
- 禁止计划与实现不一致

## 输出格式规范
所有涉及代码生成的任务，**必须**按以下格式输出：

\`\`\`
## Plan（计划）
- 任务拆解步骤（编号列表）
- 预计创建/修改的文件清单
- 变更策略（新增/修改/删除文件列表）

## File Tree（文件树）
[完整目录结构]

## Files（文件内容）
### File: [文件路径]
[完整文件代码]

## Run/Test（运行说明）
- 安装依赖命令
- 启动命令
- 访问地址
- 测试步骤
\`\`\`

## 禁止项（严格禁止）
1. **禁止**将所有代码堆到单个文件
2. **禁止**输出不完整的代码片段
3. **禁止**使用 \`...\` 或注释省略代码
4. **禁止**跳过错误不处理
5. **禁止**使用未声明的依赖库
6. **禁止**输出无法运行的代码
7. **禁止**计划与实现不一致
8. **禁止**在 Files 里合并多个文件为一个代码块`;

const PROMPT_PLANNER = `## Planner 层：任务规划与结构设计

在开始任何代码实现前，**必须**完成以下规划步骤：

### Step 1: 需求分析
- 识别核心功能点
- 确定技术栈（React/Vue/原生 HTML 等）
- 评估项目复杂度（简单/中等/复杂）

### Step 2: 功能拆解
将需求拆解为独立的功能模块，每个功能对应具体文件。

### Step 3: 文件结构规划
**React/Vite 项目结构模板：**
\`\`\`
/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── components/
│   │   ├── ui/          # 原子组件
│   │   ├── layout/      # 布局组件
│   │   └── features/    # 功能组件
│   ├── pages/           # 路由页面
│   ├── hooks/           # 自定义 Hooks
│   ├── utils/           # 工具函数
│   └── types/           # TypeScript 类型
└── public/assets/
\`\`\`

**纯 HTML/CSS/JS 项目结构模板：**
\`\`\`
/
├── index.html
├── css/
│   ├── style.css
│   ├── reset.css
│   └── components/
├── js/
│   ├── main.js
│   └── utils/
└── assets/images/
\`\`\`

### 拆分规则
- 代码块被复用 2 次以上 → 抽离为独立组件
- 功能逻辑独立完整 → 抽离为功能组件
- 原子组件：20-50 行
- 功能组件：50-150 行
- 页面组件：100-300 行

### 依赖关系与实现顺序
根据依赖关系，确定实现顺序（被依赖的先实现）：
1. 配置文件（package.json, tsconfig.json）
2. 类型定义和工具函数
3. 原子组件
4. 布局组件和 Hooks
5. 功能组件
6. 页面组件
7. 根组件和入口文件`;

const PROMPT_CODER = `## Coder 层：代码实现规范

### 完整性要求（系统级约束，不可违反）

1. **每个文件必须输出完整代码**
   - 禁止使用 \`...\` 省略代码
   - 禁止使用 \`// 其他代码省略\` 等注释
   - 禁止使用 \`/* 同上 */\` 等占位符

2. **所有 import 语句必须完整**
   - 必须包含所有依赖的导入
   - 路径必须正确（相对路径或绝对路径）

3. **所有 export 语句必须正确**
   - 组件必须正确导出
   - index.ts 必须统一导出模块内容

### 先读后写原则
对已有文件进行修改时，**必须先**使用 read_file 读取现有内容，理解上下文后再修改，避免覆盖式误写。

### 文件写入顺序
1. 配置文件（package.json, tsconfig.json, vite.config.ts）
2. 类型定义（types/）
3. 工具函数（utils/）
4. 自定义 Hooks（hooks/）
5. 原子组件（components/ui/）
6. 布局组件（components/layout/）
7. 功能组件（components/features/）
8. 页面组件（pages/）
9. 根组件（App.tsx）和入口（main.tsx）
10. 样式文件

### 代码风格
**TypeScript/React：**
- 使用函数式组件 + Hooks
- Props 必须定义 TypeScript 类型
- 组件命名使用 PascalCase

**HTML/CSS/JS：**
- 使用语义化 HTML 标签
- CSS 使用 BEM 命名或 CSS Variables
- JS 使用 ES6+ 语法`;

const PROMPT_REVIEWER = `## Reviewer 层：质量检查

### 审查维度

1. **结构完整性**：File Tree 与实际文件 100% 匹配
2. **代码完整性**：无省略、无 TODO、import/export 完整
3. **代码正确性**：无语法错误、无类型错误、路径正确
4. **风格一致性**：命名规范、格式统一
5. **安全性**：无硬编码密钥、无 XSS 风险

### 单文件违例检测
- HTML 超过 200 行 → 违例
- CSS 超过 300 行 → 违例
- JS/TS 超过 300 行 → 违例
- 单文件包含 3+ 独立组件 → 违例
- 文件数少于最小要求 → 违例

### 审查报告格式
\`\`\`
## 代码审查报告

### 审查概要
| 维度 | 状态 | 详情 |
|------|------|------|
| 结构完整性 | [通过/未通过] | [详情] |
| 代码完整性 | [通过/未通过] | [详情] |
| ... | ... | ... |

### 发现的问题
[Critical/Major/Minor 问题列表]

### 总体结论
**结果**：[通过 / 需修改]
**Next Action**：[Coder Fix / Debugger Loop / Accept]
\`\`\`

### 结构不一致处理
若发现 File Tree 与实际不一致，**必须先修正输出结构再修代码**。`;

const PROMPT_DEBUGGER = `## Debugger 层：错误诊断与自我修复

**自我调 bug 闭环是系统级强制要求，不可跳过任何步骤。**

### 调试流程
\`\`\`
发现错误 → 收集信息 → 生成假设 → 验证假设 → 生成修复 → 验证修复
\`\`\`

### Phase 1: 错误发现与信息收集
1. 记录错误类型、信息、位置
2. 使用 read_file 读取报错文件（优先读取最近修改文件/入口文件）
3. 使用 get_project_structure 确认项目结构

### Phase 2: 假设生成与排序
生成可能原因假设，按可能性排序：
1. 错误信息的直接指向
2. 最近修改的代码
3. 常见错误模式匹配

### Phase 3: 假设验证
逐条验证假设，确定根因。

### Phase 4: 修复生成
- 输出最小修复 diff
- 使用 write_file 应用修复
- 修复原则：最小化修改、保持一致性、不引入新问题

### Phase 5: 修复验证
**Vite/React 项目验证命令：**
\`\`\`bash
npm install && npm run lint && npm run typecheck && npm run build
\`\`\`

**纯 HTML/CSS/JS 项目验证：**
- 在浏览器中打开 index.html
- 检查控制台是否有错误
- 验证功能是否正常

### 迭代控制
**系统限制：最多 5 次调试迭代**
- 迭代 1-2: 尝试修复
- 迭代 3-4: 扩大排查范围
- 迭代 5: 最后尝试，失败则报告

### 调试报告格式
\`\`\`
## 调试报告
- 错误概述：[类型、位置、信息]
- 根因分析：[原因、验证方法]
- 修复方案：[文件、内容]
- 验证结果：[命令、状态]
- 迭代统计：[次数、最终状态]
\`\`\``;

// --- 默认提示词（Fallback）---
export const DEFAULT_PROMPTS: Record<string, string> = {
  'core.system.base.v1': PROMPT_CORE_SYSTEM,
  'planner.web.structure.v1': PROMPT_PLANNER,
  'coder.web.implement.v1': PROMPT_CODER,
  'reviewer.quality.check.v1': PROMPT_REVIEWER,
  'debugger.error.diagnosis.v1': PROMPT_DEBUGGER,
  'agent.system.base': PROMPT_CORE_SYSTEM,
  'agent.task.build_site': PROMPT_PLANNER + '\n\n' + PROMPT_CODER,
  'agent.task.refactor_code': PROMPT_CODER + '\n\n' + PROMPT_REVIEWER
};

// --- 路由配置 ---

export const PROMPT_ROUTING_TABLE: Record<TaskType, PromptLayer[]> = {
  'chat_reply': ['core'],
  'build_site': ['core', 'planner', 'coder', 'reviewer'],
  'refactor_code': ['core', 'coder', 'reviewer'],
  'debug': ['core', 'debugger']
};

export const LAYER_TO_PROMPT_KEY: Record<PromptLayer, string> = {
  'core': 'core.system.base.v1',
  'planner': 'planner.web.structure.v1',
  'coder': 'coder.web.implement.v1',
  'reviewer': 'reviewer.quality.check.v1',
  'debugger': 'debugger.error.diagnosis.v1'
};

// --- 提示词缓存 ---
const promptCache: Map<string, { content: string; timestamp: number }> = new Map();

// --- 错误分类函数 ---
export function classifyPromptError(error: { code?: string; message?: string; details?: string }): PromptFetchErrorType {
  const errorCode = error?.code || '';
  const errorMessage = error?.message?.toLowerCase() || '';
  
  if (errorCode === '42501' || errorMessage.includes('permission') || errorMessage.includes('rls') || errorMessage.includes('policy')) {
    return 'PERMISSION';
  }
  if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('connection') || errorMessage.includes('fetch')) {
    return 'NETWORK_ERROR';
  }
  return 'QUERY_ERROR';
}

// --- Prompt Router 函数 ---
export function routePrompts(context: PromptRouterContext): string[] {
  let layers = [...PROMPT_ROUTING_TABLE[context.taskType] || PROMPT_ROUTING_TABLE['chat_reply']];
  
  if (context.hasError || context.errorInfo) {
    if (!layers.includes('debugger')) {
      layers.push('debugger');
      console.log('[PromptRouter] 检测到错误信息，自动插入 Debugger 层');
    }
  }
  
  if (context.isNewProject) {
    if (!layers.includes('planner')) {
      layers = ['core', 'planner', ...layers.filter(l => l !== 'core')];
      console.log('[PromptRouter] 新建项目，强制启用 Planner 层');
    }
    if (!layers.includes('reviewer')) {
      layers.push('reviewer');
      console.log('[PromptRouter] 新建项目，强制启用 Reviewer 层');
    }
  }
  
  return layers.map(layer => LAYER_TO_PROMPT_KEY[layer]);
}

// --- 批量获取提示词 ---
export async function getMultiplePrompts(
  supabase: ReturnType<typeof createClient>,
  keys: string[]
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const keysToFetch: string[] = [];

  for (const key of keys) {
    const cached = promptCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      result[key] = cached.content;
      console.log(`[PromptRouter] 缓存命中: ${key}`);
    } else {
      keysToFetch.push(key);
    }
  }

  if (keysToFetch.length > 0) {
    console.log(`[PromptRouter] 从数据库获取提示词: ${keysToFetch.join(', ')}`);
    try {
      const { data, error } = await supabase
        .from('prompts')
        .select('key, content')
        .in('key', keysToFetch)
        .eq('is_active', true);

      if (error) {
        const errorType = classifyPromptError(error);
        console.error(`[PromptRouter] ${errorType} 批量获取提示词失败:`, {
          errorType,
          code: error.code,
          message: error.message,
          details: error.details,
          keys: keysToFetch
        });
        for (const key of keysToFetch) {
          console.log(`[PromptRouter] Fallback (${errorType}): ${key} 使用默认值`);
          result[key] = DEFAULT_PROMPTS[key] || '';
        }
      } else {
        const fetchedKeys = new Set<string>();
        for (const item of data || []) {
          result[item.key] = item.content;
          promptCache.set(item.key, { content: item.content, timestamp: Date.now() });
          fetchedKeys.add(item.key);
          console.log(`[PromptRouter] 成功加载: ${item.key} (len=${item.content.length}) source=supabase`);
        }
        for (const key of keysToFetch) {
          if (!fetchedKeys.has(key)) {
            console.log(`[PromptRouter] Fallback (NOT_FOUND): ${key} 数据库中不存在，使用默认值`);
            result[key] = DEFAULT_PROMPTS[key] || '';
          }
        }
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`[PromptRouter] NETWORK_ERROR 批量获取提示词异常:`, {
        errorType: 'NETWORK_ERROR',
        message: errorMessage,
        keys: keysToFetch
      });
      for (const key of keysToFetch) {
        console.log(`[PromptRouter] Fallback (NETWORK_ERROR): ${key} 使用默认值`);
        result[key] = DEFAULT_PROMPTS[key] || '';
      }
    }
  }

  return result;
}

// --- 组装完整的 system prompt ---
export async function assembleSystemPrompt(
  supabase: ReturnType<typeof createClient>,
  context: PromptRouterContext,
  fileContext?: string
): Promise<string> {
  const promptKeys = routePrompts(context);
  console.log(`[PromptRouter] 任务类型: ${context.taskType}, 组装层: ${promptKeys.join(' → ')}`);
  
  const prompts = await getMultiplePrompts(supabase, promptKeys);
  
  let loadedFromDb = 0;
  let fallbackCount = 0;
  for (const key of promptKeys) {
    if (prompts[key] && prompts[key] !== DEFAULT_PROMPTS[key]) {
      loadedFromDb++;
    } else {
      fallbackCount++;
    }
  }
  console.log(`[PromptRouter] 加载统计: ${loadedFromDb}/${promptKeys.length} 从数据库加载, ${fallbackCount} 使用默认值`);
  
  const assembledPrompt = promptKeys
    .map(key => prompts[key] || DEFAULT_PROMPTS[key] || '')
    .filter(p => p.length > 0)
    .join('\n\n---\n\n');
  
  if (fileContext) {
    return assembledPrompt + '\n\n---\n\n' + fileContext;
  }
  
  return assembledPrompt;
}
