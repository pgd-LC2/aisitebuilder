import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, refreshRealtimeAuth } from '../lib/supabase';
import RealtimeClient, { cleanupRealtime } from '../realtime/realtimeClient';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authReady: boolean;
  authVersion: number;
  signUp: (email: string, password: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authVersion, setAuthVersion] = useState(0);
  
  // 保存上一个用户 ID，用于检测账号切换
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setUser(data.session?.user ?? null);
      // 初始化时记录用户 ID
      prevUserIdRef.current = data.session?.user?.id ?? null;
      await refreshRealtimeAuth({ forceReconnect: true, ensureConnected: true });
      setLoading(false);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        console.log('[AuthContext] onAuthStateChange:', event);

        // 根据不同的认证事件采用不同的处理策略
        // 核心原则：只在真正需要时（登出、切换账号）才做彻底重置
        if (event === 'SIGNED_OUT') {
          // 登出：需要彻底清理所有连接和订阅
          console.log('[AuthContext] 用户登出，执行彻底清理');
          setAuthVersion(v => v + 1);
          cleanupRealtime('AUTH_CHANGE');
          RealtimeClient.resetInstance();
          prevUserIdRef.current = null;
          // 登出后不需要重新连接，等待下次登录
        } else if (event === 'SIGNED_IN') {
          // 登录：需要区分是「首次登录/切换账号」还是「session 恢复」
          const newUserId = session?.user?.id ?? null;
          const isUserSwitch = prevUserIdRef.current !== null && prevUserIdRef.current !== newUserId;
          
          if (isUserSwitch) {
            // 切换账号：需要彻底清理旧用户的连接和订阅
            console.log('[AuthContext] 检测到账号切换，执行彻底清理', {
              prevUserId: prevUserIdRef.current,
              newUserId
            });
            setAuthVersion(v => v + 1);
            cleanupRealtime('AUTH_CHANGE');
            RealtimeClient.resetInstance();
          } else {
            // session 恢复（如标签页切换返回）：不需要重建连接
            console.log('[AuthContext] session 恢复，保持现有连接');
          }
          
          prevUserIdRef.current = newUserId;
          // 只在切换账号时 forceReconnect，session 恢复时只确保连接
          await refreshRealtimeAuth({ forceReconnect: isUserSwitch, ensureConnected: true });
        } else if (event === 'TOKEN_REFRESHED') {
          // Token 刷新：这是正常的后台行为，只需要更新 token，不需要重建连接
          // refreshRealtimeAuth 会自动处理 token 更新（通过 setAuth）
          console.log('[AuthContext] Token 刷新，仅更新认证信息');
          await refreshRealtimeAuth({ forceReconnect: false, ensureConnected: true });
        }

        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      return { error };
    } catch (error) {
      return { error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    } catch (error) {
      return { error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const authReady = !loading && user !== null;

  const value = {
    user,
    session,
    loading,
    authReady,
    authVersion,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
