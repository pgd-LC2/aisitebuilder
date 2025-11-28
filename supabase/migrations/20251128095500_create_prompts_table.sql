-- 创建 prompts 表用于存储 AI agent 提示词
CREATE TABLE IF NOT EXISTS prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'system',
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_prompts_key ON prompts(key);
CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category);
CREATE INDEX IF NOT EXISTS idx_prompts_is_active ON prompts(is_active);

-- 添加注释
COMMENT ON TABLE prompts IS 'AI agent 提示词存储表';
COMMENT ON COLUMN prompts.key IS '提示词唯一标识符，格式：agent.task_type.prompt_type';
COMMENT ON COLUMN prompts.content IS '提示词内容';
COMMENT ON COLUMN prompts.description IS '提示词描述';
COMMENT ON COLUMN prompts.category IS '提示词分类：system, task, tool';
COMMENT ON COLUMN prompts.version IS '版本号';
COMMENT ON COLUMN prompts.is_active IS '是否启用';
COMMENT ON COLUMN prompts.metadata IS '额外元数据';

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_prompts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prompts_updated_at
  BEFORE UPDATE ON prompts
  FOR EACH ROW
  EXECUTE FUNCTION update_prompts_updated_at();

-- 启用 RLS
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;

-- 创建 RLS 策略：允许所有认证用户读取活跃的提示词
CREATE POLICY "prompts_select_policy" ON prompts
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- 创建 RLS 策略：允许 service role 完全访问
CREATE POLICY "prompts_service_role_policy" ON prompts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
