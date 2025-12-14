/*
  # 创建预创建模板系统

  ## 概述
  
  实现项目预创建功能，提前将模板文件放到 Storage 中，
  用户创建项目时自动绑定一个预创建的模板，同时再生成一个新的预备模板，
  保证始终有预备模板可用。

  ## 新建表

  ### precreated_templates 表
  预创建模板池，存储预先生成的模板信息
  - `id` (uuid, 主键) - 模板唯一标识
  - `template_key` (text) - 模板类型（支持多种模板）
  - `status` (text) - 状态：creating（创建中）、ready（就绪）、reserved（已预留）、consumed（已消费）、failed（失败）
  - `storage_bucket` (text) - Storage 存储桶名称
  - `storage_prefix` (text) - Storage 路径前缀
  - `code_snapshot` (jsonb) - 预存的代码快照
  - `file_manifest` (jsonb) - 文件清单（相对路径、mime_type、size 等）
  - `total_files` (integer) - 文件总数
  - `total_size` (bigint) - 文件总大小（字节）
  - `reserved_at` (timestamptz) - 预留时间
  - `reserved_project_id` (uuid) - 预留给的项目 ID
  - `reserved_by_user_id` (uuid) - 预留用户 ID
  - `consumed_at` (timestamptz) - 消费时间
  - `error` (text) - 错误信息
  - `created_at` (timestamptz) - 创建时间
  - `updated_at` (timestamptz) - 更新时间

  ## 新建 Storage Bucket

  ### template-files 存储桶
  用于存储预创建模板的文件，只有 service role 可访问

  ## 安全策略

  ### RLS 策略
  - 启用 RLS，默认拒绝所有访问
  - 只有 service role 可以操作此表
  - 不为 authenticated 用户创建任何策略

  ## 定时任务

  ### pg_cron 任务
  - 每分钟检查并补充模板池
  - 清理超时的 reserved 状态模板
*/

-- 创建 precreated_templates 表
CREATE TABLE IF NOT EXISTS precreated_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 模板类型（支持未来扩展多种模板）
  template_key text NOT NULL DEFAULT 'vite-react-ts',
  
  -- 状态机：creating → ready → reserved → consumed/failed
  status text NOT NULL DEFAULT 'creating' 
    CHECK (status IN ('creating', 'ready', 'reserved', 'consumed', 'failed')),
  
  -- Storage 位置
  storage_bucket text NOT NULL DEFAULT 'template-files',
  storage_prefix text NOT NULL,
  
  -- 预存数据（避免消费时重新计算）
  code_snapshot jsonb DEFAULT '{}',
  file_manifest jsonb DEFAULT '[]',
  total_files integer DEFAULT 0,
  total_size bigint DEFAULT 0,
  
  -- 预留/消费追踪
  reserved_at timestamptz,
  reserved_project_id uuid,
  reserved_by_user_id uuid,
  consumed_at timestamptz,
  
  -- 错误信息
  error text,
  
  -- 时间戳
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_precreated_templates_status ON precreated_templates(status);
CREATE INDEX IF NOT EXISTS idx_precreated_templates_template_key ON precreated_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_precreated_templates_reserved_at ON precreated_templates(reserved_at);
CREATE INDEX IF NOT EXISTS idx_precreated_templates_created_at ON precreated_templates(created_at DESC);

-- 启用 RLS（默认拒绝所有访问，只有 service role 可操作）
ALTER TABLE precreated_templates ENABLE ROW LEVEL SECURITY;

-- 为 precreated_templates 表添加触发器（复用已有的 update_updated_at_column 函数）
CREATE TRIGGER update_precreated_templates_updated_at
  BEFORE UPDATE ON precreated_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 创建 template-files 存储桶（私有，只有 service role 可访问）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'template-files',
  'template-files',
  false,
  52428800,  -- 50MB 限制
  NULL  -- 允许所有 MIME 类型
)
ON CONFLICT (id) DO NOTHING;

-- 不为 template-files 存储桶创建任何 authenticated 用户策略
-- 只有 service role 可以访问此存储桶

-- ============================================
-- pg_cron 定时任务：补充模板池
-- ============================================

-- 创建补充模板池的函数
CREATE OR REPLACE FUNCTION ensure_template_pool()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  ready_count integer;
  min_pool_size integer := 2;  -- 最小池大小
  timeout_minutes integer := 5;  -- 超时时间（分钟）
BEGIN
  -- 1. 清理超时的 reserved 状态模板（超过 5 分钟未完成）
  UPDATE precreated_templates
  SET 
    status = 'ready',
    reserved_at = NULL,
    reserved_project_id = NULL,
    reserved_by_user_id = NULL,
    error = 'timeout_recovered',
    updated_at = NOW()
  WHERE status = 'reserved'
    AND reserved_at < NOW() - (timeout_minutes || ' minutes')::interval;

  -- 2. 统计 ready 状态的模板数量
  SELECT COUNT(*) INTO ready_count
  FROM precreated_templates
  WHERE status = 'ready';

  -- 3. 如果 ready 数量不足，记录日志（实际创建由 Edge Function 完成）
  -- 这里只做清理和统计，不直接创建模板
  -- 因为模板创建需要调用 Edge Function 上传文件到 Storage
  
  -- 可以通过 pg_notify 通知外部服务补充模板
  IF ready_count < min_pool_size THEN
    PERFORM pg_notify('template_pool_low', json_build_object(
      'ready_count', ready_count,
      'min_pool_size', min_pool_size,
      'need_count', min_pool_size - ready_count
    )::text);
  END IF;
END;
$$;

-- 创建 pg_cron 任务（每分钟执行一次）
-- 注意：需要确保 pg_cron 扩展已启用
DO $$
BEGIN
  -- 检查 pg_cron 扩展是否存在
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- 删除可能存在的旧任务
    PERFORM cron.unschedule('ensure_template_pool');
    
    -- 创建新的定时任务（每分钟执行）
    PERFORM cron.schedule(
      'ensure_template_pool',
      '* * * * *',  -- 每分钟
      'SELECT ensure_template_pool()'
    );
  END IF;
EXCEPTION
  WHEN undefined_function THEN
    -- pg_cron 未安装，跳过
    RAISE NOTICE 'pg_cron extension not available, skipping cron job creation';
END;
$$;

-- ============================================
-- 辅助函数：领取预创建模板（原子操作）
-- ============================================

CREATE OR REPLACE FUNCTION claim_precreated_template(
  p_template_key text,
  p_project_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  template_key text,
  storage_bucket text,
  storage_prefix text,
  code_snapshot jsonb,
  file_manifest jsonb,
  total_files integer,
  total_size bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE precreated_templates pt
  SET 
    status = 'reserved',
    reserved_at = NOW(),
    reserved_project_id = p_project_id,
    reserved_by_user_id = p_user_id,
    updated_at = NOW()
  WHERE pt.id = (
    SELECT pt2.id FROM precreated_templates pt2
    WHERE pt2.status = 'ready'
      AND pt2.template_key = p_template_key
    ORDER BY pt2.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING 
    pt.id,
    pt.template_key,
    pt.storage_bucket,
    pt.storage_prefix,
    pt.code_snapshot,
    pt.file_manifest,
    pt.total_files,
    pt.total_size;
END;
$$;

-- ============================================
-- 辅助函数：标记模板为已消费
-- ============================================

CREATE OR REPLACE FUNCTION mark_template_consumed(p_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE precreated_templates
  SET 
    status = 'consumed',
    consumed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_template_id
    AND status = 'reserved';
END;
$$;

-- ============================================
-- 辅助函数：标记模板为失败（可选择回滚到 ready）
-- ============================================

CREATE OR REPLACE FUNCTION mark_template_failed(
  p_template_id uuid,
  p_error text,
  p_rollback_to_ready boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_rollback_to_ready THEN
    -- 回滚到 ready 状态（临时错误，可重试）
    UPDATE precreated_templates
    SET 
      status = 'ready',
      reserved_at = NULL,
      reserved_project_id = NULL,
      reserved_by_user_id = NULL,
      error = p_error,
      updated_at = NOW()
    WHERE id = p_template_id;
  ELSE
    -- 标记为 failed（永久错误，不可重试）
    UPDATE precreated_templates
    SET 
      status = 'failed',
      error = p_error,
      updated_at = NOW()
    WHERE id = p_template_id;
  END IF;
END;
$$;

-- ============================================
-- 辅助函数：获取模板池状态
-- ============================================

CREATE OR REPLACE FUNCTION get_template_pool_status(p_template_key text DEFAULT 'vite-react-ts')
RETURNS TABLE (
  status text,
  count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT pt.status, COUNT(*)
  FROM precreated_templates pt
  WHERE pt.template_key = p_template_key
  GROUP BY pt.status
  ORDER BY pt.status;
END;
$$;
