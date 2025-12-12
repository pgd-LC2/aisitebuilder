-- 创建用户资料表
CREATE TABLE IF NOT EXISTS public.users_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT users_profile_user_id_unique UNIQUE (user_id),
  CONSTRAINT users_profile_username_unique UNIQUE (username),
  CONSTRAINT users_profile_username_format CHECK (username ~ '^[a-zA-Z0-9_]{3,20}$')
);

-- 添加表注释
COMMENT ON TABLE public.users_profile IS '用户资料表，存储用户名和其他个人信息';
COMMENT ON COLUMN public.users_profile.id IS '资料唯一标识符，UUID格式，自动生成';
COMMENT ON COLUMN public.users_profile.user_id IS '关联的认证用户ID，引用 auth.users 表';
COMMENT ON COLUMN public.users_profile.username IS '用户名，3-20个字符，只能包含字母、数字和下划线';
COMMENT ON COLUMN public.users_profile.display_name IS '显示名称，可选';
COMMENT ON COLUMN public.users_profile.avatar_url IS '头像URL，可选';
COMMENT ON COLUMN public.users_profile.created_at IS '创建时间';
COMMENT ON COLUMN public.users_profile.updated_at IS '更新时间';

-- 启用 RLS
ALTER TABLE public.users_profile ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户可以查看所有用户资料（用于用户名查找）
CREATE POLICY "users_profile_select_policy" ON public.users_profile
  FOR SELECT USING (true);

-- RLS 策略：用户只能更新自己的资料
CREATE POLICY "users_profile_update_policy" ON public.users_profile
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS 策略：用户只能插入自己的资料
CREATE POLICY "users_profile_insert_policy" ON public.users_profile
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 创建函数：生成随机用户名
CREATE OR REPLACE FUNCTION public.generate_random_username()
RETURNS TEXT AS $$
DECLARE
  new_username TEXT;
  username_exists BOOLEAN;
BEGIN
  LOOP
    -- 生成格式：user_随机8位字符
    new_username := 'user_' || substr(md5(random()::text), 1, 8);
    
    -- 检查用户名是否已存在
    SELECT EXISTS(SELECT 1 FROM public.users_profile WHERE username = new_username) INTO username_exists;
    
    -- 如果不存在则返回
    IF NOT username_exists THEN
      RETURN new_username;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建函数：在用户注册时自动创建资料
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users_profile (user_id, username)
  VALUES (NEW.id, public.generate_random_username());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器：在 auth.users 插入新用户时自动创建资料
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 创建索引：加速用户名查找
CREATE INDEX IF NOT EXISTS users_profile_username_idx ON public.users_profile (username);
CREATE INDEX IF NOT EXISTS users_profile_user_id_idx ON public.users_profile (user_id);

-- 创建函数：通过用户名获取用户邮箱（用于登录）
CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username TEXT)
RETURNS TEXT AS $$
DECLARE
  user_email TEXT;
BEGIN
  SELECT au.email INTO user_email
  FROM public.users_profile up
  JOIN auth.users au ON up.user_id = au.id
  WHERE up.username = p_username;
  
  RETURN user_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
