# Process AI Tasks - Edge Function

这个 Edge Function 用于处理 AI 任务队列，从 `ai_tasks` 表中抢占任务并调用 OpenRouter API 生成响应。

## 功能特性

- **并发安全**: 使用 `SELECT FOR UPDATE SKIP LOCKED` 确保多个 Worker 实例不会重复处理同一任务
- **重试机制**: 失败的任务会自动重试，直到达到最大重试次数
- **错误处理**: 完整的错误日志记录到 `build_logs` 表
- **OpenRouter 集成**: 使用 OpenRouter API (openai/gpt-4o-mini 模型) 生成 AI 响应
- **实时更新**: 通过 Supabase Realtime 自动推送响应到前端

## 请求参数

调用 Edge Function 时应在请求体中传入以下字段：

- `projectId`（必填）：当前项目 ID
- `projectFilesContext`（可选）：当前正在使用的 `project-files` 存储信息，包含版本等上下文  
  示例：
  ```json
  {
    "projectId": "project-uuid",
    "projectFilesContext": {
      "bucket": "project-files",
      "path": "project-uuid/vversion-uuid",
      "versionId": "version-uuid",
      "versionNumber": 3
    }
  }
  ```

## 环境变量配置

在 Supabase Dashboard 的 Edge Functions 设置中配置以下环境变量：

### 必需的环境变量

1. **SUPABASE_URL** - Supabase 项目 URL（自动提供）
2. **SUPABASE_SERVICE_ROLE_KEY** - Service Role Key（自动提供）
3. **SUPABASE_DB_URL** - 数据库连接字符串
   - 格式: `postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres`
   - 在 Supabase Dashboard > Project Settings > Database > Connection String 中获取
   - 选择 "URI" 格式，使用 "Session pooler" 模式

4. **OPENROUTER_KEY** - OpenRouter API 密钥
   - 在 https://openrouter.ai/keys 获取
   - 格式: `sk-...`

### 配置步骤

1. 登录 Supabase Dashboard
2. 进入项目 > Edge Functions > process-ai-tasks
3. 点击 "Settings" 或 "Secrets"
4. 添加以下环境变量：
   - `SUPABASE_DB_URL`: 数据库连接字符串
   - `OPENROUTER_KEY`: OpenRouter API 密钥

## 触发方式

### 方式一：Database Webhook（推荐 - 低延迟）

在 Supabase Dashboard 中配置 Database Webhook：

1. 进入 Database > Webhooks
2. 创建新的 Webhook：
   - **Table**: `ai_tasks`
   - **Events**: `INSERT`
   - **Type**: `HTTP Request`
   - **Method**: `POST`
   - **URL**: `https://[PROJECT_REF].supabase.co/functions/v1/process-ai-tasks`
   - **Headers**: 
     - `Authorization`: `Bearer [SUPABASE_ANON_KEY]`
     - `Content-Type`: `application/json`

### 方式二：Scheduled Function（定期轮询）

使用 pg_cron 定期调用 Edge Function：

```sql
-- 每 5 秒执行一次
SELECT cron.schedule(
  'process-ai-tasks',
  '*/5 * * * * *',
  $$
  SELECT net.http_post(
    url := 'https://[PROJECT_REF].supabase.co/functions/v1/process-ai-tasks',
    headers := '{"Authorization": "Bearer [SUPABASE_ANON_KEY]", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

### 方式三：手动调用（测试用）

使用 curl 手动触发：

```bash
curl -X POST \
  https://[PROJECT_REF].supabase.co/functions/v1/process-ai-tasks \
  -H "Authorization: Bearer [SUPABASE_ANON_KEY]" \
  -H "Content-Type: application/json"
```

## 工作流程

1. **任务抢占**: Edge Function 使用 `SELECT FOR UPDATE SKIP LOCKED` 原子性地抢占一个 `queued` 状态的任务
2. **状态更新**: 将任务状态更新为 `running`，并增加 `attempts` 计数
3. **获取上下文**: 从 `chat_messages` 表获取最近 10 条聊天历史
4. **调用 OpenRouter**: 使用 OpenRouter API (openai/gpt-4o-mini 模型) 生成 AI 响应
5. **写入结果**: 
   - 将 AI 响应写入 `chat_messages` 表（role='assistant'）
   - 写入处理日志到 `build_logs` 表
   - 更新 `ai_tasks` 状态为 `completed`
6. **错误处理**: 
   - 如果失败且未达到最大重试次数，返回 `queued` 状态
   - 如果达到最大重试次数，标记为 `failed`

## 任务类型

目前支持的任务类型：

- **chat_reply**: 处理聊天消息，生成 AI 响应

## 数据库表结构

### ai_tasks 表

```sql
- id: uuid (主键)
- project_id: uuid (外键 -> projects)
- user_id: uuid (外键 -> auth.users)
- type: text ('chat_reply', 'build_site', 'refactor_code')
- payload: jsonb (任务参数)
- status: text ('queued', 'running', 'completed', 'failed', 'cancelled')
- result: jsonb (任务结果)
- model: text (使用的模型名称)
- error: text (错误信息)
- attempts: integer (已尝试次数，默认 0)
- max_attempts: integer (最大重试次数，默认 3)
- created_at: timestamptz
- started_at: timestamptz
- finished_at: timestamptz
```

## 监控和调试

### 查看 Edge Function 日志

在 Supabase Dashboard > Edge Functions > process-ai-tasks > Logs

### 查看任务状态

```sql
-- 查看所有任务状态
SELECT id, type, status, attempts, max_attempts, error, created_at
FROM ai_tasks
ORDER BY created_at DESC
LIMIT 10;

-- 查看失败的任务
SELECT id, type, error, attempts, created_at
FROM ai_tasks
WHERE status = 'failed'
ORDER BY created_at DESC;

-- 查看正在运行的任务
SELECT id, type, started_at, attempts
FROM ai_tasks
WHERE status = 'running'
ORDER BY started_at DESC;
```

### 查看构建日志

```sql
SELECT log_type, message, created_at
FROM build_logs
WHERE project_id = '[PROJECT_ID]'
ORDER BY created_at DESC
LIMIT 20;
```

## 性能优化

- 使用索引优化任务查询：`idx_ai_tasks_status_attempts`
- 使用连接池减少数据库连接开销
- 限制聊天历史长度（默认 10 条）以控制 OpenRouter API 成本

## 安全注意事项

- ⚠️ **不要将 OPENROUTER_KEY 或 SUPABASE_SERVICE_ROLE_KEY 提交到代码库**
- ✅ 所有密钥都应通过 Supabase Dashboard 的环境变量配置
- ✅ Edge Function 使用 Service Role Key 绕过 RLS，确保数据访问安全
- ✅ 前端只能创建任务，不能直接调用 OpenRouter API

## 故障排查

### 问题：Edge Function 没有处理任务

1. 检查环境变量是否正确配置
2. 检查 Edge Function 日志是否有错误
3. 确认 Database Webhook 或 Scheduled Function 已正确配置
4. 手动调用 Edge Function 进行测试

### 问题：OpenRouter API 调用失败

1. 检查 OPENROUTER_KEY 是否有效
2. 检查 OpenRouter 账户余额是否充足
3. 查看 Edge Function 日志中的详细错误信息

### 问题：任务一直处于 running 状态

1. 检查 Edge Function 是否正常运行
2. 查看 Edge Function 日志是否有超时或错误
3. 手动将任务状态重置为 queued：

```sql
UPDATE ai_tasks
SET status = 'queued', attempts = 0
WHERE id = '[TASK_ID]';
```

## 开发和测试

### 本地测试

使用 Supabase CLI 在本地运行 Edge Function：

```bash
# 启动本地 Supabase
supabase start

# 部署 Edge Function 到本地
supabase functions deploy process-ai-tasks --no-verify-jwt

# 调用本地 Edge Function
curl -X POST \
  http://localhost:54321/functions/v1/process-ai-tasks \
  -H "Authorization: Bearer [LOCAL_ANON_KEY]" \
  -H "Content-Type: application/json"
```

### 并发测试

测试多个 Worker 实例的并发安全性：

```bash
# 创建多个测试任务
for i in {1..10}; do
  curl -X POST http://localhost:54321/rest/v1/ai_tasks \
    -H "Authorization: Bearer [ANON_KEY]" \
    -H "Content-Type: application/json" \
    -d "{\"project_id\":\"[PROJECT_ID]\",\"user_id\":\"[USER_ID]\",\"type\":\"chat_reply\",\"payload\":{},\"status\":\"queued\"}"
done

# 同时调用多个 Worker 实例
for i in {1..5}; do
  curl -X POST http://localhost:54321/functions/v1/process-ai-tasks \
    -H "Authorization: Bearer [ANON_KEY]" &
done
wait

# 检查是否有重复处理
SELECT id, status, attempts FROM ai_tasks;
```

## 扩展和定制

### 添加新的任务类型

在 `processTask` 函数中添加新的 case：

```typescript
if (task.type === 'build_site') {
  // 实现网站构建逻辑
} else if (task.type === 'refactor_code') {
  // 实现代码重构逻辑
}
```

### 自定义 OpenRouter 模型

修改 `callOpenRouter` 函数中的 model 参数：

```typescript
model: 'openai/gpt-4',  // 或 'anthropic/claude-3-opus', 'google/gemini-pro' 等
```

### 调整重试策略

修改 `ai_tasks` 表的 `max_attempts` 默认值：

```sql
ALTER TABLE ai_tasks
ALTER COLUMN max_attempts SET DEFAULT 5;
```
