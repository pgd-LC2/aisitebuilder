# 文档目录

## knowledge/ - 知识库文档（必读）

从 Devin 知识库中提取的与 aisitebuilder 项目直接相关的知识文档。**在项目中工作时，必须先访问 `docs` 文件夹查看相关文档内容。**

| 文件 | 描述 |
|------|------|
| **[README.md](knowledge/README.md)** | **知识库文档索引** - 所有知识文档的目录 |
| **[development-standards.md](knowledge/development-standards.md)** | **开发规范** - 项目结构、代码风格、开发流程 |
| **[ai-prompt-system.md](knowledge/ai-prompt-system.md)** | **AI Prompt 系统架构** - v3 统一交互模式架构 |
| **[edge-function-architecture.md](knowledge/edge-function-architecture.md)** | **Edge Function 模块化架构** - `_shared/ai/` 目录结构 |
| **[realtime-architecture-constraints.md](knowledge/realtime-architecture-constraints.md)** | **实时功能架构约束** - Step1 Realtime 架构约束 |

## 重构规划与实施方案

| 文件 | 状态 | 描述 |
|------|------|------|
| **components-restructure-plan.md** | 已完成 | **组件目录重构规划文档** - 描述 src/components 目录的分类重构方案 |
| **style-unification-plan.md** | 已完成 | **样式统一实施方案** - 将非语义颜色类统一到 CSS 变量系统 |
| **build-agent-upgrade-plan.md** | 规划中 | **Build 智能体升级规划** - 将 buildTaskHandler 升级为真正的智能体系统 |

## 测试文档

| 文件 | 描述 |
|------|------|
| **testing-guide.md** | **测试指南** - Vitest 测试规范、BDD 风格、AAA 模式 |
| **auto-test-generator.md** | **自动测试生成器** - AI 驱动的测试生成工具文档 |

## specs/ - 技术规范（当前使用）

活跃的技术规范文档，描述系统当前的架构和接口设计。

| 文件 | 描述 |
|------|------|
| **task-workflow-architecture.md** | **任务与工作流架构（新人必读）** - chat/plan/build 三种模式的设计 |
| **realtime_architecture_v2.md** | **Realtime 订阅架构 v2** - Generation 和 CloseReason 机制 |
| agent_events_spec.md | Agent 事件流规范 |
| file_events_spec.md | 文件事件规范 |
| process-ai-tasks-refactor.md | process-ai-tasks 边缘函数重构方案 |
| realtime_channel_error_retry_spec.md | 实时通道错误重试规范 |
| build-module-refactor-plan.md | Build 模块重构方案 |
| **ui-modernization-plan.md** | **UI 现代化重构规划** - Geist 字体、Shadcn Blocks、视觉优化 |

## legacy/ - 历史文档

开发过程中的分析报告和演进记录，供参考。

| 文件 | 描述 |
|------|------|
| realtime_architecture.md | Realtime 订阅架构 v1 |
| baseline.md | AI Agent 提示词体系基线分析（2025-11-28） |
| eval_report.md | Step 5 自我修复循环评估报告 |
| prompt_eval_notes.md | Prompt 评估对比笔记 |
| realtime_debt.md | Realtime 技术债务盘点 |
| self_repair_notes.md | 自我修复机制笔记 |
