# Prompt 评估对比笔记

本文档对比旧版 prompts 与新版 prompts 在典型任务上的差异。

---

## 1. 评估任务

### 任务 1: 创建一个简单的个人博客网站
**需求**：创建一个包含首页、关于页、文章列表页的个人博客

### 任务 2: 创建一个带状态管理的 Todo 应用
**需求**：创建一个 React Todo 应用，支持添加、删除、标记完成

### 任务 3: 修复一个有 bug 的表单组件
**需求**：修复一个表单提交后不清空输入框的 bug

---

## 2. 旧版 Prompt 分析

### 2.1 旧版 System Prompt (agent.system.base)

```
你是一个专业的全栈开发 AI Agent。请用简体中文回复。

你拥有以下工具能力，可以通过函数调用来使用它们：

**文件操作工具：**
- list_files: 列出项目目录下的文件和子目录
- read_file: 读取指定文件的内容
- write_file: 写入或创建文件
- delete_file: 删除指定文件
- search_files: 在项目文件中搜索关键词
- get_project_structure: 获取完整的项目文件树结构

**创意工具：**
- generate_image: 根据描述生成图片

**工作流程指南：**
1. 当需要了解项目现状时，先使用 get_project_structure 或 list_files 查看项目结构
2. 当需要修改代码时，先使用 read_file 读取现有文件内容，理解上下文
3. 使用 write_file 创建或修改文件，将生成的代码保存到项目中
4. 当需要查找特定功能或变量时，使用 search_files 搜索
5. 完成所有必要的文件操作后，给出最终的总结回复

**重要提示：**
- 你可以多次调用工具来完成复杂任务
- 每次工具调用后，根据结果决定下一步行动
- 在完成所有步骤后再给出最终答案
- 所有文件操作都限定在当前项目范围内
```

**问题分析：**
1. **无多文件强制规则**：没有要求输出 File Tree，没有最小文件数限制
2. **无输出格式规范**：没有定义 Plan/Files/Run 等结构化输出
3. **无代码完整性要求**：没有禁止省略代码的规则
4. **无调试流程**：没有错误处理和自我修复的指导

### 2.2 旧版 Task Prompt (agent.task.build_site)

```
**当前任务：构建网站**
你的任务是根据用户需求生成网站代码。请按以下步骤执行：
1. 首先使用 get_project_structure 了解现有项目结构
2. 根据需求规划要创建或修改的文件
3. 使用 write_file 工具创建必要的文件（如 index.html, styles.css, script.js 等）
4. 如果需要图片，使用 generate_image 生成
5. 完成后给出构建总结
```

**问题分析：**
1. **文件规划模糊**：只说"规划要创建的文件"，没有具体结构模板
2. **无拆分指导**：没有说明何时应该拆分文件
3. **无质量检查**：没有验证步骤
4. **无运行说明**：没有要求输出如何运行项目

---

## 3. 新版 Prompt 改进

### 3.1 新版 System Core (core.system.base.v1)

**改进点：**

| 维度 | 旧版 | 新版 |
|------|------|------|
| 多文件规则 | 无 | 5 条强制规则 |
| 输出格式 | 无 | Plan/File Tree/Files/Run 结构 |
| 代码完整性 | 无 | 禁止省略，必须完整 |
| 文件数量 | 无 | 最小文件数要求 |
| 一致性检查 | 无 | File Tree 与实际文件必须一致 |

**新增的强制规则：**
1. 必须输出 File Tree
2. 单组件单文件
3. 禁止单文件堆砌（超过阈值必须拆分）
4. 最小文件数量要求
5. 输出结构一致性约束

### 3.2 新版 Planner (planner.web.structure.v1)

**改进点：**
- 提供 React/HTML 项目结构模板
- 定义文件拆分原则和粒度指南
- 要求输出依赖关系图
- 定义实现顺序（被依赖的先实现）

### 3.3 新版 Coder (coder.web.implement.v1)

**改进点：**
- 完整性要求：禁止省略代码
- 文件写入顺序规范
- 代码风格模板（TypeScript/HTML/CSS/JS）
- 常用文件模板（package.json, vite.config.ts 等）

### 3.4 新版 Reviewer (reviewer.quality.check.v1)

**改进点：**
- 5 维度审查清单
- 单文件违例检测
- 问题分类和严重程度
- 结构化审查报告

### 3.5 新版 Debugger (debugger.error.diagnosis.v1)

**改进点：**
- 完整的调试流程（5 个 Phase）
- 假设生成和排序机制
- 最大迭代控制（5 次）
- 验证命令模板（按项目类型）
- 迭代状态追踪

---

## 4. 预期输出对比

### 任务 1: 创建个人博客网站

#### 旧版预期输出

```
我来帮你创建一个个人博客网站。

首先，让我创建必要的文件：

[调用 write_file 创建 index.html]
[调用 write_file 创建 style.css]
[调用 write_file 创建 script.js]

网站已创建完成，包含以下文件：
- index.html: 主页面
- style.css: 样式文件
- script.js: 脚本文件
```

**问题：**
- 可能把所有页面代码都放在 index.html
- 没有组件拆分
- 没有运行说明
- 没有文件结构规划

#### 新版预期输出

```
## Plan（计划）
1. 创建项目基础结构
2. 实现公共组件（Header, Footer, Navigation）
3. 实现首页
4. 实现关于页
5. 实现文章列表页
6. 添加样式

## File Tree（文件树）
```
/
├── index.html
├── about.html
├── articles.html
├── css/
│   ├── reset.css
│   ├── variables.css
│   ├── common.css
│   ├── home.css
│   ├── about.css
│   └── articles.css
├── js/
│   ├── common.js
│   └── articles.js
└── assets/
    └── images/
```

## Files（文件内容）
### File: index.html
[完整的 HTML 代码]

### File: about.html
[完整的 HTML 代码]

### File: articles.html
[完整的 HTML 代码]

### File: css/reset.css
[完整的 CSS 代码]

[... 所有文件的完整代码 ...]

## Run/Test（运行说明）
1. 直接在浏览器中打开 index.html
2. 或使用 Live Server 启动本地服务器
3. 点击导航链接测试页面跳转
```

**改进：**
- 清晰的文件结构规划
- 多文件拆分（至少 10 个文件）
- 完整的代码输出
- 运行说明

### 任务 3: 修复表单 bug

#### 旧版预期输出

```
我来帮你修复这个 bug。

[读取文件]

问题是表单提交后没有清空输入框。修复方法是在提交处理函数中添加清空逻辑。

[写入修复后的文件]

已修复。
```

**问题：**
- 没有错误分析过程
- 没有假设验证
- 没有验证步骤

#### 新版预期输出

```
## 调试报告

### 1. 错误概述
- **错误类型**：逻辑错误
- **错误位置**：src/components/ContactForm.tsx:45
- **错误信息**：表单提交后输入框未清空

### 2. 根因分析
- **根本原因**：handleSubmit 函数中缺少 reset 调用
- **验证方法**：检查 handleSubmit 函数实现

### 3. 假设列表
1. [高] handleSubmit 中缺少状态重置
2. [中] 表单 ref 未正确绑定
3. [低] 状态更新被其他逻辑覆盖

### 4. 修复代码

**修改前：**
```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  await submitForm(formData);
  // 缺少清空逻辑
};
```

**修改后：**
```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  await submitForm(formData);
  setFormData({ name: '', email: '', message: '' }); // 添加清空逻辑
};
```

### 5. 验证结果
- **验证命令**：npm run dev
- **验证状态**：成功
- **验证步骤**：
  1. 填写表单
  2. 点击提交
  3. 确认输入框已清空
```

**改进：**
- 完整的调试流程
- 假设列表和排序
- 清晰的修复 diff
- 验证步骤

---

## 5. 评估指标

### 5.1 结构化输出率
- 旧版：约 20%（偶尔有结构）
- 新版目标：100%（强制结构化输出）

### 5.2 多文件输出率
- 旧版：约 30%（倾向单文件）
- 新版目标：95%（强制多文件）

### 5.3 单文件违例率
- 旧版：约 60%（经常超过阈值）
- 新版目标：<5%（严格控制）

### 5.4 代码完整率
- 旧版：约 70%（经常省略）
- 新版目标：100%（禁止省略）

### 5.5 调试成功率
- 旧版：约 40%（无系统流程）
- 新版目标：80%（系统化调试）

---

## 6. 总结

新版 prompts 相比旧版的核心改进：

1. **从建议到强制**：多文件规则从"建议"变为"系统级约束"
2. **从模糊到具体**：输出格式从无到有，定义清晰的结构
3. **从单一到分层**：从单一 prompt 变为 5 层可组合体系
4. **从无到有的调试**：新增完整的调试闭环流程
5. **从无到有的验证**：新增 Reviewer 层进行质量检查

---

*Document Version: 1.0*
*Last Updated: 2025-11-28*
