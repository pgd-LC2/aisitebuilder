import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setUser(data.session?.user ?? null);
      await refreshRealtimeAuth({ forceReconnect: true, ensureConnected: true });
      setLoading(false);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        console.log('[AuthContext] onAuthStateChange:', event);

        // 当认证状态变化时，刷新 Realtime 鉴权并重置连接，确保使用最新的 token
        // 优化处理顺序：先递增 authVersion，让 Hook 知道即将重建订阅，然后清理旧连接
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
          // 1. 先递增 authVersion，让 Hook 知道即将重建订阅（旧回调会被忽略）
          setAuthVersion(v => v + 1);
          
          // 2. 清理旧连接，传递 AUTH_CHANGE 作为关闭原因
          // 这样 Hook 可以区分「认证变化导致的预期关闭」和「异常关闭」
          cleanupRealtime('AUTH_CHANGE');
          RealtimeClient.resetInstance();
          
          // 3. 最后刷新认证，建立新连接
          await refreshRealtimeAuth({ forceReconnect: true, ensureConnected: true });
          console.log('[AuthContext] 认证状态变化，重置 RealtimeClient，authVersion 已递增');
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
