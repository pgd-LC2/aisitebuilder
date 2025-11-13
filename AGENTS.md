# Repository Guidelines

## 项目结构与模块组织
核心源码位于 `src/`：`src/routes` 负责顶层页面，`src/components` 存放可复用 UI，`src/utils` 提供被应用与测试共同复用的纯函数。静态资源与 HTML 外壳放在 `public/`，Supabase 的 SQL 脚本与种子数据位于 `supabase/`。自定义脚本（测试运行器、辅助任务）集中在 `scripts/`，端到端或集成级别的断言位于 `tests/`。Tailwind、PostCSS、Vite 等配置文件位于仓库根目录，便于审计与升级。

## 构建、测试与开发命令
- `npm run dev`：在 `http://localhost:5173` 启动带 HMR 的 Vite 开发服务器。
- `npm run build`：输出优化后的生产包到 `dist/`。
- `npm run preview`：本地预览最新构建，验证生产路由行为。
- `npm run lint`：根据 `eslint.config.js` 检查 `src/`、`tests/` 及配置文件的代码风格。
- `npm run typecheck`：使用 `tsc --noEmit -p tsconfig.app.json` 执行严格类型检查。
- `npm run test`：将 `src/utils` 与 `tests` 编译到 `test-dist/` 后，由 `scripts/run-tests.mjs` 运行自定义断言。

## 代码风格与命名约定
全程使用 TypeScript，启用严格空值检查与 2 空格缩进。React 组件、Context、Hook 采用 PascalCase（如 `SiteHeader.tsx`、`useProjectList.ts`）；工具函数保持 `src/utils/foo.ts` 结构并避免下划线命名。在 JSX 中优先使用 Tailwind 工具类，仅在响应式组合失控时才落回 CSS Modules。每次提交前执行 `npm run lint`，确保导入顺序、未使用变量与 Hook 依赖均被约束。

## 测试规范
重点覆盖 `src/utils` 中的确定性逻辑，测试文件命名为 `<unit>.test.ts` 并在 `tests/` 中按与 `src/utils` 相同的目录结构放置（示例：`tests/titleGenerator.test.ts`）。测试需可复现，Supabase 或网络交互请注入桩或假数据。推送前执行 `npm run test && npm run typecheck`，若新增的工具函数缺少测试则拒绝合并。

## Commit 与 PR 准则
由于当前分发包未包含 `.git`，请沿用 Conventional Commits（`feat:`、`fix:`、`chore:` 等）描述变更。每个 Pull Request 须概述用户可见影响、关联 Issue 或任务，并在 UI 或 CLI 行为改变时附带截图或终端输出。新增环境变量或 Supabase 迁移必须在 PR 描述中记录。

## 安全与配置提示
切勿提交 `.env`，部署时通过环境变量提供 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`。审查 `supabase/` 目录改动时确认权限最小化，并在上传调试日志前清理敏感信息。部署到 Netlify 时保持 `public/_redirects` 不变，以支持 SPA 路由与认证流程。

## 语言与代理说明
本文件要求所有协作者与自动化 Agent 在此仓库上下文中永远使用中文交流；即便收到其他语言的输入，也必须转换为中文回复，以确保沟通一致。
