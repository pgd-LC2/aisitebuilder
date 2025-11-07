/*
  # 创建项目管理系统表结构

  ## 新建表

  ### 1. projects 表
  用户创建的 AI 构建项目
  - `id` (uuid, 主键) - 项目唯一标识
  - `user_id` (uuid, 外键) - 项目所有者，关联 auth.users
  - `title` (text) - 项目标题（AI 自动生成）
  - `description` (text) - 用户输入的完整描述
  - `status` (text) - 项目状态：draft（草稿）、building（构建中）、completed（已完成）、failed（失败）
  - `created_at` (timestamptz) - 创建时间
  - `updated_at` (timestamptz) - 更新时间

  ### 2. project_versions 表
  项目的构建版本历史
  - `id` (uuid, 主键) - 版本唯一标识
  - `project_id` (uuid, 外键) - 关联的项目
  - `version_number` (integer) - 版本号（递增）
  - `code_snapshot` (jsonb) - 代码快照（存储文件结构和内容）
  - `preview_url` (text) - 预览链接
  - `created_at` (timestamptz) - 创建时间

  ### 3. build_logs 表
  项目构建过程日志
  - `id` (uuid, 主键) - 日志唯一标识
  - `project_id` (uuid, 外键) - 关联的项目
  - `log_type` (text) - 日志类型：info（信息）、success（成功）、error（错误）
  - `message` (text) - 日志消息内容
  - `metadata` (jsonb) - 额外的元数据（可选）
  - `created_at` (timestamptz) - 创建时间

  ## 安全策略

  ### RLS 策略
  - 所有表启用行级安全（RLS）
  - 用户只能访问、创建、更新和删除自己的项目及相关数据
  - 通过 auth.uid() 验证用户身份

  ## 索引优化
  - 为常用查询字段创建索引（user_id, project_id, created_at）
*/

-- 创建 projects 表
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'building', 'completed', 'failed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 创建 project_versions 表
CREATE TABLE IF NOT EXISTS project_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  code_snapshot jsonb DEFAULT '{}',
  preview_url text,
  created_at timestamptz DEFAULT now()
);

-- 创建 build_logs 表
CREATE TABLE IF NOT EXISTS build_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  log_type text NOT NULL CHECK (log_type IN ('info', 'success', 'error')),
  message text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_versions_project_id ON project_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_build_logs_project_id ON build_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_build_logs_created_at ON build_logs(created_at DESC);

-- 启用 RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE build_logs ENABLE ROW LEVEL SECURITY;

-- Projects 表的 RLS 策略
CREATE POLICY "用户可以查看自己的项目"
  ON projects FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "用户可以创建自己的项目"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户可以更新自己的项目"
  ON projects FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户可以删除自己的项目"
  ON projects FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Project Versions 表的 RLS 策略
CREATE POLICY "用户可以查看自己项目的版本"
  ON project_versions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_versions.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "用户可以创建自己项目的版本"
  ON project_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_versions.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "用户可以删除自己项目的版本"
  ON project_versions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_versions.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- Build Logs 表的 RLS 策略
CREATE POLICY "用户可以查看自己项目的日志"
  ON build_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = build_logs.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "用户可以创建自己项目的日志"
  ON build_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = build_logs.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "用户可以删除自己项目的日志"
  ON build_logs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = build_logs.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- 创建自动更新 updated_at 的触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为 projects 表添加触发器
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();