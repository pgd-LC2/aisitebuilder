/*
  # 创建聊天消息存储表

  ## 新建表

  ### chat_messages 表
  存储用户和 AI 之间的对话消息
  - `id` (uuid, 主键) - 消息唯一标识
  - `project_id` (uuid, 外键) - 关联的项目 ID
  - `role` (text) - 消息角色：user（用户）或 assistant（AI助手）
  - `content` (text) - 消息内容
  - `metadata` (jsonb) - 额外元数据（如token数、模型版本等）
  - `created_at` (timestamptz) - 创建时间

  ## 安全策略
  - 启用行级安全（RLS）
  - 用户只能访问自己项目的消息
  - 通过 projects 表验证所有权

  ## 索引优化
  - 为 project_id 创建索引以加速查询
  - 为 created_at 创建索引以支持时间排序

  ## 实时功能
  - 启用 Realtime 以支持实时消息推送
*/

-- 创建 chat_messages 表
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_chat_messages_project_id ON chat_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at ASC);

-- 启用 RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户可以查看自己项目的消息
CREATE POLICY "用户可以查看自己项目的消息"
  ON chat_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = chat_messages.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- RLS 策略：用户可以创建自己项目的消息
CREATE POLICY "用户可以创建自己项目的消息"
  ON chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = chat_messages.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- RLS 策略：用户可以删除自己项目的消息
CREATE POLICY "用户可以删除自己项目的消息"
  ON chat_messages FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = chat_messages.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- 启用 Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
