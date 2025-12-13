/*
  # 修复 avatars 存储桶配置

  ## 问题描述
  之前的迁移文件 20251212143200_fix_users_profile_and_avatars_storage.sql 只添加了 RLS 策略，
  但没有将 avatars bucket 设置为 public，导致使用 publicUrl 访问头像时返回 "Bucket not found" 错误。

  ## 修复方案
  将 avatars bucket 设置为 public，使头像可以通过公开 URL 访问。
  头像是公开资源，任何用户都可以查看其他用户的头像。

  ## 相关错误
  - 错误信息：ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep
  - HTTP 状态码：400 (Bad Request)
  - 响应体：{"statusCode":"404","error":"Bucket not found","message":"Bucket not found"}
*/

-- 将 avatars bucket 设置为 public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'avatars';
