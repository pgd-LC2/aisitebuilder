# 项目开发规范

> **注意**：本规范与仓库中的 `AGENTS.md` 保持一致。如有冲突，以 `AGENTS.md` 为准。

## 项目结构

| 目录 | 用途 |
|------|------|
| `src/routes/` | 顶层页面 |
| `src/components/` | 可复用 UI 组件 |
| `src/utils/` | 纯函数工具 |
| `src/services/` | 服务层 |
| `supabase/` | SQL 和 Edge Functions |

## 代码风格

- TypeScript，严格空值检查，2 空格缩进
- React 组件用 PascalCase
- 优先使用 Tailwind 工具类

## 开发流程

1. 先阅读 `AGENTS.md` 和 `README.md`
2. 完成后运行 `npm run lint` 和 `npm run typecheck`
3. 先本地测试，再提交 PR

## Commit 格式

`feat:` / `fix:` / `chore:` / `docs:` / `refactor:` / `test:`

## Supabase 配置

项目 ID：`bsiukgyvrfkanuhjkxuh`

详细的 Supabase CLI/MCP 使用方法，请参阅：[supabase-deployment.md](./supabase-deployment.md)

## 用户代码更新偏好

### 向后兼容原则

**重要**：除非用户明确要求向后兼容，否则在实现新功能时：
- 完全删除旧代码和旧逻辑
- 使用全新的实现方式
- 不保留降级方案或回退逻辑

### Token 限制配置

当调用 LLM API 时：
- 设置较大的 `max_tokens`（如 100000）以防止超标
- 用户的提示词也计入 token 限制，需要预留足够空间

### 输入字数限制

为防止 token 滥用：
- 检查是否存在用户输入字数限制
- 如果没有，需要添加最大字数限制（如 100000 字符）

### AI 生成内容语言偏好

当 AI 生成内容（如项目标题）时：
- **尽量使用中文**，但可以包含英文
- **不要做必须中文的强制验证**
- 允许中英文混合的输出
