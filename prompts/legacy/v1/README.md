# AI Agent Prompt 体系

本目录包含 AI Site Builder 项目的模块化提示词体系。

---

## 架构概述

采用五层架构设计，每层职责明确，可独立使用或组合：

```
┌─────────────────────────────────────────────────────────────┐
│                    System Core Layer                        │
│              (角色定义、核心原则、工具能力)                    │
├─────────────────────────────────────────────────────────────┤
│  Planner Layer  │  Coder Layer  │  Reviewer  │  Debugger   │
│  (任务规划)      │  (代码实现)    │  (质量检查) │  (错误诊断)  │
└─────────────────────────────────────────────────────────────┘
```

---

## 文件清单

| 文件 | 层级 | 版本 | 描述 |
|------|------|------|------|
| `core.system.base.v1.md` | System Core | v1 | 系统核心提示词，定义角色、原则、工具、多文件规则 |
| `planner.web.structure.v1.md` | Planner | v1 | 任务规划提示词，定义结构模板、拆分规则、依赖分析 |
| `coder.web.implement.v1.md` | Coder | v1 | 代码实现提示词，定义实现原则、风格规范、文件模板 |
| `reviewer.quality.check.v1.md` | Reviewer | v1 | 质量检查提示词，定义审查维度、检查清单、报告格式 |
| `debugger.error.diagnosis.v1.md` | Debugger | v1 | 错误诊断提示词，定义调试流程、假设验证、迭代控制 |
| `prompt_eval_notes.md` | - | - | 新旧提示词对比评估笔记 |

---

## 命名规范

```
{layer}.{category}.{variant}.v{version}.md
```

- **layer**: 层级名称 (core/planner/coder/reviewer/debugger)
- **category**: 分类 (system/web/quality/error)
- **variant**: 变体 (base/structure/implement/check/diagnosis)
- **version**: 版本号 (v1, v2, ...)

---

## 使用方式

### 1. 基础使用（单层）

仅使用 System Core：
```
System Core → 直接执行任务
```

### 2. 标准使用（三层）

适用于一般开发任务：
```
System Core + Planner + Coder
```

### 3. 完整使用（五层）

适用于复杂任务或需要高质量输出：
```
System Core + Planner + Coder + Reviewer + Debugger
```

---

## 任务类型路由

| 任务类型 | 推荐组合 |
|----------|----------|
| 简单问答 | Core |
| 代码片段 | Core + Coder |
| 新建网站 | Core + Planner + Coder + Reviewer |
| 代码重构 | Core + Coder + Reviewer |
| Bug 修复 | Core + Debugger |
| 复杂应用 | Core + Planner + Coder + Reviewer + Debugger |

---

## 核心规则摘要

### 多文件工程规则（强制）

1. **必须输出 File Tree**：在写代码前先规划结构
2. **单组件单文件**：每个组件独立文件
3. **禁止单文件堆砌**：超过阈值必须拆分
4. **最小文件数量**：简单>=3, 中等>=8, 复杂>=15
5. **输出一致性**：File Tree 与实际文件必须匹配

### 自我调 bug 规则（强制）

1. **收集信息**：记录错误、读取相关文件
2. **生成假设**：列出可能原因并排序
3. **验证假设**：逐条验证，确定根因
4. **生成修复**：输出最小修复 diff
5. **验证修复**：执行验证命令确认
6. **迭代控制**：最多 5 次迭代

---

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1 | 2025-11-28 | 初始版本，五层架构 |

---

## 相关文档

- [baseline.md](../docs/baseline.md) - 基线分析报告
- [prompt_spec.md](../docs/prompt_spec.md) - 架构设计规范

---

*Last Updated: 2025-11-28*
