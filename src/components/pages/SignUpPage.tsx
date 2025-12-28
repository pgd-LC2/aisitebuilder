import { useState, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { UserPlus, Mail, Lock, AlertCircle, CheckCircle, User, Camera, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { userProfileService } from '../../services/userProfileService';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface SignUpPageProps {
  onSwitchToLogin: () => void;
  onBack?: () => void;
}

export default function SignUpPage({ onSwitchToLogin, onBack }: SignUpPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { signUp } = useAuth();

  const validateUsername = (value: string) => {
    if (!value) {
      setUsernameError('');
      return true;
    }
    if (value.length < 3) {
      setUsernameError('用户名至少需要 3 个字符');
      return false;
    }
    if (value.length > 20) {
      setUsernameError('用户名最多 20 个字符');
      return false;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      setUsernameError('用户名只能包含字母、数字和下划线');
      return false;
    }
    setUsernameError('');
    return true;
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUsername(value);
    validateUsername(value);
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setError('头像文件大小不能超过 2MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        setError('请选择图片文件');
        return;
      }
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadAvatar = async (userId: string): Promise<string | null> => {
    if (!avatarFile) return null;
    
    const fileExt = avatarFile.name.split('.').pop();
    const fileName = `${userId}/avatar.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, avatarFile, { upsert: true });
    
    if (uploadError) {
      console.error('头像上传失败:', uploadError);
      return null;
    }
    
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);
    
    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (username && !validateUsername(username)) {
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (password.length < 6) {
      setError('密码长度至少为 6 个字符');
      return;
    }

    if (username) {
      const { data: isAvailable } = await userProfileService.checkUsernameAvailable(username);
      if (!isAvailable) {
        setError('该用户名已被使用');
        return;
      }
    }

    setLoading(true);

    const { error, data } = await signUp(email, password);

    if (error) {
      setError('注册失败，请重试');
      setLoading(false);
    } else {
      if (data?.user && (username || avatarFile)) {
        let avatarUrl: string | null = null;
        if (avatarFile) {
          avatarUrl = await uploadAvatar(data.user.id);
        }
        
        if (username || avatarUrl) {
          await userProfileService.updateProfile(data.user.id, {
            ...(username && { username }),
            ...(avatarUrl && { avatar_url: avatarUrl }),
          });
        }
      }
      setSuccess(true);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden">
        <div className="w-full max-w-md relative z-10">
          <Card className="shadow-lg text-center">
            <CardContent className="pt-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500 mb-4">
                <CheckCircle className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold mb-2">注册成功！</CardTitle>
              <CardDescription className="mb-6">你的账户已创建，现在可以登录了</CardDescription>
              <Button
                onClick={onSwitchToLogin}
                className="w-full"
                size="lg"
              >
                前往登录
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden">
      <div className="w-full max-w-md relative z-10">
        {onBack && (
          <Button
            variant="ghost"
            onClick={onBack}
            className="flex items-center gap-2 mb-4 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">返回主页</span>
          </Button>
        )}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary mb-4">
            <UserPlus className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">创建账户</h1>
          <p className="text-muted-foreground">开始使用 AI BUILD</p>
        </div>

        <Card className="shadow-lg">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              <div className="flex flex-col items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  className="relative group"
                >
                  <Avatar className="w-20 h-20 border-2 border-dashed border-primary/50 hover:border-primary transition-colors">
                    {avatarPreview ? (
                      <AvatarImage src={avatarPreview} alt="头像预览" />
                    ) : (
                      <AvatarFallback className="bg-primary/10">
                        <Camera className="w-6 h-6 text-primary/60" />
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                </button>
                <p className="mt-2 text-xs text-muted-foreground">点击上传头像（可选）</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">
                  用户名 <span className="text-muted-foreground font-normal">（可选）</span>
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={handleUsernameChange}
                    className={`pl-10 ${usernameError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    placeholder="3-20个字符，字母、数字、下划线"
                  />
                </div>
                {usernameError && (
                  <p className="text-xs text-destructive">{usernameError}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">邮箱地址</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-10"
                    placeholder="your@email.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pl-10"
                    placeholder="至少 6 个字符"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">确认密码</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="pl-10"
                    placeholder="再次输入密码"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full"
                size="lg"
              >
                {loading ? '注册中...' : '注册'}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                已有账户？{' '}
                <Button
                  variant="link"
                  onClick={onSwitchToLogin}
                  className="p-0 h-auto font-medium"
                >
                  立即登录
                </Button>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
