# 服务层开发规范

`src/services/` 下的所有服务必须遵循一致的模式。

## 返回格式

所有操作必须返回 `{ data, error }` 格式。

## 单记录操作

使用 `.select().maybeSingle()` 进行单记录操作。

## 错误处理

保持一致的错误处理方式。

## 参考示例

- CRUD 操作模式：参考 `messageService.ts`
- 订阅模式：参考 `buildLogService.ts`

## 用户认证

- 从 `AuthContext` 获取 `user.id`
- 使用 `src/lib/supabase.ts` 中的 Supabase 客户端
- 仅使用 anon key（前端不使用 service role key）

## 安全敏感操作

对于涉及用户隐私或安全的操作（如通过用户名查找邮箱），**绝对不能在前端执行**。这类操作必须：
- 放在数据库层（使用 `SECURITY DEFINER` 函数）或 Edge Function 中处理
- 前端只传递必要参数，不暴露敏感数据的查询逻辑
- 例如：用户名登录应通过 Edge Function 或数据库函数完成邮箱查找和验证，前端不应能直接查询用户邮箱
