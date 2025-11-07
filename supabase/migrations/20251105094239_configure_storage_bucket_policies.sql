/*
  # 配置 Storage 存储桶策略

  ## 1. 创建 project-files 存储桶
  
  存储桶用于存储所有项目相关的文件，包括：
  - 用户上传的文件
  - AI 生成的代码文件
  - 网站资源文件
  - 构建产物

  ## 2. 配置存储桶策略
  
  ### 路径结构
  - `{project_id}/v{version_number}/文件名`
  - `{project_id}/shared/文件名`（跨版本共享文件）

  ### 访问控制（RLS）
  - 用户只能访问自己项目的文件
  - 支持生成签名 URL 用于分享
  - 默认私有，需要身份验证

  ## 3. 安全配置
  
  - 文件大小限制：50MB
  - 允许的文件类型：所有类型（在应用层验证）
  - 启用版本控制（可选）
*/

-- 插入存储桶配置（如果不存在）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-files',
  'project-files',
  false,  -- 私有存储桶
  52428800,  -- 50MB 限制
  NULL  -- 允许所有 MIME 类型
)
ON CONFLICT (id) DO NOTHING;

-- 删除可能存在的旧策略
DROP POLICY IF EXISTS "用户可以查看自己项目的文件" ON storage.objects;
DROP POLICY IF EXISTS "用户可以上传文件到自己的项目" ON storage.objects;
DROP POLICY IF EXISTS "用户可以更新自己项目的文件" ON storage.objects;
DROP POLICY IF EXISTS "用户可以删除自己项目的文件" ON storage.objects;

-- 创建 Storage 对象的 RLS 策略
-- 策略1: 用户可以查看自己项目的文件
CREATE POLICY "用户可以查看自己项目的文件"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'project-files' AND
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id::text = split_part(storage.objects.name, '/', 1)
    AND projects.user_id = auth.uid()
  )
);

-- 策略2: 用户可以上传文件到自己的项目
CREATE POLICY "用户可以上传文件到自己的项目"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'project-files' AND
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id::text = split_part(storage.objects.name, '/', 1)
    AND projects.user_id = auth.uid()
  )
);

-- 策略3: 用户可以更新自己项目的文件
CREATE POLICY "用户可以更新自己项目的文件"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'project-files' AND
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id::text = split_part(storage.objects.name, '/', 1)
    AND projects.user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'project-files' AND
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id::text = split_part(storage.objects.name, '/', 1)
    AND projects.user_id = auth.uid()
  )
);

-- 策略4: 用户可以删除自己项目的文件
CREATE POLICY "用户可以删除自己项目的文件"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'project-files' AND
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id::text = split_part(storage.objects.name, '/', 1)
    AND projects.user_id = auth.uid()
  )
);