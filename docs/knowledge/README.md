# 知识库文档

本目录包含从 Devin 知识库中提取的与 aisitebuilder 项目直接相关的知识文档。这些文档涵盖了项目的开发规范、架构设计、调试指南等重要信息。

## 文档索引

### 必读规范

| 文件 | 描述 |
|------|------|
| **development-standards.md** | **开发规范** - 项目结构、代码风格、开发流程 |
| **service-layer-standards.md** | **服务层开发规范** - `src/services/` 下服务的开发模式 |
| **realtime-architecture-constraints.md** | **实时功能架构约束** - Step1 Realtime 架构的严格约束 |

### 架构设计

| 文件 | 描述 |
|------|------|
| **ai-prompt-system.md** | **AI Prompt 系统架构** - v3 统一交互模式架构 |
| **ai-response-dataflow.md** | **AI 响应存储与数据流** - 数据流规范和前端处理要求 |
| **edge-function-architecture.md** | **Edge Function 模块化架构** - `_shared/ai/` 目录结构和模块规范 |
| **tool-capability-matrix.md** | **工具能力矩阵与权限控制** - AI Agent 工具调用权限控制 |
| **singleton-statemachine-patterns.md** | **单例模式与状态机模式** - 核心组件的设计模式 |
| **react-state-management.md** | **React 状态管理模式** - useReducer、useRef、Context 模式 |

### 调试指南

| 文件 | 描述 |
|------|------|
| **prompt-loading-debug.md** | **Prompt 加载调试指南** - AI Agent Prompt 加载问题排查 |
| **realtime-subscription-debug.md** | **实时订阅问题排查指南** - 订阅状态循环和认证竞态条件 |

### 外部服务

| 文件 | 描述 |
|------|------|
| **supabase-deployment.md** | **Supabase CLI/MCP 使用与部署规范** - 部署流程和工具使用 |
| **openrouter-api.md** | **OpenRouter API 与 AI 模型配置** - API 配置和模型选择 |
| **supabase-storage-images.md** | **Supabase Storage 图片优化** - 图片转换和优化功能 |

## 使用说明

在 aisitebuilder 项目中工作时，**必须先访问 `docs` 文件夹查看相关文档内容**，以确保遵循项目规范和最佳实践。

## 与 AGENTS.md 的关系

本目录中的文档是对 `AGENTS.md` 的补充和扩展。`AGENTS.md` 包含仓库的基本开发规范，而本目录提供更详细的架构设计、调试指南和外部服务集成说明。
