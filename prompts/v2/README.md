# Prompts v2 - 工具驱动执行版本

## 版本说明

v2 版本的核心改进是**强制工具驱动执行**，解决了 v1 版本中 AI 可能直接输出 Markdown 代码而不调用工具的问题。

## 主要变更

### 1. 强制工具调用

- 所有代码**必须**通过 `write_file` 工具创建
- **禁止**在回复中直接输出代码块
- **禁止**使用 Markdown 格式展示文件内容

### 2. 提示词文件

| 文件 | 用途 |
|------|------|
| `core.system.base.v2.md` | 核心系统提示词，定义基本行为和约束 |
| `workflow.build.v2.md` | 构建模式提示词，强制工具执行 |
| `workflow.planning.v2.md` | 规划模式提示词，制定实施计划 |
| `workflow.default.v2.md` | 默认只读模式提示词 |
| `coder.web.implement.v2.md` | 编码层提示词，代码实现规范 |
| `planner.web.structure.v2.md` | 规划层提示词，结构规划规范 |
| `reviewer.quality.check.v2.md` | 审查层提示词，质量检查规范 |
| `debugger.error.diagnosis.v2.md` | 调试层提示词，错误诊断规范 |

### 3. 与 v1 的区别

| 特性 | v1 | v2 |
|------|----|----|
| 代码输出方式 | 允许 Markdown 输出 | 强制工具调用 |
| 工具使用 | 可选 | 强制 |
| 输出格式约束 | 弱 | 强 |

## 使用说明

系统会自动检测并使用最新版本的提示词。当 v2 版本可用时，v1 版本将被自动弃用。

---

*Last Updated: 2025-12-07*
