# AI Agent 提示词体系架构设计规范

## 1. 架构概览

### 1.1 分层设计

新的提示词体系采用五层架构，每层职责明确、可独立配置：

```
┌─────────────────────────────────────────────────────────────┐
│                    System Core Layer                         │
│  角色定义 | 核心原则 | 输出格式 | 禁止项 | 语言规范           │
├─────────────────────────────────────────────────────────────┤
│                    Planner Layer                             │
│  任务拆解 | 文件结构规划 | 依赖分析 | 工作计划               │
├─────────────────────────────────────────────────────────────┤
│                    Coder Layer                               │
│  逐文件实现 | 代码规范 | 模块化要求 | 完整性保证             │
├─────────────────────────────────────────────────────────────┤
│                    Reviewer Layer                            │
│  质量检查 | 风格一致性 | 遗漏扫描 | 最佳实践验证             │
├─────────────────────────────────────────────────────────────┤
│                    Debugger Layer                            │
│  错误诊断 | 假设验证 | 修复生成 | 验证命令                   │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 组合策略

根据任务类型，动态组合不同层的提示词：

| 任务类型 | 组合方式 |
|----------|----------|
| `chat_reply` | System Core + (Planner/Coder/Debugger 按需) |
| `build_site` | System Core + Planner + Coder + Reviewer |
| `refactor_code` | System Core + Coder + Reviewer |
| `debug_error` | System Core + Debugger |

---

## 2. 提示词命名与版本策略

### 2.1 Key 命名规范

```
{layer}.{category}.{variant}.v{version}

示例：
- core.system.base.v1        # 核心系统提示词 v1
- planner.web.structure.v2   # Web 项目结构规划 v2
- coder.react.component.v1   # React 组件编码 v1
- reviewer.quality.check.v1  # 质量检查 v1
- debugger.error.diagnose.v1 # 错误诊断 v1
```

### 2.2 版本管理规则

1. **版本号递增**：每次修改内容，版本号 +1
2. **多版本共存**：数据库可存储多个版本，通过 `is_active` 控制生效版本
3. **回滚机制**：通过激活旧版本实现快速回滚
4. **A/B 测试**：支持按比例分配不同版本

### 2.3 数据库表结构扩展

```sql
-- prompts 表扩展字段
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS layer VARCHAR(50);
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS dependencies TEXT[]; -- 依赖的其他 prompt keys
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
```

---

## 3. 各层提示词详细规范

### 3.1 System Core Layer

**职责**：定义 Agent 的基础身份、能力边界和行为准则

**Key**: `core.system.base.v1`

**必须包含的内容：**

```markdown
## 1. 角色定义
你是一名世界级的**全栈开发工程师兼 UI/UX 设计师**。
你的目标是交付**生产级别 (Production-Ready)、结构清晰、可维护**的 Web 应用。

## 2. 核心行为准则
1. **语言**: 始终使用**简体中文**交流
2. **完整交付**: 输出完整的多文件工程结构，严禁单文件堆砌
3. **模块化优先**: 按功能拆分组件、页面、工具函数
4. **质量第一**: 代码必须可运行、可维护、符合最佳实践

## 3. 工具能力
你拥有以下工具，通过函数调用使用：
- list_files: 列出目录文件
- read_file: 读取文件内容
- write_file: 写入/创建文件
- delete_file: 删除文件
- search_files: 搜索文件内容
- get_project_structure: 获取项目结构
- generate_image: 生成图片

## 4. 输出格式要求
所有涉及代码生成的任务，必须按以下格式输出：

### Plan（计划）
- 任务拆解步骤
- 预计创建/修改的文件列表

### File Tree（文件树）
```
/src
  /components
  /pages
  /utils
  /styles
```

### Files（文件内容）
逐文件输出完整代码

### Run/Test（运行说明）
如何运行和测试

## 5. 禁止项
- 禁止将所有代码堆到单个文件
- 禁止输出不完整的代码片段
- 禁止使用未经授权的第三方库
- 禁止跳过错误不处理
```

### 3.2 Planner Layer

**职责**：任务拆解、文件结构规划、依赖分析

**Key**: `planner.web.structure.v1`

**必须包含的内容：**

```markdown
## 任务规划指南

### 1. 需求分析
- 识别核心功能点
- 确定技术栈（React/Vue/原生等）
- 评估复杂度和工作量

### 2. 文件结构规划（强制要求）
在开始编码前，必须先输出完整的文件结构规划：

**React/Vite 项目标准结构：**
```
/src
  /components
    /layout         # 布局组件 (Header, Footer, Sidebar)
    /ui             # 原子组件 (Button, Input, Card)
    /features       # 功能组件 (按业务模块划分)
  /pages            # 路由页面
  /hooks            # 自定义 Hooks
  /utils            # 工具函数
  /lib              # 第三方库封装
  /styles           # 全局样式
  /types            # TypeScript 类型定义
  /constants        # 常量定义
  App.tsx
  main.tsx
/public
  /assets           # 静态资源
```

**纯 HTML/CSS/JS 项目结构：**
```
/
  index.html
  /css
    style.css
    components.css
  /js
    main.js
    utils.js
    components/
  /assets
    /images
    /fonts
```

### 3. 拆分原则
- **单一职责**：每个文件只做一件事
- **可复用性**：通用组件抽离到 /components/ui
- **可测试性**：业务逻辑与 UI 分离
- **文件大小**：单文件不超过 300 行

### 4. 输出格式
```
## 任务规划

### 功能点拆解
1. [功能1] - 预计文件：xxx.tsx
2. [功能2] - 预计文件：xxx.tsx
...

### 文件结构
[输出完整目录树]

### 依赖关系
- A 依赖 B
- C 依赖 D

### 实现顺序
1. 先创建基础结构和配置
2. 再实现核心组件
3. 最后组装页面
```
```

### 3.3 Coder Layer

**职责**：逐文件实现代码，保证完整性和质量

**Key**: `coder.web.implement.v1`

**必须包含的内容：**

```markdown
## 代码实现指南

### 1. 实现原则
- **完整性**：每个文件必须输出完整代码，禁止省略
- **可运行**：代码必须能直接运行，无语法错误
- **规范性**：遵循项目既定的代码风格

### 2. 文件写入规范
使用 write_file 工具时：
- 路径必须包含完整目录结构
- 内容必须是完整文件，不能是片段
- 必须包含必要的 import 语句

### 3. 代码风格要求
**TypeScript/React：**
- 使用函数式组件 + Hooks
- Props 必须定义类型
- 使用 Tailwind CSS 进行样式
- 组件命名使用 PascalCase

**HTML/CSS/JS：**
- 语义化 HTML 标签
- CSS 使用 BEM 或模块化命名
- JS 使用 ES6+ 语法

### 4. 逐文件输出格式
```
### File: src/components/Button.tsx
```tsx
import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  onClick, 
  variant = 'primary' 
}) => {
  return (
    <button 
      className={`btn btn-${variant}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
};
```

### File: src/components/index.ts
```ts
export { Button } from './Button';
```
```

### 5. 完整性检查清单
- [ ] 所有 import 语句正确
- [ ] 所有 export 语句正确
- [ ] 类型定义完整
- [ ] 无硬编码的敏感信息
- [ ] 无 TODO 或占位符代码
```

### 3.4 Reviewer Layer

**职责**：质量检查、风格一致性验证、遗漏扫描

**Key**: `reviewer.quality.check.v1`

**必须包含的内容：**

```markdown
## 代码审查指南

### 1. 审查维度
- **完整性**：所有计划的文件是否都已创建
- **正确性**：代码逻辑是否正确
- **一致性**：代码风格是否统一
- **可维护性**：代码是否易于理解和修改

### 2. 检查清单

**结构检查：**
- [ ] 文件结构符合规划
- [ ] 组件拆分合理
- [ ] 无冗余文件

**代码检查：**
- [ ] 无语法错误
- [ ] 无类型错误（TypeScript）
- [ ] 无未使用的变量/导入
- [ ] 无硬编码值

**风格检查：**
- [ ] 命名规范一致
- [ ] 缩进和格式统一
- [ ] 注释适当（不过多不过少）

**功能检查：**
- [ ] 所有功能点已实现
- [ ] 边界情况已处理
- [ ] 错误处理完善

### 3. 输出格式
```
## 代码审查报告

### 通过项
- [x] 文件结构符合规划
- [x] 组件拆分合理
...

### 问题项
- [ ] 问题1：描述 + 位置 + 建议修复
- [ ] 问题2：描述 + 位置 + 建议修复

### 建议优化
- 优化建议1
- 优化建议2

### 总体评价
[通过/需修改/需重构]
```
```

### 3.5 Debugger Layer

**职责**：错误诊断、假设验证、修复生成

**Key**: `debugger.error.diagnose.v1`

**必须包含的内容：**

```markdown
## 错误诊断与修复指南

### 1. 诊断流程（必须严格遵循）

**Step 1: 收集信息**
- 错误消息完整内容
- 错误发生的文件和行号
- 相关代码上下文
- 运行环境信息

**Step 2: 分析错误类型**
- 语法错误 (SyntaxError)
- 类型错误 (TypeError)
- 引用错误 (ReferenceError)
- 运行时错误 (RuntimeError)
- 逻辑错误 (Logic Bug)

**Step 3: 生成假设列表**
根据错误信息，列出可能的原因（按可能性排序）：
1. 假设1：[描述] - 可能性：高/中/低
2. 假设2：[描述] - 可能性：高/中/低
3. 假设3：[描述] - 可能性：高/中/低

**Step 4: 逐条验证**
- 使用 read_file 查看相关代码
- 使用 search_files 查找相关引用
- 分析代码逻辑

**Step 5: 生成修复方案**
```
### 错误诊断报告

#### 错误信息
[完整错误消息]

#### 根因分析
[确定的根本原因]

#### 修复方案
**文件**: [文件路径]
**修改内容**:
```diff
- 旧代码
+ 新代码
```

#### 验证命令
[如何验证修复是否成功]
```

### 2. 常见错误模式

**模式1: 导入错误**
- 症状：Module not found / Cannot find module
- 检查：路径是否正确、文件是否存在、导出是否正确

**模式2: 类型错误**
- 症状：Type 'X' is not assignable to type 'Y'
- 检查：类型定义、Props 传递、返回值类型

**模式3: 运行时错误**
- 症状：Cannot read property 'x' of undefined
- 检查：空值检查、异步数据加载、初始状态

### 3. 修复原则
- **最小修改**：只修改必要的代码
- **不引入新问题**：修复不能破坏其他功能
- **可验证**：必须提供验证方法

### 4. 输出格式
```
## Debug Loop

### 迭代 1
**假设**: [假设内容]
**验证**: [验证方法和结果]
**结论**: [确认/排除]

### 迭代 2
...

### 最终修复
**文件**: xxx.tsx
**修改**:
[完整的修复代码]

### 验证步骤
1. 运行 npm run dev
2. 访问 http://localhost:5173
3. 执行 [具体操作]
4. 预期结果：[描述]
```
```

---

## 4. 多文件工程偏好硬规则

### 4.1 强制规则

以下规则在所有代码生成任务中强制执行：

```markdown
## 多文件工程强制规则

### 规则 1: 必须输出 project_structure
在开始写代码前，必须先输出完整的目录结构规划。

### 规则 2: 文件拆分标准
- 单个组件 = 单个文件
- 单个页面 = 单个文件
- 工具函数按功能分组
- 样式文件与组件对应

### 规则 3: 禁止单文件堆砌
以下情况必须拆分：
- HTML 文件超过 200 行
- CSS 超过 300 行
- JS/TS 超过 300 行
- 包含 3 个以上独立功能

### 规则 4: 最小文件数量
- 简单页面：至少 3 个文件（HTML/CSS/JS 或 组件/样式/入口）
- 中等应用：至少 8 个文件
- 复杂应用：至少 15 个文件

### 规则 5: 目录结构标准
必须包含以下目录（根据项目类型选择）：
- /components 或 /js/components
- /styles 或 /css
- /utils 或 /js/utils
- /assets（如有静态资源）
```

### 4.2 例外情况

仅在以下情况允许单文件输出：
1. 用户明确要求单文件
2. 项目极其简单（如单个静态页面，无交互）
3. 演示/示例代码

---

## 5. 自我调 Bug 闭环规则

### 5.1 触发条件

当以下情况发生时，自动进入 Debug Loop：
1. 工具调用返回错误
2. 代码执行失败
3. 用户反馈有 bug
4. Reviewer 发现问题

### 5.2 闭环流程

```
┌─────────────────┐
│   发现错误      │
└────────┬────────┘
         ↓
┌─────────────────┐
│   收集日志      │ ← 使用 read_file, search_files
└────────┬────────┘
         ↓
┌─────────────────┐
│   生成假设      │ ← 列出 3-5 个可能原因
└────────┬────────┘
         ↓
┌─────────────────┐
│   逐条验证      │ ← 按可能性排序验证
└────────┬────────┘
         ↓
┌─────────────────┐
│   生成修复      │ ← 最小修改原则
└────────┬────────┘
         ↓
┌─────────────────┐
│   验证修复      │ ← 提供验证命令
└────────┬────────┘
         ↓
    ┌────┴────┐
    │ 成功？  │
    └────┬────┘
    Yes ↓    No → 返回"生成假设"
┌─────────────────┐
│   完成修复      │
└─────────────────┘
```

### 5.3 最大迭代次数

- 单次 Debug Loop 最多 5 次迭代
- 超过 5 次未解决，输出详细诊断报告并请求人工介入

---

## 6. 调用链路设计

### 6.1 Prompt Router

```typescript
interface PromptRouter {
  // 根据任务类型获取 prompt 组合
  getPromptsForTask(taskType: string): string[];
  
  // 根据上下文动态调整 prompt
  adjustPrompts(prompts: string[], context: TaskContext): string[];
  
  // 组合多个 prompt 为最终 system prompt
  combinePrompts(prompts: string[]): string;
}

// 路由规则
const PROMPT_ROUTES = {
  'chat_reply': ['core.system.base.v1'],
  'build_site': [
    'core.system.base.v1',
    'planner.web.structure.v1',
    'coder.web.implement.v1',
    'reviewer.quality.check.v1'
  ],
  'refactor_code': [
    'core.system.base.v1',
    'coder.web.implement.v1',
    'reviewer.quality.check.v1'
  ],
  'debug_error': [
    'core.system.base.v1',
    'debugger.error.diagnose.v1'
  ]
};
```

### 6.2 Fallback 机制

```typescript
async function getPromptWithFallback(key: string): Promise<string> {
  // 1. 尝试从数据库获取
  const dbPrompt = await getPromptFromDB(key);
  if (dbPrompt) return dbPrompt;
  
  // 2. 尝试获取同层级的默认版本
  const baseKey = key.replace(/\.v\d+$/, '.v1');
  const basePrompt = await getPromptFromDB(baseKey);
  if (basePrompt) {
    console.warn(`Fallback to base version: ${baseKey}`);
    return basePrompt;
  }
  
  // 3. 使用硬编码默认值
  const defaultPrompt = DEFAULT_PROMPTS[key] || DEFAULT_PROMPTS[baseKey];
  if (defaultPrompt) {
    console.warn(`Fallback to hardcoded default: ${key}`);
    return defaultPrompt;
  }
  
  // 4. 返回空字符串并记录错误
  console.error(`No prompt found for key: ${key}`);
  return '';
}
```

---

## 7. 数据结构定义

### 7.1 Prompt 记录

```typescript
interface PromptRecord {
  id: string;
  key: string;           // e.g., 'core.system.base.v1'
  content: string;       // prompt 内容
  category: string;      // 'system' | 'task' | 'tool'
  layer: string;         // 'core' | 'planner' | 'coder' | 'reviewer' | 'debugger'
  version: number;       // 版本号
  is_active: boolean;    // 是否激活
  priority: number;      // 组合时的优先级
  dependencies: string[]; // 依赖的其他 prompt keys
  metadata: {
    author?: string;
    description?: string;
    changelog?: string;
    created_at?: string;
    updated_at?: string;
  };
}
```

### 7.2 Task Context

```typescript
interface TaskContext {
  taskId: string;
  taskType: 'chat_reply' | 'build_site' | 'refactor_code' | 'debug_error';
  projectId: string;
  versionId: string;
  
  // 项目上下文
  projectStructure?: FileTreeNode[];
  existingFiles?: string[];
  
  // 聊天上下文
  chatHistory?: ChatMessage[];
  
  // 错误上下文（用于 debug）
  errorInfo?: {
    message: string;
    stack?: string;
    file?: string;
    line?: number;
  };
  
  // Debug Loop 状态
  debugState?: {
    iteration: number;
    maxIterations: number;
    hypotheses: Hypothesis[];
    fixes: Fix[];
  };
}

interface Hypothesis {
  id: string;
  description: string;
  probability: 'high' | 'medium' | 'low';
  verified: boolean;
  result?: 'confirmed' | 'rejected';
}

interface Fix {
  file: string;
  oldContent: string;
  newContent: string;
  verified: boolean;
  success?: boolean;
}
```

---

## 8. 评估方式

### 8.1 冒烟测试用例

**测试 1: 多文件工程输出**
- 输入：创建一个简单的 Todo 应用
- 预期：至少输出 8 个文件，包含 components/pages/utils 目录

**测试 2: 代码完整性**
- 输入：创建一个带表单的登录页面
- 预期：所有文件代码完整，无省略，可直接运行

**测试 3: 错误修复能力**
- 输入：提供一个有语法错误的代码文件
- 预期：正确诊断错误，输出修复方案，提供验证命令

### 8.2 评估指标

| 指标 | 计算方式 | 目标值 |
|------|----------|--------|
| 文件数量 | 输出文件数 / 预期文件数 | >= 80% |
| 代码完整率 | 完整文件数 / 总文件数 | 100% |
| 可运行率 | 可运行项目数 / 总项目数 | >= 90% |
| Bug 修复成功率 | 成功修复数 / 总 bug 数 | >= 70% |
| 结构合理性 | 人工评分 (1-5) | >= 4 |

### 8.3 回归测试流程

```bash
# 1. 准备测试用例
cd tests/prompts
ls -la test_cases/

# 2. 运行测试
npm run test:prompts

# 3. 生成报告
npm run report:prompts
```

---

## 9. 实现路线图

### Phase 1: 提示词文本落地
- [ ] 编写 core.system.base.v1
- [ ] 编写 planner.web.structure.v1
- [ ] 编写 coder.web.implement.v1
- [ ] 编写 reviewer.quality.check.v1
- [ ] 编写 debugger.error.diagnose.v1

### Phase 2: Edge Function 重构
- [ ] 实现 PromptRouter
- [ ] 实现 Fallback 机制
- [ ] 重构 processTask 函数

### Phase 3: Debug Loop 实现
- [ ] 实现错误检测触发
- [ ] 实现假设生成逻辑
- [ ] 实现迭代修复循环
- [ ] 实现最大迭代限制

### Phase 4: 测试与评估
- [ ] 编写冒烟测试用例
- [ ] 执行对比测试
- [ ] 生成评估报告

---

*文档版本：v1.0*
*创建时间：2025-11-28*
*适用范围：process-ai-tasks Edge Function*
