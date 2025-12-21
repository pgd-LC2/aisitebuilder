/*
  # 调整 ai_tasks 表字段顺序

  ## 背景
  - 需要将 mode 字段移动到 type 字段右边
  - 需要将 model_id 字段移动到 model 字段右边
  - PostgreSQL 不支持直接修改列顺序，需要重建表

  ## 变更内容
  - 创建新表 ai_tasks_new，按照期望的字段顺序定义
  - 迁移数据从旧表到新表
  - 删除旧表，重命名新表
  - 重建所有索引、约束和 RLS 策略

  ## 新字段顺序
  id, project_id, user_id, type, mode, payload, status, result, model, model_id, error, created_at, started_at, finished_at, attempts, max_attempts
*/

-- 1. 创建新表，按照期望的字段顺序
CREATE TABLE ai_tasks_new (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  mode text,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  result jsonb DEFAULT '{}'::jsonb,
  model text,
  model_id uuid REFERENCES models(id) ON DELETE SET NULL,
  error text,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3
);

-- 2. 复制数据到新表
INSERT INTO ai_tasks_new (
  id, project_id, user_id, type, mode, payload, status, result, 
  model, model_id, error, created_at, started_at, finished_at, 
  attempts, max_attempts
)
SELECT 
  id, project_id, user_id, type, mode, payload, status, result, 
  model, model_id, error, created_at, started_at, finished_at, 
  attempts, max_attempts
FROM ai_tasks;

-- 3. 删除旧表（会自动删除旧表的索引、约束和策略）
DROP TABLE ai_tasks CASCADE;

-- 4. 重命名新表
ALTER TABLE ai_tasks_new RENAME TO ai_tasks;

-- 5. 添加 CHECK 约束
ALTER TABLE ai_tasks 
ADD CONSTRAINT ai_tasks_status_check 
CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled'));

ALTER TABLE ai_tasks 
ADD CONSTRAINT ai_tasks_mode_check 
CHECK (mode IS NULL OR mode IN ('chat', 'plan', 'build'));

ALTER TABLE ai_tasks 
ADD CONSTRAINT ai_tasks_type_check 
CHECK (type IN ('chat', 'plan', 'build'));

-- 6. 创建索引
CREATE INDEX idx_ai_tasks_project_id ON ai_tasks(project_id);
CREATE INDEX idx_ai_tasks_status ON ai_tasks(status);
CREATE INDEX idx_ai_tasks_created_at ON ai_tasks(created_at DESC);
CREATE INDEX idx_ai_tasks_model_id ON ai_tasks(model_id);
CREATE INDEX idx_ai_tasks_status_attempts ON ai_tasks(status, attempts) WHERE status = 'queued';
CREATE INDEX idx_ai_tasks_user_id ON ai_tasks(user_id);
CREATE INDEX idx_ai_tasks_mode ON ai_tasks(mode);

-- 7. 启用 RLS
ALTER TABLE ai_tasks ENABLE ROW LEVEL SECURITY;

-- 8. 创建 RLS 策略
CREATE POLICY "ai_tasks_select"
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

CREATE POLICY "ai_tasks_insert"
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

CREATE POLICY "ai_tasks_update"
  ON ai_tasks FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 9. 添加字段注释
COMMENT ON COLUMN ai_tasks.mode IS '统一交互模式: chat(只读对话), plan(需求规划), build(完整构建)';
COMMENT ON COLUMN ai_tasks.type IS '@deprecated 使用 mode 替代，保留用于向后兼容';
COMMENT ON COLUMN ai_tasks.model_id IS '关联的模型 ID，引用 models 表';
COMMENT ON COLUMN ai_tasks.attempts IS '任务已尝试执行的次数';
COMMENT ON COLUMN ai_tasks.max_attempts IS '任务允许的最大重试次数';
