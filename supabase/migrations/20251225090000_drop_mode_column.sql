-- Migration: 删除 ai_tasks 表的 mode 列
-- 
-- 背景：
-- - 原有设计添加了 mode 列用于存储 InteractionMode
-- - 现在直接使用 type 字段存储 chat/plan/build
-- - mode 列已废弃，不再使用
--
-- 变更内容：
-- 1. 删除 mode 列的 CHECK 约束
-- 2. 删除 mode 列的索引
-- 3. 删除 mode 列

-- 1. 删除 CHECK 约束（如果存在）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ai_tasks_mode_check'
    AND conrelid = 'ai_tasks'::regclass
  ) THEN
    ALTER TABLE ai_tasks DROP CONSTRAINT ai_tasks_mode_check;
    RAISE NOTICE '已删除 CHECK 约束: ai_tasks_mode_check';
  END IF;
END $$;

-- 2. 删除索引（如果存在）
DROP INDEX IF EXISTS idx_ai_tasks_mode;

-- 3. 删除 mode 列（如果存在）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_tasks' AND column_name = 'mode'
  ) THEN
    ALTER TABLE ai_tasks DROP COLUMN mode;
    RAISE NOTICE '已删除列: ai_tasks.mode';
  ELSE
    RAISE NOTICE 'mode 列不存在，跳过删除';
  END IF;
END $$;

-- 4. 更新 type 列的注释
COMMENT ON COLUMN ai_tasks.type IS '任务类型（统一交互模式）: chat=对话/只读分析, plan=需求澄清/方案规划, build=代码生成/文件修改';
