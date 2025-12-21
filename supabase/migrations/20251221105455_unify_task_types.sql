-- Migration: 统一任务类型为 chat/plan/build
-- 将旧的 TaskType + WorkflowMode 双维度映射为新的 InteractionMode 单维度
-- 
-- 映射规则：
-- - chat_reply + workflowMode='planning' → plan
-- - chat_reply + 其他情况 → chat
-- - build_site / refactor_code / debug → build
--
-- 注意：此迁移是幂等的，可以安全地重复执行

-- 记录迁移前的状态（用于验证）
DO $$
DECLARE
  total_count INTEGER;
  old_type_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM ai_tasks;
  SELECT COUNT(*) INTO old_type_count FROM ai_tasks 
    WHERE type IN ('chat_reply', 'build_site', 'refactor_code', 'debug');
  
  RAISE NOTICE '迁移前状态: 总记录数=%, 旧类型记录数=%', total_count, old_type_count;
END $$;

-- 步骤 1: 将 chat_reply + planning 映射为 plan
UPDATE ai_tasks
SET type = 'plan'
WHERE type = 'chat_reply'
  AND (
    payload->>'workflowMode' = 'planning'
    OR payload->>'workflow_mode' = 'planning'
  );

-- 步骤 2: 将剩余的 chat_reply 映射为 chat
UPDATE ai_tasks
SET type = 'chat'
WHERE type = 'chat_reply';

-- 步骤 3: 将 build_site / refactor_code / debug 映射为 build
UPDATE ai_tasks
SET type = 'build'
WHERE type IN ('build_site', 'refactor_code', 'debug');

-- 记录迁移后的状态（用于验证）
DO $$
DECLARE
  total_count INTEGER;
  chat_count INTEGER;
  plan_count INTEGER;
  build_count INTEGER;
  old_type_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM ai_tasks;
  SELECT COUNT(*) INTO chat_count FROM ai_tasks WHERE type = 'chat';
  SELECT COUNT(*) INTO plan_count FROM ai_tasks WHERE type = 'plan';
  SELECT COUNT(*) INTO build_count FROM ai_tasks WHERE type = 'build';
  SELECT COUNT(*) INTO old_type_count FROM ai_tasks 
    WHERE type IN ('chat_reply', 'build_site', 'refactor_code', 'debug');
  
  RAISE NOTICE '迁移后状态: 总记录数=%, chat=%, plan=%, build=%, 旧类型残留=%', 
    total_count, chat_count, plan_count, build_count, old_type_count;
  
  -- 验证：旧类型应该全部被迁移
  IF old_type_count > 0 THEN
    RAISE WARNING '警告: 仍有 % 条记录使用旧类型', old_type_count;
  END IF;
END $$;

-- 步骤 4: 添加 CHECK 约束，限制只允许 chat/plan/build
-- 注意：使用 IF NOT EXISTS 模式确保幂等性
DO $$
BEGIN
  -- 先删除旧约束（如果存在）
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ai_tasks_type_check' 
    AND conrelid = 'ai_tasks'::regclass
  ) THEN
    ALTER TABLE ai_tasks DROP CONSTRAINT ai_tasks_type_check;
  END IF;
  
  -- 添加新约束
  ALTER TABLE ai_tasks 
    ADD CONSTRAINT ai_tasks_type_check 
    CHECK (type IN ('chat', 'plan', 'build'));
    
  RAISE NOTICE '已添加 CHECK 约束: type IN (chat, plan, build)';
EXCEPTION
  WHEN check_violation THEN
    RAISE EXCEPTION '无法添加 CHECK 约束: 仍有记录使用旧类型值';
END $$;

-- 添加注释说明新的类型含义
COMMENT ON COLUMN ai_tasks.type IS '任务类型（统一交互模式）: chat=对话/只读分析, plan=需求澄清/方案规划, build=代码生成/文件修改';
