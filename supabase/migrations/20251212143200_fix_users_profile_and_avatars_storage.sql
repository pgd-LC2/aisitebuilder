/*
  # 修复用户资料和头像存储问题

  ## 问题描述
  1. 老用户（在 users_profile 表创建之前注册的用户）没有对应的 users_profile 记录
     - 导致用户名修改时返回 406 Not Acceptable 错误（UPDATE 没有命中任何行）
  2. avatars 存储桶缺少 RLS 策略
     - 导致头像上传时返回 "new row violates row-level security policy" 错误

  ## 修复方案
  1. 为所有现有用户补充 users_profile 记录
  2. 为 avatars 存储桶添加 RLS 策略
*/

-- ============================================
-- 第一部分：补充老用户的 users_profile 记录
-- ============================================

-- 为所有没有 users_profile 记录的现有用户创建记录
INSERT INTO public.users_profile (user_id, username)
SELECT u.id, public.generate_random_username()
FROM auth.users u
LEFT JOIN public.users_profile p ON p.user_id = u.id
WHERE p.user_id IS NULL;

-- ============================================
-- 第二部分：为 avatars 存储桶添加 RLS 策略
-- ============================================

-- 删除可能存在的旧策略（避免重复创建）
DROP POLICY IF EXISTS "用户可以查看头像" ON storage.objects;
DROP POLICY IF EXISTS "用户可以上传自己的头像" ON storage.objects;
DROP POLICY IF EXISTS "用户可以更新自己的头像" ON storage.objects;
DROP POLICY IF EXISTS "用户可以删除自己的头像" ON storage.objects;

-- 策略1: 所有人可以查看头像（头像是公开的）
CREATE POLICY "用户可以查看头像"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
);

-- 策略2: 用户只能上传自己的头像
-- 文件路径格式：{user_id}/avatar.{ext}
CREATE POLICY "用户可以上传自己的头像"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 策略3: 用户只能更新自己的头像
CREATE POLICY "用户可以更新自己的头像"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 策略4: 用户只能删除自己的头像
CREATE POLICY "用户可以删除自己的头像"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
