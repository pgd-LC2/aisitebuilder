-- 迁移：删除 self_repair 事件类型
-- 此迁移是 build 模块重构的一部分，完全移除自修复系统

-- 1. 删除所有 self_repair 类型的事件
DELETE FROM agent_events WHERE type = 'self_repair';

-- 2. 删除旧的 CHECK 约束（如果存在）
ALTER TABLE agent_events DROP CONSTRAINT IF EXISTS agent_events_type_check;

-- 3. 添加新的 CHECK 约束（不包含 self_repair）
ALTER TABLE agent_events ADD CONSTRAINT agent_events_type_check 
  CHECK (type IN ('agent_phase', 'tool_call', 'file_update', 'log', 'error', 'progress'));

-- 4. 清理可能包含 self_repair 相关数据的 metadata 字段
UPDATE ai_tasks 
SET metadata = metadata - 'selfRepairResult' - 'repairHistory'
WHERE metadata ? 'selfRepairResult' OR metadata ? 'repairHistory';
