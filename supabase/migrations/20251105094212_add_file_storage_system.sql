/*
  # 添加文件存储系统

  ## 1. 扩展 project_versions 表
  
  为 project_versions 表添加文件存储相关字段：
  - `storage_path` (text) - 该版本在存储桶中的文件夹路径
  - `total_files` (integer) - 该版本的文件总数
  - `total_size` (bigint) - 该版本的文件总大小（字节）

  ## 2. 创建 project_files 表
  
  用于追踪和管理项目文件的元数据：
  - `id` (uuid, 主键) - 文件唯一标识
  - `project_id` (uuid, 外键) - 所属项目
  - `version_id` (uuid, 外键) - 所属版本
  - `file_name` (text) - 文件名
  - `file_path` (text) - 存储桶中的完整路径
  - `file_size` (bigint) - 文件大小（字节）
  - `mime_type` (text) - 文件 MIME 类型
  - `file_category` (text) - 文件分类：code（代码）、asset（资源）、document（文档）、build（构建产物）
  - `source_type` (text) - 来源类型：user_upload（用户上传）、ai_generated（AI生成）
  - `is_public` (boolean) - 是否启用公开访问
  - `public_url` (text) - 公开分享链接（如果启用）
  - `share_expires_at` (timestamptz) - 分享链接过期时间
  - `created_at` (timestamptz) - 创建时间
  - `updated_at` (timestamptz) - 更新时间

  ## 3. 安全策略
  
  ### RLS 策略
  - 所有表启用行级安全（RLS）
  - 用户只能访问自己项目的文件记录
  - 通过关联 projects 表验证所有权

  ## 4. 索引优化
  
  - 为文件查询字段创建索引（project_id, version_id, file_category）
  - 优化文件列表和搜索性能
*/

-- 扩展 project_versions 表
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_versions' AND column_name = 'storage_path'
  ) THEN
    ALTER TABLE project_versions ADD COLUMN storage_path text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_versions' AND column_name = 'total_files'
  ) THEN
    ALTER TABLE project_versions ADD COLUMN total_files integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_versions' AND column_name = 'total_size'
  ) THEN
    ALTER TABLE project_versions ADD COLUMN total_size bigint DEFAULT 0;
  END IF;
END $$;

-- 创建 project_files 表
CREATE TABLE IF NOT EXISTS project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_id uuid REFERENCES project_versions(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL UNIQUE,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL,
  file_category text NOT NULL CHECK (file_category IN ('code', 'asset', 'document', 'build')),
  source_type text NOT NULL CHECK (source_type IN ('user_upload', 'ai_generated')),
  is_public boolean DEFAULT false,
  public_url text,
  share_expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_version_id ON project_files(version_id);
CREATE INDEX IF NOT EXISTS idx_project_files_category ON project_files(file_category);
CREATE INDEX IF NOT EXISTS idx_project_files_source ON project_files(source_type);
CREATE INDEX IF NOT EXISTS idx_project_files_created_at ON project_files(created_at DESC);

-- 启用 RLS
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

-- Project Files 表的 RLS 策略
CREATE POLICY "用户可以查看自己项目的文件"
  ON project_files FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_files.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "用户可以上传文件到自己的项目"
  ON project_files FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_files.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "用户可以更新自己项目的文件"
  ON project_files FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_files.project_id
      AND projects.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_files.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "用户可以删除自己项目的文件"
  ON project_files FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_files.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- 为 project_files 表添加更新时间触发器
CREATE TRIGGER update_project_files_updated_at
  BEFORE UPDATE ON project_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 创建函数：更新版本统计信息
CREATE OR REPLACE FUNCTION update_version_file_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE project_versions
    SET 
      total_files = COALESCE(total_files, 0) + 1,
      total_size = COALESCE(total_size, 0) + NEW.file_size
    WHERE id = NEW.version_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE project_versions
    SET 
      total_files = GREATEST(COALESCE(total_files, 0) - 1, 0),
      total_size = GREATEST(COALESCE(total_size, 0) - OLD.file_size, 0)
    WHERE id = OLD.version_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.version_id != OLD.version_id THEN
    -- 从旧版本减去
    UPDATE project_versions
    SET 
      total_files = GREATEST(COALESCE(total_files, 0) - 1, 0),
      total_size = GREATEST(COALESCE(total_size, 0) - OLD.file_size, 0)
    WHERE id = OLD.version_id;
    -- 向新版本添加
    UPDATE project_versions
    SET 
      total_files = COALESCE(total_files, 0) + 1,
      total_size = COALESCE(total_size, 0) + NEW.file_size
    WHERE id = NEW.version_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器：自动更新版本统计
CREATE TRIGGER trigger_update_version_file_stats
  AFTER INSERT OR DELETE OR UPDATE OF version_id, file_size ON project_files
  FOR EACH ROW
  EXECUTE FUNCTION update_version_file_stats();