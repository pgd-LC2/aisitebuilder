import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Mail, Lock, AlertCircle } from 'lucide-react';

type LoginTab = 'email' | 'username';

interface LoginPageProps {
  onSwitchToSignUp: () => void;
}

export default function LoginPage({ onSwitchToSignUp }: LoginPageProps) {
  const [activeTab, setActiveTab] = useState<LoginTab>('email');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const { signIn, signInWithUsername } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!agreedToTerms) {
      setError('请先阅读并同意用户协议');
      return;
    }

    setLoading(true);

    let result;
    if (activeTab === 'email') {
      result = await signIn(email, password);
    } else {
      result = await signInWithUsername(username, password);
    }

    if (result.error) {
      if (activeTab === 'username' && result.error.message === '用户名不存在') {
        setError('用户名不存在');
      } else {
        setError(activeTab === 'email' ? '邮箱或密码错误，请重试' : '用户名或密码错误，请重试');
      }
      setLoading(false);
    }
  };

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
        <div className="backdrop-blur-xl bg-white/70 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.6)] border border-white/50 p-8">
          <div className="flex gap-6 mb-8 border-b border-gray-200/50 pb-4">
            <button
              onClick={() => setActiveTab('email')}
              className={`text-base font-medium transition-colors relative ${
                activeTab === 'email' 
                  ? 'text-blue-500' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              邮箱登录
              {activeTab === 'email' && (
                <span className="absolute -bottom-4 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('username')}
              className={`text-base font-medium transition-colors relative ${
                activeTab === 'username' 
                  ? 'text-blue-500' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              用户名登录
              {activeTab === 'username' && (
                <span className="absolute -bottom-4 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
              )}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 p-4 backdrop-blur-sm bg-red-50/80 border border-red-200/50 rounded-2xl text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {activeTab === 'email' ? (
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-12 pr-4 py-4 backdrop-blur-sm bg-white/50 border border-white/60 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-300/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] transition-all text-gray-700 placeholder-gray-400"
                  placeholder="邮箱地址"
                />
              </div>
            ) : (
              <div className="relative">
                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm font-medium">@</span>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full pl-12 pr-4 py-4 backdrop-blur-sm bg-white/50 border border-white/60 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-300/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] transition-all text-gray-700 placeholder-gray-400"
                  placeholder="用户名"
                />
              </div>
            )}

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-12 pr-4 py-4 backdrop-blur-sm bg-white/50 border border-white/60 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-300/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] transition-all text-gray-700 placeholder-gray-400"
                placeholder="密码"
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex-shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-5 h-5 rounded-md border-2 border-gray-300 bg-white/50 backdrop-blur-sm peer-checked:bg-blue-500 peer-checked:border-blue-500 transition-all flex items-center justify-center">
                  {agreedToTerms && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-sm text-gray-600 leading-relaxed">
                阅读并同意
                <a href="#" className="text-blue-500 hover:text-blue-600 mx-1">用户协议</a>
                、
                <a href="#" className="text-blue-500 hover:text-blue-600 mx-1">付费服务协议</a>
                和
                <a href="#" className="text-blue-500 hover:text-blue-600 ml-1">隐私政策</a>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="relative w-full py-4 rounded-2xl backdrop-blur-sm bg-blue-500/90 hover:bg-blue-600/90 disabled:bg-gray-300/80 disabled:cursor-not-allowed text-white font-medium shadow-[0_4px_16px_rgba(59,130,246,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] border border-blue-400/30 transition-all duration-200 overflow-hidden group"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
              <span className="relative z-10">{loading ? '登录中...' : '登录/注册'}</span>
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              还没有账户？{' '}
              <button
                onClick={onSwitchToSignUp}
                className="text-blue-500 hover:text-blue-600 font-medium transition-colors"
              >
                立即注册
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
