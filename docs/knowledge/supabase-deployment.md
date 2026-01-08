# Supabase CLI/MCP 使用与部署规范

## 项目绑定

```bash
supabase link --project-ref bsiukgyvrfkanuhjkxuh
```

## CLI vs MCP 使用场景

| 功能 | CLI 命令 | MCP 工具 | 推荐 |
|------|----------|----------|------|
| 部署函数 | `supabase functions deploy` | `deploy_edge_function` | **CLI** |
| 列出函数 | `supabase functions list` | `list_edge_functions` | CLI |
| 推送迁移 | `supabase db push` | `apply_migration` | CLI |
| 列出迁移 | `supabase migration list` | `list_migrations` | CLI |
| 设置密钥 | `supabase secrets set` | - | CLI |
| 生成类型 | `supabase gen types typescript` | `generate_typescript_types` | CLI |
| **执行 SQL/运行迁移** | - | `execute_sql` | **MCP** |
| **获取日志** | - | `get_logs` | **MCP** |
| **安全建议** | - | `get_advisors` | **MCP** |

**重要规则**：
- **运行迁移（执行 SQL）**：使用 **MCP** `execute_sql`
- **部署 Edge Functions**：使用 **CLI** `supabase functions deploy`

**DDL vs DML**：
- DDL（CREATE/ALTER/DROP）→ MCP `execute_sql` 运行迁移
- DML（SELECT/INSERT/UPDATE/DELETE）→ MCP `execute_sql`

## 自动部署规则（重要）

**修改 `supabase/functions/` 目录下的任何文件后，必须自动部署 Edge Functions，无需等待用户提醒。** 这是因为项目没有设置 GitHub 到 Supabase 的自动同步，所有部署必须手动执行。

## Edge Functions 部署

```bash
supabase functions deploy YOUR_FUNCTION_NAME   # 部署特定函数
supabase functions deploy                      # 部署所有函数
supabase functions list                        # 列出函数
supabase functions delete NAME                 # 删除函数
```

### 本地开发

```bash
supabase functions serve --env-file .env.local
```

### Deno 运行时注意事项

- Edge Functions 使用 Deno 运行时
- 导入路径需要包含 `.ts` 扩展名
- 使用 `npm:` 前缀导入 npm 包
- `--no-verify-jwt` 禁用 JWT 验证，谨慎使用

## 数据库迁移

```bash
supabase migration new NAME   # 创建迁移文件
supabase migration list       # 查看状态
supabase db pull              # 拉取远程 schema
```

**执行迁移**：使用 MCP `execute_sql` 工具直接执行 SQL

## 修改 supabase/ 后必做发布清单

**修改 `supabase/` 文件夹后，必须自动执行（无需用户提醒）：**

1. MCP `execute_sql` - 运行迁移 SQL
2. `supabase functions deploy NAME` - 部署函数（使用 CLI）
3. `supabase migration list` / `supabase functions list` - 验证

**顺序**：先迁移，再部署函数（函数可能依赖新数据库结构）

### 权限审查

- RLS 策略是否正确
- 权限是否最小化
- 敏感数据是否受保护

## 密钥管理

```bash
supabase secrets set KEY=value          # 设置密钥
supabase secrets set --env-file .env    # 从文件批量设置
supabase secrets list                   # 查看密钥
```

## 类型生成

```bash
supabase gen types typescript --linked > src/types/database.ts
```
