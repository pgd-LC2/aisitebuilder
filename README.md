# AI Site Builder

一个使用 React、TypeScript、Tailwind CSS 与 Supabase 构建的 AI 驱动建站工作台。用户可以登录、创建项目、查看版本历史并在浏览器中管理文件。

## 可用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 产出生产环境构建结果 |
| `npm run preview` | 本地预览打包产物 |
| `npm run lint` | 运行 ESLint 保持代码风格一致 |
| `npm run typecheck` | 使用 TypeScript 进行静态类型检查 |
| `npm run test` | 编译并执行自定义的 TypeScript 单元测试 |

> `npm run test` 会先根据 `tsconfig.test.json` 将 `src/utils` 与 `tests` 目录中的文件编译到 `test-dist`，然后运行 `tests/titleGenerator.test.ts` 中的断言，最后自动清理临时目录。

## 技术栈

- React 18 + Vite
- TypeScript
- Tailwind CSS
- Lucide 图标库
- Supabase（认证、数据库与对象存储）

## 部署提示

- 项目默认包含 `public/_redirects`，可直接部署到 Netlify 以支持基于路由的 SPA。
- 在部署前请配置 Supabase 的 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY` 环境变量。

## 贡献指南

贡献代码或文档前，请先阅读 `AGENTS.md` 中的《Repository Guidelines》，其中包含目录结构、脚本说明、编码规范与安全要求。根据文件指引，所有协作者需使用中文沟通并在提交前运行必要的检查。
