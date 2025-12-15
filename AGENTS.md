# Repository Guidelines

## 项目结构与模块组织

核心源码位于 `src/`：`src/routes` 负责顶层页面，`src/components` 存放可复用 UI，`src/utils` 提供被应用与测试共同复用的纯函数。静态资源与 HTML 外壳放在 `public/`，Supabase 的 SQL 脚本与种子数据位于 `supabase/`。自定义脚本（测试运行器、辅助任务）集中在 `scripts/`，端到端或集成级别的断言位于 `tests/`。Tailwind、PostCSS、Vite 等配置文件位于仓库根目录，便于审计与升级。

## 构建、测试与开发命令

- `npm run dev`：在 `http://localhost:5000` 启动带 HMR 的 Vite 开发服务器（Replit 环境）。
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

请沿用 Conventional Commits（`feat:`、`fix:`、`chore:` 等）描述变更。每个 Pull Request 须概述用户可见影响、关联 Issue 或任务，并在 UI 或 CLI 行为改变时附带截图或终端输出。新增环境变量或 Supabase 迁移必须在 PR 描述中记录。

## 安全与配置提示

切勿提交 `.env`，部署时通过环境变量提供 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`。审查 `supabase/` 目录改动时确认权限最小化，并在上传调试日志前清理敏感信息。

## Supabase Edge Functions 部署方法（MCP CLI）

当无法使用 `supabase functions deploy` 命令（缺少 SUPABASE_ACCESS_TOKEN）时，可以使用 MCP CLI 直接部署 Edge Functions。

### 部署步骤

1. **准备部署参数**：将 Edge Function 代码读取并构建为 JSON 格式

```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('supabase/functions/YOUR_FUNCTION_NAME/index.ts', 'utf8');
const args = {
  project_id: 'bsiukgyvrfkanuhjkxuh',
  name: 'YOUR_FUNCTION_NAME',
  entrypoint_path: 'index.ts',
  files: [{ name: 'index.ts', content: content }]
};
console.log(JSON.stringify(args));
" > /tmp/deploy-args.json
```

2. **调用 MCP 部署工具**：

```bash
mcp-cli tool call deploy_edge_function --server supabase --input "$(cat /tmp/deploy-args.json)"
```

3. **验证部署结果**：

```bash
mcp-cli tool call list_edge_functions --server supabase --input '{"project_id":"bsiukgyvrfkanuhjkxuh"}'
```

### 参数说明

- `project_id`：Supabase 项目 ID（本项目为 `bsiukgyvrfkanuhjkxuh`）
- `name`：Edge Function 名称（与 `supabase/functions/` 下的目录名一致）
- `entrypoint_path`：入口文件路径（通常为 `index.ts`）
- `files`：文件数组，每个元素包含 `name`（文件名）和 `content`（文件内容）

### 多文件 Edge Function

如果 Edge Function 包含多个文件，需要将所有文件添加到 `files` 数组中：

```javascript
const args = {
  project_id: 'bsiukgyvrfkanuhjkxuh',
  name: 'YOUR_FUNCTION_NAME',
  entrypoint_path: 'index.ts',
  files: [
    { name: 'index.ts', content: fs.readFileSync('supabase/functions/YOUR_FUNCTION_NAME/index.ts', 'utf8') },
    { name: 'utils.ts', content: fs.readFileSync('supabase/functions/YOUR_FUNCTION_NAME/utils.ts', 'utf8') }
  ]
};
```

### 数据库迁移部署

使用 MCP 部署数据库迁移：

```bash
mcp-cli tool call apply_migration --server supabase --input '{
  "project_id": "bsiukgyvrfkanuhjkxuh",
  "name": "YOUR_MIGRATION_NAME",
  "query": "YOUR_SQL_CONTENT"
}'
```

### 注意事项

- MCP CLI 已预配置 Supabase 认证，无需额外提供 access token
- 部署成功后会返回包含 `status: "ACTIVE"` 的响应
- 如果部署失败，检查文件内容是否包含语法错误

## 语言与代理说明

本文件要求所有协作者与自动化 Agent 在此仓库上下文中永远使用中文交流；即便收到其他语言的输入，也必须转换为中文回复，以确保沟通一致。

每一次更新文件结束，进行验证（npm run lint 和 npm run typecheck）并进行修复，直到没有报错为止。
