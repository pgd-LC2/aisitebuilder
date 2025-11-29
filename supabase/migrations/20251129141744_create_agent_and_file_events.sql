/*
  # 创建 agent_events 和 file_events 表

  ## 背景
  - Step 3: Edge Functions + Supabase Realtime 文件/Agent 事件推送
  - 用于驱动前端 Activity Timeline 的实时展示
  - 让 build_logs 表真正只记录日志，事件数据存储在专用表中

  ## 新建表

  ### 1. agent_events 表
  记录 AI Agent 在执行任务过程中产生的所有事件
  - `id` (uuid, 主键) - 事件唯一标识
  - `task_id` (uuid) - 关联的 AI 任务 ID
  - `project_id` (uuid, 外键) - 关联的项目 ID
  - `type` (text) - 事件类型：agent_phase, tool_call, file_update, self_repair, log, error
  - `payload` (jsonb) - 事件详细数据
  - `created_at` (timestamptz) - 创建时间

  ### 2. file_events 表
  记录项目文件的变更事件
  - `id` (uuid, 主键) - 事件唯一标识
  - `project_id` (uuid, 外键) - 关联的项目 ID
  - `path` (text) - 文件路径
  - `op` (text) - 操作类型：create, update, delete, move
  - `summary` (text) - 操作摘要
  - `content_ref` (text) - 内容引用（可选）
  - `version` (text) - 版本号（可选）
  - `from_path` (text) - 源路径（move 操作时使用）
  - `created_at` (timestamptz) - 创建时间

  ## 安全策略
  - 启用 RLS，用户只能访问自己项目的事件
  - Edge Functions 使用 service role 写入

  ## 实时功能
  - 启用 Realtime 以支持实时事件推送
*/

-- 创建 agent_events 表
CREATE TABLE IF NOT EXISTS agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('agent_phase', 'tool_call', 'file_update', 'self_repair', 'log', 'error')),
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- 创建 file_events 表
CREATE TABLE IF NOT EXISTS file_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path text NOT NULL,
  op text NOT NULL CHECK (op IN ('create', 'update', 'delete', 'move')),
  summary text,
  content_ref text,
  version text,
  from_path text,
  created_at timestamptz DEFAULT now()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_agent_events_project_id ON agent_events(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_events_task_id ON agent_events(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_events_created_at ON agent_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_type ON agent_events(type);

CREATE INDEX IF NOT EXISTS idx_file_events_project_id ON file_events(project_id);
CREATE INDEX IF NOT EXISTS idx_file_events_path ON file_events(path);
CREATE INDEX IF NOT EXISTS idx_file_events_created_at ON file_events(created_at DESC);

-- 启用 RLS
ALTER TABLE agent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_events ENABLE ROW LEVEL SECURITY;

-- agent_events 表的 RLS 策略
CREATE POLICY "用户可以查看自己项目的 Agent 事件"
  ON agent_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = agent_events.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- 允许 service role 插入（Edge Functions 使用）
CREATE POLICY "Service role 可以插入 Agent 事件"
  ON agent_events FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 允许 authenticated 用户插入自己项目的事件（前端直接写入场景）
CREATE POLICY "用户可以创建自己项目的 Agent 事件"
  ON agent_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = agent_events.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- file_events 表的 RLS 策略
CREATE POLICY "用户可以查看自己项目的文件事件"
  ON file_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = file_events.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- 允许 service role 插入（Edge Functions 使用）
CREATE POLICY "Service role 可以插入文件事件"
  ON file_events FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 允许 authenticated 用户插入自己项目的事件
CREATE POLICY "用户可以创建自己项目的文件事件"
  ON file_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = file_events.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- 启用 Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE agent_events;
ALTER PUBLICATION supabase_realtime ADD TABLE file_events;

-- 设置 REPLICA IDENTITY 为 FULL 以支持完整的 Realtime 事件
ALTER TABLE agent_events REPLICA IDENTITY FULL;
ALTER TABLE file_events REPLICA IDENTITY FULL;
