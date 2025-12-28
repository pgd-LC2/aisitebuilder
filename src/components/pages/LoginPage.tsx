import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Mail, Lock, AlertCircle, ArrowLeft, User } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type LoginTab = 'email' | 'username';

interface LoginPageProps {
  onSwitchToSignUp: () => void;
  onBack?: () => void;
}

export default function LoginPage({ onSwitchToSignUp, onBack }: LoginPageProps) {
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
        
        <Card className="shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl font-bold text-center">登录</CardTitle>
            <CardDescription className="text-center">
              选择登录方式开始使用
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as LoginTab)} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="email">邮箱登录</TabsTrigger>
                <TabsTrigger value="username">用户名登录</TabsTrigger>
              </TabsList>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <p className="text-sm">{error}</p>
                  </div>
                )}

                <TabsContent value="email" className="mt-0 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">邮箱地址</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required={activeTab === 'email'}
                        className="pl-10"
                        placeholder="your@email.com"
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="username" className="mt-0 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">用户名</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required={activeTab === 'username'}
                        className="pl-10"
                        placeholder="用户名"
                      />
                    </div>
                  </div>
                </TabsContent>

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
                      placeholder="密码"
                    />
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="terms"
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                    className="mt-0.5"
                  />
                  <Label
                    htmlFor="terms"
                    className={cn(
                      "text-sm font-normal leading-relaxed cursor-pointer",
                      !agreedToTerms && error && "text-destructive"
                    )}
                  >
                    阅读并同意
                    <a href="#" className="text-primary hover:underline mx-1">用户协议</a>
                    、
                    <a href="#" className="text-primary hover:underline mx-1">付费服务协议</a>
                    和
                    <a href="#" className="text-primary hover:underline ml-1">隐私政策</a>
                  </Label>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full"
                  size="lg"
                >
                  {loading ? '登录中...' : '登录'}
                </Button>
              </form>
            </Tabs>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                还没有账户？{' '}
                <Button
                  variant="link"
                  onClick={onSwitchToSignUp}
                  className="p-0 h-auto font-medium"
                >
                  立即注册
                </Button>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
