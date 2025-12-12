import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserPlus, Mail, Lock, AlertCircle, CheckCircle } from 'lucide-react';

interface SignUpPageProps {
  onSwitchToLogin: () => void;
}

export default function SignUpPage({ onSwitchToLogin }: SignUpPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (password.length < 6) {
      setError('密码长度至少为 6 个字符');
      return;
    }

    setLoading(true);

    const { error } = await signUp(email, password);

    if (error) {
      setError('注册失败，请重试');
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  if (success) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 px-4 relative overflow-hidden">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-32 -right-32 w-96 h-96 opacity-50">
              <img 
                src="/images/gradient-flower.webp" 
                alt="" 
                className="w-full h-full object-cover blur-2xl scale-150 rotate-12"
              />
            </div>
            <div className="absolute -bottom-32 -left-32 w-96 h-96 opacity-40">
              <img 
                src="/images/gradient-blue.webp" 
                alt="" 
                className="w-full h-full object-cover blur-xl scale-150 -rotate-12"
              />
            </div>
            <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-80 h-80 opacity-35">
              <img 
                src="/images/gradient-wave.webp" 
                alt="" 
                className="w-full h-full object-cover blur-2xl scale-125 rotate-45"
              />
            </div>
          </div>

        <div className="w-full max-w-md relative z-10">
          <div className="backdrop-blur-xl bg-white/70 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.6)] border border-white/50 p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full backdrop-blur-md bg-green-500/80 border border-green-400/50 shadow-[0_8px_32px_rgba(34,197,94,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] mb-4">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">注册成功！</h2>
            <p className="text-gray-600 mb-6">你的账户已创建，现在可以登录了</p>
            <button
              onClick={onSwitchToLogin}
              className="relative w-full py-3 rounded-full backdrop-blur-sm bg-blue-500/90 hover:bg-blue-600/90 text-white font-medium shadow-[0_4px_16px_rgba(59,130,246,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] border border-blue-400/30 transition-all duration-200 overflow-hidden group"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
              <span className="relative z-10">前往登录</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 px-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 opacity-60">
          <img 
            src="/images/gradient-wave.webp" 
            alt="" 
            className="w-full h-full object-cover blur-2xl scale-150 rotate-12"
          />
        </div>
        <div className="absolute -bottom-32 -left-32 w-96 h-96 opacity-50">
          <img 
            src="/images/gradient-pink.webp" 
            alt="" 
            className="w-full h-full object-cover blur-xl scale-150 -rotate-12"
          />
        </div>
        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-80 h-80 opacity-40">
          <img 
            src="/images/gradient-blue.webp" 
            alt="" 
            className="w-full h-full object-cover blur-2xl scale-125 rotate-45"
          />
        </div>
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 opacity-35">
          <img 
            src="/images/gradient-flower.webp" 
            alt="" 
            className="w-full h-full object-cover blur-xl scale-110 -rotate-6"
          />
        </div>
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full backdrop-blur-md bg-blue-500/80 border border-blue-400/50 shadow-[0_8px_32px_rgba(59,130,246,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] mb-4">
            <UserPlus className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">创建账户</h1>
          <p className="text-gray-600">开始使用 AI BUILD</p>
        </div>

        <div className="backdrop-blur-xl bg-white/70 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.6)] border border-white/50 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="flex items-center gap-2 p-4 backdrop-blur-sm bg-red-50/80 border border-red-200/50 rounded-2xl text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                邮箱地址
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 backdrop-blur-sm bg-white/50 border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-300/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] transition-all"
                  placeholder="your@email.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                密码
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 backdrop-blur-sm bg-white/50 border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-300/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] transition-all"
                  placeholder="至少 6 个字符"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                确认密码
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 backdrop-blur-sm bg-white/50 border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-300/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] transition-all"
                  placeholder="再次输入密码"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="relative w-full py-3 rounded-full backdrop-blur-sm bg-blue-500/90 hover:bg-blue-600/90 disabled:bg-gray-300/80 disabled:cursor-not-allowed text-white font-medium shadow-[0_4px_16px_rgba(59,130,246,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] border border-blue-400/30 transition-all duration-200 overflow-hidden group"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
              <span className="relative z-10">{loading ? '注册中...' : '注册'}</span>
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              已有账户？{' '}
              <button
                onClick={onSwitchToLogin}
                className="text-blue-500 hover:text-blue-600 font-medium transition-colors"
              >
                立即登录
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
