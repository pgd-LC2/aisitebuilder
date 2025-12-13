/*
  # 修复 Supabase 性能和安全 Lint 问题

  ## 修复的问题

  ### 1. Function Search Path Mutable (安全问题)
  为以下函数设置 `search_path = ''`，防止搜索路径被恶意修改：
  - generate_random_username
  - handle_new_user
  - update_models_updated_at
  - update_prompts_updated_at
  - update_updated_at_column
  - update_version_file_stats

  ### 2. Auth RLS Initialization Plan (性能问题)
  将 RLS 策略中的 `auth.uid()` 替换为 `(select auth.uid())`，避免每行重复计算：
  - users_profile 表的策略
  - agent_events 表的策略
  - file_events 表的策略

  ### 3. Multiple Permissive Policies (性能问题)
  合并 users_profile 表上重复的 SELECT 策略：
  - 删除 "Users can view own profile" 策略
  - 保留并修复 "users_profile_select_policy" 策略

  ## 参考文档
  - https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
  - https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
  - https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies
*/

BEGIN;

-- ============================================
-- 第一部分：修复 Function Search Path Mutable
-- ============================================

-- 1. 修复 generate_random_username 函数
CREATE OR REPLACE FUNCTION public.generate_random_username()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_username TEXT;
  username_exists BOOLEAN;
BEGIN
  LOOP
    new_username := 'user_' || substr(md5(random()::text), 1, 8);
    SELECT EXISTS(SELECT 1 FROM public.users_profile WHERE username = new_username) INTO username_exists;
    IF NOT username_exists THEN
      RETURN new_username;
    END IF;
  END LOOP;
END;
$$;

-- 2. 修复 handle_new_user 函数
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users_profile (user_id, username)
  VALUES (NEW.id, public.generate_random_username());
  RETURN NEW;
END;
$$;

-- 3. 修复 update_models_updated_at 函数
CREATE OR REPLACE FUNCTION public.update_models_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 4. 修复 update_prompts_updated_at 函数
CREATE OR REPLACE FUNCTION public.update_prompts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 5. 修复 update_updated_at_column 函数
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 6. 修复 update_version_file_stats 函数
CREATE OR REPLACE FUNCTION public.update_version_file_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.project_versions
    SET 
      total_files = COALESCE(total_files, 0) + 1,
      total_size = COALESCE(total_size, 0) + NEW.file_size
    WHERE id = NEW.version_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.project_versions
    SET 
      total_files = GREATEST(COALESCE(total_files, 0) - 1, 0),
      total_size = GREATEST(COALESCE(total_size, 0) - OLD.file_size, 0)
    WHERE id = OLD.version_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.version_id != OLD.version_id THEN
    UPDATE public.project_versions
    SET 
      total_files = GREATEST(COALESCE(total_files, 0) - 1, 0),
      total_size = GREATEST(COALESCE(total_size, 0) - OLD.file_size, 0)
    WHERE id = OLD.version_id;
    UPDATE public.project_versions
    SET 
      total_files = COALESCE(total_files, 0) + 1,
      total_size = COALESCE(total_size, 0) + NEW.file_size
    WHERE id = NEW.version_id;
  END IF;
  RETURN NULL;
END;
$$;

-- ============================================
-- 第二部分：修复 Multiple Permissive Policies
-- ============================================

-- 删除重复的 SELECT 策略 "Users can view own profile"
DROP POLICY IF EXISTS "Users can view own profile" ON public.users_profile;

-- 修复 users_profile_select_policy（当前 qual = true，需要改为正确的权限检查）
DROP POLICY IF EXISTS "users_profile_select_policy" ON public.users_profile;
CREATE POLICY "users_profile_select_policy" ON public.users_profile
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- ============================================
-- 第三部分：修复 Auth RLS Initialization Plan
-- ============================================

-- 修复 users_profile 表的 INSERT 策略
DROP POLICY IF EXISTS "users_profile_insert_policy" ON public.users_profile;
CREATE POLICY "users_profile_insert_policy" ON public.users_profile
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- 修复 users_profile 表的 UPDATE 策略
DROP POLICY IF EXISTS "users_profile_update_policy" ON public.users_profile;
CREATE POLICY "users_profile_update_policy" ON public.users_profile
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- 修复 agent_events 表的 SELECT 策略
DROP POLICY IF EXISTS "用户可以查看自己项目的 Agent 事件" ON public.agent_events;
CREATE POLICY "用户可以查看自己项目的 Agent 事件"
  ON public.agent_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = agent_events.project_id
      AND projects.user_id = (select auth.uid())
    )
  );

-- 修复 agent_events 表的 INSERT 策略
DROP POLICY IF EXISTS "用户可以创建自己项目的 Agent 事件" ON public.agent_events;
CREATE POLICY "用户可以创建自己项目的 Agent 事件"
  ON public.agent_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = agent_events.project_id
      AND projects.user_id = (select auth.uid())
    )
  );

-- 修复 file_events 表的 SELECT 策略
DROP POLICY IF EXISTS "用户可以查看自己项目的文件事件" ON public.file_events;
CREATE POLICY "用户可以查看自己项目的文件事件"
  ON public.file_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = file_events.project_id
      AND projects.user_id = (select auth.uid())
    )
  );

-- 修复 file_events 表的 INSERT 策略
DROP POLICY IF EXISTS "用户可以创建自己项目的文件事件" ON public.file_events;
CREATE POLICY "用户可以创建自己项目的文件事件"
  ON public.file_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = file_events.project_id
      AND projects.user_id = (select auth.uid())
    )
  );

COMMIT;
