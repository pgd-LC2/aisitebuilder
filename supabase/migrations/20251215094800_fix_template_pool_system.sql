/*
  # 修复模板池系统

  ## 问题修复

  1. **触发链断裂**：pg_cron 调用的数据库函数只发送 pg_notify，没有服务监听
     - 修复：使用 pg_net 直接调用 Edge Function

  2. **RPC 函数返回格式不匹配**：get_template_pool_status 返回多行，Edge Function 期望单个对象
     - 修复：创建新函数 get_template_pool_status_v2 返回正确格式

  3. **池容量配置**：从 2/3 调整为 20/50
     - 修复：更新 ensure_template_pool 函数中的配置

  4. **补池策略优化**：单次最多创建 1 个太慢
     - 修复：允许并发创建，提高补池效率
*/

-- ============================================
-- 1. 创建新的 RPC 函数返回正确格式
-- ============================================

CREATE OR REPLACE FUNCTION get_template_pool_status_v2(p_template_key text DEFAULT 'vite-react-ts')
RETURNS TABLE (
  ready_count bigint,
  creating_count bigint,
  reserved_count bigint,
  total_active bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(CASE WHEN pt.status = 'ready' THEN 1 ELSE 0 END), 0) as ready_count,
    COALESCE(SUM(CASE WHEN pt.status = 'creating' THEN 1 ELSE 0 END), 0) as creating_count,
    COALESCE(SUM(CASE WHEN pt.status = 'reserved' THEN 1 ELSE 0 END), 0) as reserved_count,
    COALESCE(SUM(CASE WHEN pt.status IN ('ready', 'creating', 'reserved') THEN 1 ELSE 0 END), 0) as total_active
  FROM precreated_templates pt
  WHERE pt.template_key = p_template_key;
END;
$$;

-- ============================================
-- 2. 更新 ensure_template_pool 函数
--    使用 pg_net 调用 Edge Function
-- ============================================

CREATE OR REPLACE FUNCTION ensure_template_pool()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  ready_count integer;
  creating_count integer;
  min_pool_size integer := 20;  -- 最小池大小（从 2 改为 20）
  max_pool_size integer := 50;  -- 最大池大小（从 3 改为 50）
  timeout_minutes integer := 5;  -- 超时时间（分钟）
  supabase_url text;
  anon_key text;
  request_id bigint;
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

  -- 2. 清理卡住的 creating 状态模板（超过 10 分钟）
  UPDATE precreated_templates
  SET 
    status = 'failed',
    error = 'creation_timeout',
    updated_at = NOW()
  WHERE status = 'creating'
    AND created_at < NOW() - interval '10 minutes';

  -- 3. 统计当前状态
  SELECT 
    COALESCE(SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'creating' THEN 1 ELSE 0 END), 0)
  INTO ready_count, creating_count
  FROM precreated_templates
  WHERE template_key = 'vite-react-ts'
    AND status IN ('ready', 'creating');

  -- 4. 如果 ready 数量不足且没有正在创建的，调用 Edge Function 补充
  -- 允许最多 5 个并发创建
  IF ready_count < min_pool_size AND creating_count < 5 THEN
    -- 获取 Supabase URL 和 anon key
    -- 注意：这些值需要通过 vault 或环境变量获取
    -- 这里使用项目的实际值
    supabase_url := 'https://bsiukgyvrfkanuhjkxuh.supabase.co';
    anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzaXVrZ3l2cmZrYW51aGpreHVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxNTQ1ODcsImV4cCI6MjA3NzczMDU4N30.A7UaQmTNR7FOBrdR7SuhwjdDjKBNawoBuYz9LC3SBDw';
    
    -- 使用 pg_net 调用 ensure-template-pool Edge Function
    -- net.http_post(url, body, params, headers, timeout_milliseconds)
    SELECT net.http_post(
      supabase_url || '/functions/v1/ensure-template-pool',
      '{"templateKey": "vite-react-ts"}'::jsonb,
      '{}'::jsonb,  -- params
      jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key,
        'apikey', anon_key
      ),
      5000  -- timeout 5 seconds
    ) INTO request_id;
    
    -- 记录调用（可选，用于调试）
    RAISE NOTICE 'Triggered ensure-template-pool Edge Function, request_id: %', request_id;
  END IF;
END;
$$;

-- ============================================
-- 3. 重新创建 pg_cron 任务
-- ============================================

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
-- 4. 添加注释说明
-- ============================================

COMMENT ON FUNCTION get_template_pool_status_v2(text) IS 
'获取模板池状态（v2版本），返回单行包含 ready_count, creating_count, reserved_count, total_active';

COMMENT ON FUNCTION ensure_template_pool() IS 
'确保模板池有足够的预创建模板。配置：min=20, max=50, 允许最多5个并发创建';
