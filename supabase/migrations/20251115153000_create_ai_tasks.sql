

/*
  # 创建 ai_tasks 表管理 AI 调度任务

  ## 背景
  - 前端将聊天消息、构建请求等长任务封装为可审计的任务实体
  - 后端（Edge Function 或 Worker）按任务类型执行模型调用/构建后回写结果

  ## 变更内容
  - 新增 ai_tasks 表记录任务元数据、载荷、执行状态与结果
  - 为常用字段添加索引，便于按项目或状态筛选
  - 配置基础 RLS，确保用户只能操作自己的项目任务
*/

CREATE TABLE IF NOT EXISTS ai_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  result jsonb DEFAULT '{}'::jsonb,
  model text,
  error text,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ai_tasks_project_id ON ai_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_status ON ai_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_created_at ON ai_tasks(created_at DESC);

ALTER TABLE ai_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "用户可以查看自己的 AI 任务"
  ON ai_tasks FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = ai_tasks.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "用户可以创建自己的 AI 任务"
  ON ai_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = ai_tasks.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "用户可以更新自己的 AI 任务状态"
  ON ai_tasks FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
