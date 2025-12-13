/*
  # 创建 models 表管理 AI 模型配置

  ## 背景
  - 需要一个集中管理 AI 模型的表，存储模型的调用名称和显示名称
  - 例如：openai/gpt-5.2 对应显示名称 GPT 5.2
  - 将 ai_tasks 表中的 model 字段与 models 表进行关联

  ## 变更内容
  - 新增 models 表记录模型的 API 调用名称、显示名称、描述等信息
  - 在 ai_tasks 表中添加 model_id 外键字段关联 models 表
  - 插入初始模型数据（当前使用的 Gemini 模型）
  - 配置 RLS 策略，允许所有认证用户读取模型列表
*/

-- 创建 models 表
CREATE TABLE IF NOT EXISTS models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  provider text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_models_api_name ON models(api_name);
CREATE INDEX IF NOT EXISTS idx_models_is_active ON models(is_active) WHERE is_active = true;

-- 添加字段注释
COMMENT ON TABLE models IS 'AI 模型配置表，存储模型的调用名称和显示名称映射';
COMMENT ON COLUMN models.api_name IS '模型的 API 调用名称，如 google/gemini-3-pro-preview';
COMMENT ON COLUMN models.display_name IS '模型的显示名称，如 Gemini 3 Pro';
COMMENT ON COLUMN models.description IS '模型描述';
COMMENT ON COLUMN models.provider IS '模型提供商，如 Google、OpenAI';
COMMENT ON COLUMN models.is_active IS '是否启用该模型';

-- 启用 RLS
ALTER TABLE models ENABLE ROW LEVEL SECURITY;

-- 创建 RLS 策略：所有认证用户可以查看模型列表
CREATE POLICY "认证用户可以查看模型列表"
  ON models FOR SELECT
  TO authenticated
  USING (true);

-- 插入初始模型数据
INSERT INTO models (api_name, display_name, description, provider, is_active) VALUES
  ('google/gemini-3-pro-preview', 'Gemini 3 Pro', 'Google Gemini 3 Pro 预览版，用于文本生成和对话', 'Google', true),
  ('google/gemini-3-pro-image-preview', 'Gemini 3 Pro Image', 'Google Gemini 3 Pro 图像生成预览版', 'Google', true),
  ('openai/gpt-4o', 'GPT-4o', 'OpenAI GPT-4o 多模态模型', 'OpenAI', true),
  ('openai/gpt-4o-mini', 'GPT-4o Mini', 'OpenAI GPT-4o Mini 轻量版', 'OpenAI', true),
  ('anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet', 'Anthropic Claude 3.5 Sonnet 模型', 'Anthropic', true)
ON CONFLICT (api_name) DO NOTHING;

-- 在 ai_tasks 表中添加 model_id 外键字段
ALTER TABLE ai_tasks
ADD COLUMN IF NOT EXISTS model_id uuid REFERENCES models(id) ON DELETE SET NULL;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_ai_tasks_model_id ON ai_tasks(model_id);

-- 添加字段注释
COMMENT ON COLUMN ai_tasks.model_id IS '关联的模型 ID，引用 models 表';

-- 创建触发器函数：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_models_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_update_models_updated_at ON models;
CREATE TRIGGER trigger_update_models_updated_at
  BEFORE UPDATE ON models
  FOR EACH ROW
  EXECUTE FUNCTION update_models_updated_at();
