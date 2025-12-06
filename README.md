# AI Site Builder

一个使用 React、TypeScript、Tailwind CSS 和 Supabase 搭建的 AI 驱动建站工作台。用户可以通过自然语言对话创建网站，实时预览生成的代码，并在浏览器中管理文件。

## 项目结构

```
aisitebuilder/
├── src/                    # 前端 React 应用
│   ├── components/         # UI 组件（ChatPanel、PreviewPanel、FileManager 等）
│   ├── contexts/           # React Context（Auth、Project、Settings）
│   ├── services/           # 后端 API 服务封装
│   ├── lib/                # 工具库（Supabase 客户端、WebContainer 管理）
│   ├── types/              # TypeScript 类型定义
│   ├── realtime/           # Realtime 订阅相关
│   ├── utils/              # 通用工具函数
│   └── App.tsx             # 应用入口
│
├── supabase/               # Supabase 后端
│   ├── functions/          # Edge Functions（Deno 运行时）
│   │   ├── process-ai-tasks/   # AI 任务处理（核心）
│   │   ├── proxy-image/        # 图片安全代理
│   │   ├── initialize-project/ # 项目初始化
│   │   ├── create-version/     # 版本创建
│   │   └── copy-version-files/ # 版本文件复制
│   └── migrations/         # 数据库迁移脚本
│
├── prompts/                # AI Prompt 模板（五层架构）
│   ├── core.system.base.v1.md      # 系统核心
│   ├── planner.web.structure.v1.md # 规划层
│   ├── coder.web.implement.v1.md   # 编码层
│   ├── reviewer.quality.check.v1.md # 审查层
│   └── debugger.error.diagnosis.v1.md # 调试层
│
├── docs/                   # 技术文档
│   ├── specs/              # 技术规范（当前使用）
│   └── legacy/             # 历史文档（供参考）
│
├── deploy-tools/           # 部署工具集
│   ├── deploy-edge-function.cjs    # 一键部署 Edge Function
│   └── generate-edge-function-mcp.cjs # 生成 MCP JSON
│
├── public/                 # 静态资源
├── scripts/                # 构建脚本
└── tests/                  # 单元测试
```

## 技术栈

前端使用 React 18 + Vite + TypeScript + Tailwind CSS，后端使用 Supabase（认证、PostgreSQL 数据库、对象存储、Realtime、Edge Functions），AI 能力通过 OpenRouter API 接入。

## 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 预览构建产物 |
| `npm run lint` | 运行 ESLint |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run test` | 运行单元测试 |

## AI 任务编排

系统通过 `ai_tasks` 表管理 AI 任务队列。前端组件（ChatPanel、VersionManager 等）将任务写入队列，`process-ai-tasks` Edge Function 负责处理任务、调用 LLM、执行文件操作，并将结果写回 `chat_messages` 表。

核心特性包括五层 Prompt 架构（Core → Planner → Coder → Reviewer → Debugger）、自我修复循环（最多 3 次自动错误修复）、以及基于 WebContainer 的浏览器内实时预览。

详细的重构方案请参阅 `docs/specs/process-ai-tasks-refactor.md`。

## 部署

默认包含 `public/_redirects`，可直接部署到 Netlify。部署前需配置环境变量：`VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。

### Edge Function 部署

使用 `deploy-tools` 目录下的工具可以一键部署 Edge Function 到 Supabase：

```bash
# 一键部署 process-ai-tasks
node deploy-tools/deploy-edge-function.cjs process-ai-tasks

# 仅生成 MCP JSON（不执行部署）
node deploy-tools/generate-edge-function-mcp.cjs process-ai-tasks

# 查看帮助和可用函数列表
node deploy-tools/deploy-edge-function.cjs --help
```

详细说明请参阅 [deploy-tools/README.md](deploy-tools/README.md)。

## 贡献指南

贡献代码或文档前，请先阅读 `AGENTS.md` 中的《Repository Guidelines》。所有协作者需使用中文沟通，并在提交前运行 lint 和 typecheck。

## 新人必读

如果你是新加入的工程师，请务必阅读以下文档以快速了解系统架构：

1. **[任务与工作流架构](docs/specs/task-workflow-architecture.md)**：详细说明任务类型（Task Type）和工作流模式（Workflow Mode）的设计，这是理解系统核心概念的关键文档。

2. **[Prompt 系统规范](docs/specs/prompt_spec.md)**：五层 Prompt 架构的详细说明。

3. **[process-ai-tasks 重构方案](docs/specs/process-ai-tasks-refactor.md)**：AI 任务处理 Edge Function 的设计文档。

更多技术文档请查看 [docs/README.md](docs/README.md)。
