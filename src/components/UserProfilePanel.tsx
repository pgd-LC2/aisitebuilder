import { useState, useRef, useEffect } from 'react';
import { X, FlaskConical, Bell, Shield, Palette, Camera, Check, Loader2, User, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { userProfileService, UserProfile } from '../services/userProfileService';

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

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: '个人资料', icon: <User className="w-4 h-4" /> },
    { id: 'preferences', label: '偏好设置', icon: <Palette className="w-4 h-4" /> },
    { id: 'notifications', label: '通知', icon: <Bell className="w-4 h-4" /> },
    { id: 'security', label: '安全', icon: <Shield className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-[90vw] max-w-5xl h-[60vh] min-h-[400px] max-h-[600px] mx-4 bg-white rounded-2xl shadow-2xl flex overflow-hidden">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarChange}
          className="hidden"
        />

        <div className="w-56 bg-gray-50 border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <p className="text-sm font-medium text-gray-500">Personal Settings</p>
          </div>

          <nav className="flex-1 p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={handleAvatarClick}
                disabled={isUploadingAvatar}
                className="relative w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-blue-200 to-blue-300 flex-shrink-0 group"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="头像" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex items-center justify-center h-full text-white text-sm font-bold">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {isUploadingAvatar ? (
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4 text-white" />
                  )}
                </div>
              </button>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                <p className="text-xs text-gray-500 truncate">{email}</p>
              </div>
            </div>
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                退出登录
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              {tabs.find(t => t.id === activeTab)?.label}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              aria-label="关闭"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6">
          {activeTab === 'profile' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  用户名
                </label>
                {isEditingUsername ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => {
                        setNewUsername(e.target.value);
                        validateUsername(e.target.value);
                      }}
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                        usernameError ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="输入新用户名"
                    />
                    {usernameError && (
                      <p className="text-xs text-red-500">{usernameError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveUsername}
                        disabled={isSavingUsername || !!usernameError}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                      >
                        {isSavingUsername ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        保存
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingUsername(false);
                          setNewUsername(userProfile?.username || '');
                          setUsernameError('');
                        }}
                        className="px-3 py-1.5 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-900">{userProfile?.username || '未设置'}</span>
                    <button
                      onClick={() => setIsEditingUsername(true)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      编辑
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  邮箱地址
                </label>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-900">{email}</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                实验性功能
              </p>
              <div className="p-4 border border-dashed border-purple-200 rounded-xl bg-purple-50/60 flex gap-3">
                <div className="text-purple-500">
                  <FlaskConical className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">预加载 node_modules</p>
                      <p className="text-xs text-gray-600">
                        复用 WebContainer 内的 node_modules 缓存，加速预览启动。
                      </p>
                    </div>
                    <label className="inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={preloadNodeModules}
                        onChange={event => onTogglePreload(event.target.checked)}
                      />
                      <span
                        className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors ${
                          preloadNodeModules ? 'bg-purple-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`bg-white w-4 h-4 rounded-full shadow transform transition-transform ${
                            preloadNodeModules ? 'translate-x-5' : ''
                          }`}
                        />
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="text-xs text-gray-500 leading-5">
                <p>实验性功能可能带来不可预期的行为，请在遇到问题时尝试关闭相应开关。</p>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-600">通知设置</p>
              <p className="text-xs text-gray-400 mt-1">即将推出，敬请期待</p>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Shield className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-600">安全设置</p>
              <p className="text-xs text-gray-400 mt-1">即将推出，敬请期待</p>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
