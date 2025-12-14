# AI Site Builder

一个使用 React、TypeScript、Tailwind CSS 和 Supabase 搭建的 AI 驱动建站工作台。用户可以通过自然语言对话创建网站，实时预览生成的代码，并在浏览器中管理文件。

## 项目结构

```
aisitebuilder/
├── src/                              # 前端 React 应用
│   ├── components/                   # UI 组件（按功能分类）
│   │   ├── index.ts                  # 统一导出入口
│   │   │
│   │   ├── pages/                    # 页面级组件
│   │   │   ├── index.ts              # 页面组件导出
│   │   │   ├── HomePage.tsx          # 首页
│   │   │   ├── LoginPage.tsx         # 登录页面
│   │   │   ├── SignUpPage.tsx        # 注册页面
│   │   │   ├── ProjectsPage.tsx      # 项目列表页
│   │   │   ├── InitializingPage.tsx  # 初始化页面
│   │   │   └── IntroPage.tsx         # 介绍页面
│   │   │
│   │   ├── chat/                     # 聊天相关组件
│   │   │   ├── index.ts              # 聊天组件导出
│   │   │   ├── ChatPanel.tsx         # AI 对话面板
│   │   │   ├── ChatInput.tsx         # 聊天输入组件
│   │   │   ├── BuildLogPanel.tsx     # 构建日志面板
│   │   │   ├── ActivityTimeline.tsx  # AI Agent 活动时间线
│   │   │   ├── ImplementationTrigger.tsx # 实现触发器
│   │   │   └── QuickCommands.tsx     # 快捷命令
│   │   │
│   │   ├── editor/                   # 编辑器相关组件
│   │   │   ├── index.ts              # 编辑器组件导出
│   │   │   ├── PreviewPanel.tsx      # WebContainer 实时预览
│   │   │   ├── FileManagerPanel.tsx  # 文件管理面板
│   │   │   ├── CodeViewer.tsx        # 代码查看器
│   │   │   ├── FilePreview.tsx       # 文件预览组件
│   │   │   └── VersionManager.tsx    # 版本管理器
│   │   │
│   │   ├── project/                  # 项目相关组件
│   │   │   ├── index.ts              # 项目组件导出
│   │   │   └── ProjectCard.tsx       # 项目卡片
│   │   │
│   │   ├── user/                     # 用户相关组件
│   │   │   ├── index.ts              # 用户组件导出
│   │   │   └── UserProfilePanel.tsx  # 用户设置面板
│   │   │
│   │   ├── common/                   # 通用组件
│   │   │   ├── index.ts              # 通用组件导出
│   │   │   ├── StatusIndicator.tsx   # 状态指示器
│   │   │   └── FileUploader.tsx      # 文件上传组件
│   │   │
│   │   └── visual/                   # 视觉效果组件
│   │       ├── index.ts              # 视觉组件导出
│   │       ├── FloatingBackground.tsx # 漂浮背景
│   │       ├── floatingBackgroundPresets.ts # 背景预设
│   │       ├── ParticleField.tsx     # 粒子动画背景
│   │       └── FireBurnOverlay.tsx   # 火焰燃烧效果
│   │
│   ├── contexts/                     # React Context 状态管理
│   │   ├── AuthContext.tsx           # 认证状态与会话管理
│   │   ├── ProjectContext.tsx        # 当前项目状态
│   │   ├── RealtimeContext.tsx       # 实时订阅上下文
│   │   ├── SettingsContext.tsx       # 用户偏好设置
│   │   └── WorkflowContext.tsx       # 工作流模式管理
│   │
│   ├── services/                     # 后端 API 服务封装
│   │   ├── aiTaskService.ts          # AI 任务 CRUD 与触发
│   │   ├── buildLogService.ts        # 构建日志 CRUD
│   │   ├── fileService.ts            # 文件操作服务
│   │   ├── imageProxyService.ts      # 图片安全代理服务
│   │   ├── messageService.ts         # 聊天消息 CRUD
│   │   ├── projectService.ts         # 项目 CRUD
│   │   ├── promptService.ts          # AI Prompt 获取
│   │   ├── templateService.ts        # 项目模板初始化
│   │   └── versionService.ts         # 版本管理服务
│   │
│   ├── realtime/                     # 实时通信层
│   │   ├── realtimeClient.ts         # Supabase Realtime 单例管理器
│   │   ├── subscribeAgentEvents.ts   # Agent 事件订阅
│   │   ├── subscribeBuildLogs.ts     # 构建日志订阅
│   │   ├── subscribeFileEvents.ts    # 文件事件订阅
│   │   ├── types.ts                  # 实时类型定义
│   │   ├── index.ts                  # 统一导出
│   │   └── hooks/                    # 实时订阅 Hooks
│   │       ├── useAgentEvents.ts     # AI 任务与消息订阅
│   │       ├── useBuildLogs.ts       # 构建日志订阅
│   │       ├── useFileEvents.ts      # 文件事件订阅
│   │       ├── useRealtimeResource.ts # 通用实时资源 Hook
│   │       └── useTimelineEvents.ts  # 时间线事件订阅
│   │
│   ├── lib/                          # 工具库
│   │   ├── supabase.ts               # Supabase 客户端初始化
│   │   ├── webContainerManager.ts    # WebContainer 生命周期管理
│   │   └── nodeModulesCache.ts       # IndexedDB 依赖缓存
│   │
│   ├── types/                        # TypeScript 类型定义
│   │   └── project.ts                # 核心数据模型
│   │
│   ├── utils/                        # 通用工具函数
│   │   ├── titleGenerator.ts         # 标题生成器
│   │   └── huarongdaoAnimation.ts    # 华容道动画
│   │
│   ├── App.tsx                       # 应用入口与路由
│   ├── main.tsx                      # React 挂载点
│   ├── index.css                     # 全局样式
│   └── vite-env.d.ts                 # Vite 类型声明
│
├── supabase/                         # Supabase 后端
│   ├── functions/                    # Edge Functions（Deno 运行时）
│   │   ├── _shared/                  # 共享模块
│   │   │   └── ai/                   # AI 模块化架构
│   │   │       ├── index.ts          # 统一导出入口
│   │   │       ├── config.ts         # 配置常量
│   │   │       ├── types.ts          # 类型定义
│   │   │       ├── prompts/          # Prompt Router
│   │   │       │   └── router.ts     # 五层 Prompt 路由
│   │   │       ├── llm/              # LLM 客户端
│   │   │       │   ├── client.ts     # OpenRouter API 调用
│   │   │       │   └── imageGenerator.ts # 图片生成
│   │   │       ├── tools/            # 工具定义与执行
│   │   │       │   ├── definitions.ts # 工具定义与能力矩阵
│   │   │       │   ├── executor.ts   # 工具执行器
│   │   │       │   └── fileOperations.ts # 文件操作实现
│   │   │       ├── selfRepair/       # 自修复系统
│   │   │       │   ├── debugger.ts   # 错误诊断
│   │   │       │   └── loop.ts       # 修复循环
│   │   │       ├── subagent/         # 子代理系统
│   │   │       │   ├── index.ts      # 统一导出
│   │   │       │   ├── types.ts      # 类型定义
│   │   │       │   ├── registry.ts   # 注册表
│   │   │       │   ├── executor.ts   # 执行器
│   │   │       │   └── handlers/     # 具体 handler
│   │   │       │       └── refactorCode.ts
│   │   │       └── logging/          # 日志模块
│   │   │           ├── buildLog.ts   # 构建日志
│   │   │           └── agentEvents.ts # Agent 事件日志
│   │   │
│   │   ├── process-ai-tasks/         # AI 任务处理（核心）
│   │   │   ├── index.ts              # 主任务处理逻辑
│   │   │   └── README.md             # 函数文档
│   │   ├── initialize-project/       # 项目初始化
│   │   ├── create-version/           # 版本创建
│   │   ├── copy-version-files/       # 版本文件复制
│   │   └── proxy-image/              # 图片安全代理
│   │
│   └── migrations/                   # 数据库迁移脚本
│       ├── 20251104030837_create_projects_system.sql
│       ├── 20251104095455_enable_build_logs_realtime.sql
│       ├── 20251104095941_create_chat_messages_table.sql
│       ├── 20251104140147_enable_full_replica_identity.sql
│       ├── 20251105094212_add_file_storage_system.sql
│       ├── 20251105094239_configure_storage_bucket_policies.sql
│       ├── 20251106083456_fix_version_file_stats.sql
│       ├── 20251115153000_create_ai_tasks.sql
│       ├── 20251116110000_add_attempts_to_ai_tasks.sql
│       ├── 20251120114600_fix_database_performance_issues.sql
│       ├── 20251120120000_fix_rls_performance_issues_v2.sql
│       ├── 20251128095500_create_prompts_table.sql
│       ├── 20251129141744_create_agent_and_file_events.sql
│       └── 20251130132750_insert_five_layer_prompts.sql
│
├── prompts/                          # AI Prompt 模板（多版本）
│   ├── v1/                           # 版本 1
│   │   ├── core.system.base.v1.md    # 系统核心
│   │   ├── planner.web.structure.v1.md # 规划层
│   │   ├── coder.web.implement.v1.md # 编码层
│   │   ├── reviewer.quality.check.v1.md # 审查层
│   │   ├── debugger.error.diagnosis.v1.md # 调试层
│   │   ├── workflow.default.v1.md    # 默认工作流
│   │   ├── workflow.planning.v1.md   # 规划工作流
│   │   ├── workflow.build.v1.md      # 构建工作流
│   │   └── README.md
│   ├── v2/                           # 版本 2（同结构）
│   │   └── ...
│   └── v3/                           # 版本 3
│       ├── chat.assistant.readonly.v3.md # 只读聊天助手
│       └── README.md
│
├── docs/                             # 技术文档
│   ├── README.md                     # 文档索引
│   ├── testing-guide.md              # 测试指南
│   ├── auto-test-generator.md        # 自动测试生成器文档
│   ├── specs/                        # 技术规范（当前使用）
│   │   ├── task-workflow-architecture.md # 任务与工作流架构
│   │   ├── prompt_spec.md            # Prompt 系统规范
│   │   ├── process-ai-tasks-refactor.md # AI 任务处理重构方案
│   │   ├── realtime_architecture.md  # 实时架构 v1
│   │   ├── realtime_architecture_v2.md # 实时架构 v2
│   │   ├── agent_events_spec.md      # Agent 事件规范
│   │   └── file_events_spec.md       # 文件事件规范
│   └── legacy/                       # 历史文档（供参考）
│       ├── baseline.md
│       ├── eval_report.md
│       ├── prompt_eval_notes.md
│       ├── realtime_debt.md
│       └── self_repair_notes.md
│
├── tools/                            # 开发工具集
│   ├── README.md                     # 工具使用说明
│   ├── deploy-edge-function.cjs      # 一键部署 Edge Function
│   ├── generate-edge-function-mcp.cjs # 生成 MCP JSON
│   └── perplexity-search.py          # Perplexity 搜索工具
│
├── scripts/                          # 构建与测试脚本
│   └── generate-tests.ts             # 自动测试生成器
│
├── tests/                            # 单元测试
│   ├── setup.ts                      # 测试配置
│   ├── generator.config.json         # 测试生成器配置
│   ├── .generated-tests-meta.json    # 生成测试元数据
│   ├── utils/                        # 工具函数测试
│   │   └── titleGenerator.test.ts
│   └── generated/                    # 自动生成的测试
│       ├── App.test.tsx
│       ├── components/
│       ├── contexts/
│       ├── lib/
│       ├── realtime/
│       ├── services/
│       ├── types/
│       └── utils/
│
├── public/                           # 静态资源
│   ├── favicon.svg                   # 网站图标
│   ├── manifest.json                 # PWA 配置
│   ├── icons/                        # 应用图标
│   ├── _headers                      # Netlify 响应头配置
│   └── _redirects                    # Netlify 重定向配置
│
├── index.html                        # HTML 入口
├── package.json                      # npm 依赖与脚本
├── vite.config.ts                    # Vite 构建配置
├── vitest.config.ts                  # Vitest 测试配置
├── tailwind.config.js                # Tailwind CSS 配置
├── postcss.config.js                 # PostCSS 配置
├── eslint.config.js                  # ESLint 配置
├── tsconfig.json                     # TypeScript 基础配置
├── tsconfig.app.json                 # 应用 TypeScript 配置
├── tsconfig.node.json                # Node 环境 TypeScript 配置
├── tsconfig.test.json                # 测试 TypeScript 配置
├── AGENTS.md                         # 仓库开发规范
└── LICENSE                           # 开源许可证
```

## 技术栈

### 前端
- **框架**: React 18 + TypeScript
- **构建工具**: Vite
- **样式**: Tailwind CSS
- **状态管理**: React Context（AuthContext、ProjectContext、WorkflowContext 等）
- **实时通信**: Supabase Realtime（通过 RealtimeClient 单例管理）
- **浏览器内预览**: WebContainer API（支持 IndexedDB 依赖缓存）

### 后端
- **平台**: Supabase
- **数据库**: PostgreSQL（含 RLS 行级安全策略）
- **认证**: Supabase Auth
- **存储**: Supabase Storage（项目文件与生成图片）
- **实时订阅**: Supabase Realtime（postgres_changes）
- **无服务器函数**: Supabase Edge Functions（Deno 运行时）

### AI 能力
- **API 网关**: OpenRouter API
- **文本模型**: google/gemini-3-pro-preview
- **图片生成**: google/gemini-3-pro-image-preview
- **Prompt 架构**: 五层架构（Core → Planner → Coder → Reviewer → Debugger）
- **工具能力矩阵**: 基于任务类型和工作流模式的动态权限控制

## 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 预览构建产物 |
| `npm run lint` | 运行 ESLint |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run test` | 运行单元测试 |

## 核心系统

### AI 任务编排

系统通过 `ai_tasks` 表管理 AI 任务队列。前端组件（ChatPanel、VersionManager 等）将任务写入队列，`process-ai-tasks` Edge Function 负责处理任务、调用 LLM、执行文件操作，并将结果写回 `chat_messages` 表。

**任务类型**：
- `chat_reply` - 聊天回复（默认只读权限）
- `build_site` - 构建站点（完整工具权限）
- `refactor_code` - 代码重构（完整工具权限）

**工作流模式**：
- `default` - 默认模式
- `planning` - 规划模式（分析与设计）
- `build` - 构建模式（实现与修改）

### 五层 Prompt 架构

系统采用模块化的 Prompt 架构，根据任务类型动态组装：

| 层级 | 职责 | 触发条件 |
|------|------|----------|
| Core | 系统核心行为与约束 | 始终加载 |
| Planner | 项目结构规划 | 新项目或 build_site |
| Coder | 代码实现 | 需要写入文件时 |
| Reviewer | 质量检查 | 代码生成后 |
| Debugger | 错误诊断与修复 | 检测到错误时自动插入 |

### 自修复系统

AI Agent 具备自我修复能力，当检测到可修复错误时，会自动进入修复循环（最多 3 次尝试）。修复历史记录在 `agent_events` 表中，便于追踪和调试。

### 实时通信架构

所有实时功能通过 `src/realtime/` 目录统一管理，采用"先获取快照，再订阅增量"的数据加载模式。`RealtimeClient` 单例负责管理所有 Supabase Realtime 通道，防止通道泄漏和竞态条件。

详细的技术规范请参阅 `docs/specs/` 目录下的相关文档。

## 部署

默认包含 `public/_redirects`，可直接部署到 Netlify。部署前需配置环境变量：`VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。

### Edge Function 部署

使用 `tools` 目录下的工具可以一键部署 Edge Function 到 Supabase：

```bash
# 一键部署 process-ai-tasks
node tools/deploy-edge-function.cjs process-ai-tasks

# 仅生成 MCP JSON（不执行部署）
node tools/generate-edge-function-mcp.cjs process-ai-tasks

# 查看帮助和可用函数列表
node tools/deploy-edge-function.cjs --help
```

详细说明请参阅 [tools/README.md](tools/README.md)。

## 贡献指南

贡献代码或文档前，请先阅读 `AGENTS.md` 中的《Repository Guidelines》。所有协作者需使用中文沟通，并在提交前运行 lint 和 typecheck。

## 新人必读

如果你是新加入的工程师，请务必阅读以下文档以快速了解系统架构：

1. **[任务与工作流架构](docs/specs/task-workflow-architecture.md)**：详细说明任务类型（Task Type）和工作流模式（Workflow Mode）的设计，这是理解系统核心概念的关键文档。

2. **[Prompt 系统规范](docs/specs/prompt_spec.md)**：五层 Prompt 架构的详细说明。

3. **[process-ai-tasks 重构方案](docs/specs/process-ai-tasks-refactor.md)**：AI 任务处理 Edge Function 的设计文档。

更多技术文档请查看 [docs/README.md](docs/README.md)。
