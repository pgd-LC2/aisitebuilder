import { useState, useRef, useEffect } from 'react';
import { FlaskConical, Bell, Shield, Palette, Camera, Check, Loader2, User, LogOut } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { userProfileService, UserProfile } from '../../services/userProfileService';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface UserProfilePanelProps {
  open: boolean;
  onClose: () => void;
  email: string;
  userId: string;
  userProfile: UserProfile | null;
  preloadNodeModules: boolean;
  onTogglePreload: (value: boolean) => void;
  onProfileUpdate?: () => void;
  onSignOut?: () => void;
}

type SettingsTab = 'profile' | 'preferences' | 'notifications' | 'security';

export default function UserProfilePanel({
  open,
  onClose,
  email,
  userId,
  userProfile,
  preloadNodeModules,
  onTogglePreload,
  onProfileUpdate,
  onSignOut
}: UserProfilePanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (userProfile) {
      setNewUsername(userProfile.username);
    }
  }, [userProfile]);

  if (!open) {
    return null;
  }

  const validateUsername = (value: string) => {
    if (!value) {
      setUsernameError('用户名不能为空');
      return false;
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

  const handleSaveUsername = async () => {
    if (!validateUsername(newUsername)) return;
    if (newUsername === userProfile?.username) {
      setIsEditingUsername(false);
      return;
    }

    const { data: isAvailable } = await userProfileService.checkUsernameAvailable(newUsername);
    if (!isAvailable) {
      setUsernameError('该用户名已被使用');
      return;
    }

    setIsSavingUsername(true);
    const { error } = await userProfileService.updateProfile(userId, { username: newUsername });
    setIsSavingUsername(false);

    if (error) {
      setUsernameError('保存失败，请重试');
    } else {
      setIsEditingUsername(false);
      onProfileUpdate?.();
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('头像文件大小不能超过 2MB');
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setAvatarPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);

    setIsUploadingAvatar(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/avatar.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      console.error('头像上传失败:', uploadError);
      setIsUploadingAvatar(false);
      alert('头像上传失败，请重试');
      return;
    }

    const optimizedUrl = userProfileService.getOptimizedAvatarUrl(fileName, {
      width: 200,
      height: 200,
      quality: 80,
      resize: 'cover'
    });

    await userProfileService.updateProfile(userId, { avatar_url: optimizedUrl });
    setIsUploadingAvatar(false);
    onProfileUpdate?.();
  };

  const displayName = userProfile?.display_name || userProfile?.username || email.split('@')[0];
  const avatarUrl = avatarPreview || userProfile?.avatar_url;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl h-[60vh] min-h-[400px] max-h-[600px] p-0 gap-0">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          className="hidden"
        />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SettingsTab)} className="flex h-full">
          <div className="w-56 bg-muted/50 border-r flex flex-col">
            <div className="p-4 border-b">
              <p className="text-sm font-medium text-muted-foreground">Personal Settings</p>
            </div>

            <TabsList className="flex-1 flex flex-col items-stretch justify-start p-2 h-auto bg-transparent">
              <TabsTrigger
                value="profile"
                className="justify-start gap-2.5 px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <User className="w-4 h-4" />
                个人资料
              </TabsTrigger>
              <TabsTrigger
                value="preferences"
                className="justify-start gap-2.5 px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Palette className="w-4 h-4" />
                偏好设置
              </TabsTrigger>
              <TabsTrigger
                value="notifications"
                className="justify-start gap-2.5 px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Bell className="w-4 h-4" />
                通知
              </TabsTrigger>
              <TabsTrigger
                value="security"
                className="justify-start gap-2.5 px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <Shield className="w-4 h-4" />
                安全
              </TabsTrigger>
            </TabsList>

            <div className="p-4 border-t">
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={handleAvatarClick}
                  disabled={isUploadingAvatar}
                  className="relative flex-shrink-0 group"
                >
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={avatarUrl || undefined} alt="头像" />
                    <AvatarFallback className="bg-gradient-to-br from-blue-200 to-blue-300 text-white text-sm font-bold">
                      {displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    {isUploadingAvatar ? (
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4 text-white" />
                    )}
                  </div>
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{email}</p>
                </div>
              </div>
              {onSignOut && (
                <Button
                  variant="ghost"
                  onClick={onSignOut}
                  className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  退出登录
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <DialogHeader className="px-6 py-4 border-b">
              <DialogTitle>
                {activeTab === 'profile' && '个人资料'}
                {activeTab === 'preferences' && '偏好设置'}
                {activeTab === 'notifications' && '通知'}
                {activeTab === 'security' && '安全'}
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <TabsContent value="profile" className="mt-0 space-y-4">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    用户名
                  </Label>
                  {isEditingUsername ? (
                    <div className="space-y-2 mt-2">
                      <Input
                        type="text"
                        value={newUsername}
                        onChange={(e) => {
                          setNewUsername(e.target.value);
                          validateUsername(e.target.value);
                        }}
                        className={cn(usernameError && 'border-destructive')}
                        placeholder="输入新用户名"
                      />
                      {usernameError && (
                        <p className="text-xs text-destructive">{usernameError}</p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleSaveUsername}
                          disabled={isSavingUsername || !!usernameError}
                        >
                          {isSavingUsername ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                          ) : (
                            <Check className="w-3.5 h-3.5 mr-1" />
                          )}
                          保存
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setIsEditingUsername(false);
                            setNewUsername(userProfile?.username || '');
                            setUsernameError('');
                          }}
                        >
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg mt-2">
                      <span className="text-sm">{userProfile?.username || '未设置'}</span>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => setIsEditingUsername(true)}
                        className="h-auto p-0"
                      >
                        编辑
                      </Button>
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    邮箱地址
                  </Label>
                  <div className="p-3 bg-muted rounded-lg mt-2">
                    <span className="text-sm">{email}</span>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preferences" className="mt-0 space-y-4">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  实验性功能
                </Label>
                <Card className="border-dashed border-purple-200 bg-purple-50/60">
                  <CardContent className="p-4 flex gap-3">
                    <div className="text-purple-500">
                      <FlaskConical className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">预加载 node_modules</p>
                          <p className="text-xs text-muted-foreground">
                            复用 WebContainer 内的 node_modules 缓存，加速预览启动。
                          </p>
                        </div>
                        <Switch
                          checked={preloadNodeModules}
                          onCheckedChange={onTogglePreload}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <p className="text-xs text-muted-foreground leading-5">
                  实验性功能可能带来不可预期的行为，请在遇到问题时尝试关闭相应开关。
                </p>
              </TabsContent>

              <TabsContent value="notifications" className="mt-0">
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Bell className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">通知设置</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">即将推出，敬请期待</p>
                </div>
              </TabsContent>

              <TabsContent value="security" className="mt-0">
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Shield className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">安全设置</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">即将推出，敬请期待</p>
                </div>
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
