# Repository Guidelines

## 项目结构与模块组织

核心源码位于 `src/`，采用模块化组织：

- `src/components/` - UI 组件（按功能分类）
  - `ui/` - Shadcn UI 基础组件（Button、Card、Dialog 等）
  - `pages/` - 页面级组件（HomePage、LoginPage、ProjectsPage 等）
  - `chat/` - 聊天相关组件（ChatPanel、ChatInput、BuildLogPanel 等）
  - `editor/` - 编辑器组件（PreviewPanel、FileManagerPanel、CodeViewer 等）
  - `project/` - 项目相关组件（ProjectCard）
  - `user/` - 用户相关组件（UserProfilePanel）
  - `common/` - 通用组件（StatusIndicator、FileUploader）
  - `visual/` - 视觉效果组件（FloatingBackground、ParticleField 等）
- `src/contexts/` - React Context（WorkflowContext、RealtimeContext 等）
- `src/hooks/` - 自定义 Hooks
- `src/services/` - 服务层（aiTaskService、projectService 等）
- `src/realtime/` - 实时通信层（realtimeClient、订阅函数、Hooks）
- `src/lib/` - 工具库（supabase 客户端、webContainerManager）
- `src/types/` - TypeScript 类型定义
- `src/utils/` - 纯函数工具

后端位于 `supabase/`：`supabase/functions/` 存放 Edge Functions（Deno 运行时），`supabase/migrations/` 存放数据库迁移脚本。

静态资源与 HTML 外壳放在 `public/`，自定义脚本集中在 `scripts/`，测试文件位于 `tests/`。Tailwind、PostCSS、Vite 等配置文件位于仓库根目录。

## 构建、测试与开发命令

- `npm run dev`：在 `http://localhost:5173` 启动带 HMR 的 Vite 开发服务器。
- `npm run build`：输出优化后的生产包到 `dist/`。
- `npm run preview`：本地预览最新构建，验证生产路由行为。
- `npm run lint`：根据 `eslint.config.js` 检查 `src/`、`tests/` 及配置文件的代码风格。
- `npm run typecheck`：使用 `tsc --noEmit -p tsconfig.app.json` 执行严格类型检查。
- `npm run test`：使用 Vitest 运行单元测试（BDD 风格，AAA 模式）。

## 代码风格与命名约定

全程使用 TypeScript，启用严格空值检查与 2 空格缩进。React 组件、Context、Hook 采用 PascalCase（如 `SiteHeader.tsx`、`useProjectList.ts`）；工具函数保持 `src/utils/foo.ts` 结构并避免下划线命名。在 JSX 中优先使用 Tailwind 工具类，仅在响应式组合失控时才落回 CSS Modules。每次提交前执行 `npm run lint`，确保导入顺序、未使用变量与 Hook 依赖均被约束。

## 测试规范

重点覆盖 `src/utils` 中的确定性逻辑，测试文件命名为 `<unit>.test.ts` 并在 `tests/` 中按与 `src/utils` 相同的目录结构放置（示例：`tests/titleGenerator.test.ts`）。测试需可复现，Supabase 或网络交互请注入桩或假数据。推送前执行 `npm run test && npm run typecheck`，若新增的工具函数缺少测试则拒绝合并。

## Commit 与 PR 准则

请沿用 Conventional Commits（`feat:`、`fix:`、`chore:` 等）描述变更。每个 Pull Request 须概述用户可见影响、关联 Issue 或任务，并在 UI 或 CLI 行为改变时附带截图或终端输出。新增环境变量或 Supabase 迁移必须在 PR 描述中记录。

## 安全与配置提示

切勿提交 `.env`，部署时通过环境变量提供 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`。审查 `supabase/` 目录改动时确认权限最小化，并在上传调试日志前清理敏感信息。

## Supabase 部署方法

项目 ID：`bsiukgyvrfkanuhjkxuh`

首次使用需链接项目：`supabase link --project-ref bsiukgyvrfkanuhjkxuh`

**重要规则**：修改 `supabase/` 目录下的任何文件后，必须自动执行部署操作，无需等待用户提醒。GitHub 没有设置自动同步，因此必须手动部署。

### 修改后端文件后的必做清单

修改 `supabase/` 文件夹后，必须按以下顺序执行：

1. **运行迁移 SQL**：使用 MCP `execute_sql` 工具执行新的迁移文件
2. **部署 Edge Functions**：使用 `supabase functions deploy` 部署修改的函数
3. **验证部署**：使用 `supabase functions list` 确认部署成功

### Edge Functions

```bash
supabase functions deploy YOUR_FUNCTION_NAME   # 部署特定函数
supabase functions deploy                      # 部署所有函数
supabase functions list                        # 列出函数
```

### 数据库迁移

```bash
supabase migration new NAME   # 创建迁移
supabase db push              # 推送迁移
supabase migration list       # 查看状态
```

### 密钥管理

```bash
supabase secrets set KEY=value          # 设置密钥
supabase secrets set --env-file .env    # 从文件批量设置
supabase secrets list                   # 查看密钥
```

### MCP 工具（CLI 不支持的功能）

| MCP 工具         | 用途                 |
| ---------------- | -------------------- |
| `execute_sql`  | 执行 SQL 查询（DML） |
| `get_logs`     | 获取日志             |
| `get_advisors` | 安全/性能建议        |

## 语言与代理说明

本文件要求所有协作者与自动化 Agent 在此仓库上下文中永远使用中文交流；即便收到其他语言的输入，也必须转换为中文回复，以确保沟通一致。

每一次更新文件结束，进行验证（npm run lint 和 npm run typecheck）并进行修复，直到没有报错为止。

在完成任务之后 给用户提交一个github comment的提交短句(如faet: ......)
