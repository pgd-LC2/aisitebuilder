# AI Site Builder

一个使用 React、TypeScript、Tailwind CSS 和 Supabase 搭建的 AI 驱动建站工作台。用户可以登录、创建项目、查看版本历史并在浏览器中管理文件。

## 可用脚本

| 命令                  | 说明                                 |
| --------------------- | ------------------------------------ |
| `npm run dev`       | 启动开发服务器                       |
| `npm run build`     | 产出生产环境构建结果                 |
| `npm run preview`   | 本地预览打包产物                     |
| `npm run lint`      | 运行 ESLint 保持代码风格一致         |
| `npm run typecheck` | 使用 TypeScript 进行静态类型检查     |
| `npm run test`      | 编译并执行自定义 TypeScript 单元测试 |

> `npm run test` 会先根据 `tsconfig.test.json` 将 `src/utils` 与 `tests` 目录编译到 `test-dist/`，然后运行 `tests/titleGenerator.test.ts` 中的断言，最后自动清理临时目录。

## 技术栈

- React 18 + Vite
- TypeScript
- Tailwind CSS
- Lucide 图标集
- Supabase（认证、数据库、对象存储、Realtime、Edge Functions）

## AI 任务编排

- ChatPanel、VersionManager、FileManager 等前端功能会把"聊天回复""构建/重构请求"等长任务写入 Supabase 的 `ai_tasks` 表，由 Edge Function 或 Worker 根据 `type`、`payload` 协调模型调用或代码生成，再把执行结果写回 `result`/`status`。
- `ai_tasks` 持久化 `project_id`、`user_id`、`payload`、`model`、`status` 和时间戳，并开启 RLS，保障只有任务所属用户能读写数据，可与 `build_logs`、`project_versions` 一起让前端订阅进度并在任务完成后生成快照。

### Edge Functions 架构

当前 `process-ai-tasks` 边缘函数承担了 AI 任务处理的核心逻辑，包括 Prompt 路由、LLM 调用、文件操作和自我修复循环。详细的重构方案请参阅 `docs/specs/process-ai-tasks-refactor.md`。

## 部署提示

- 默认包含 `public/_redirects`，可直接部署到 Netlify 以支持 SPA 路由。
- 部署前请配置 Supabase 的 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY` 环境变量。

## 贡献指南

贡献代码或文档前，请先阅读 `AGENTS.md` 中的《Repository Guidelines》，其中包含目录结构、脚本说明、编码规范与安全要求。根据文件指引，所有协作者需使用中文沟通，并在提交前运行必要的检查。
