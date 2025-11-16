/*
  # 为 ai_tasks 表添加重试计数字段

  ## 背景
  - Worker 需要实现重试机制来处理临时失败（网络错误、模型限流等）
  - attempts 字段记录任务已尝试执行的次数
  - max_attempts 字段定义任务的最大重试次数

  ## 变更内容
  - 添加 attempts 字段（默认 0）
  - 添加 max_attempts 字段（默认 3）
  - 添加索引以便 Worker 高效查询可重试的任务
*/

ALTER TABLE ai_tasks
ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3;

CREATE INDEX IF NOT EXISTS idx_ai_tasks_status_attempts 
  ON ai_tasks(status, attempts) 
  WHERE status = 'queued';

COMMENT ON COLUMN ai_tasks.attempts IS '任务已尝试执行的次数';
COMMENT ON COLUMN ai_tasks.max_attempts IS '任务允许的最大重试次数';
