/*
  # 统一交互模式 (InteractionMode) 迁移

  ## 背景
  - 原有系统使用 TaskType × WorkflowMode 双维度概念，导致职责混乱
  - 新架构统一为 InteractionMode: 'chat' | 'plan' | 'build'
  - 工具权限矩阵简化为由 mode 决定 allowed tools

  ## 变更内容
  1. 为 ai_tasks 表添加 mode 字段
  2. 添加 CHECK 约束确保 mode 值有效
  3. 迁移历史数据：根据 type + payload.workflowMode 映射到 mode
  4. 保留旧字段用于向后兼容

  ## 映射规则
  - chat_reply + default → 'chat'
  - chat_reply + planning → 'plan'
  - chat_reply + build → 'build'
  - build_site + * → 'build'
  - refactor_code + * → 'build'
  - debug + * → 'build'
*/

-- 1. 添加 mode 字段（允许 NULL 用于向后兼容）
ALTER TABLE ai_tasks 
ADD COLUMN IF NOT EXISTS mode text;

-- 2. 添加 CHECK 约束
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ai_tasks_mode_check'
  ) THEN
    ALTER TABLE ai_tasks 
    ADD CONSTRAINT ai_tasks_mode_check 
    CHECK (mode IS NULL OR mode IN ('chat', 'plan', 'build'));
  END IF;
END $$;

-- 3. 迁移历史数据
UPDATE ai_tasks
SET mode = CASE
  -- build_site、refactor_code、debug 始终是 build 模式
  WHEN type IN ('build_site', 'refactor_code', 'debug') THEN 'build'
  -- chat_reply 根据 payload.workflowMode 决定
  WHEN type = 'chat_reply' AND payload->>'workflowMode' = 'build' THEN 'build'
  WHEN type = 'chat_reply' AND payload->>'workflowMode' = 'planning' THEN 'plan'
  WHEN type = 'chat_reply' THEN 'chat'
  -- 默认为 chat
  ELSE 'chat'
END
WHERE mode IS NULL;

-- 4. 添加索引以优化按 mode 查询
CREATE INDEX IF NOT EXISTS idx_ai_tasks_mode ON ai_tasks(mode);

-- 5. 添加注释说明
COMMENT ON COLUMN ai_tasks.mode IS '统一交互模式: chat(只读对话), plan(需求规划), build(完整构建)';
COMMENT ON COLUMN ai_tasks.type IS '@deprecated 使用 mode 替代，保留用于向后兼容';

