import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

let currentRealtimeToken: string | null = null;
let refreshPromise: Promise<void> | null = null;

const isRealtimeSocketConnected = (): boolean => {
  const socket = (supabase.realtime as unknown as { socket?: { isConnected?: () => boolean; connectionState?: string } }).socket;
  if (!socket) return false;

  if (typeof socket.isConnected === 'function') {
    return socket.isConnected();
  }

  return socket.connectionState === 'open';
};

export const refreshRealtimeAuth = async (options?: { 
  forceReconnect?: boolean; 
  ensureConnected?: boolean;
  skipReconnectOnTokenChange?: boolean;
}): Promise<void> => {
  const forceReconnect = options?.forceReconnect ?? false;
  const ensureConnected = options?.ensureConnected ?? false;
  const skipReconnectOnTokenChange = options?.skipReconnectOnTokenChange ?? false;

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? supabaseAnonKey;
    const tokenChanged = currentRealtimeToken !== token;

    if (tokenChanged) {
      currentRealtimeToken = token;
      supabase.realtime.setAuth(token);
      console.log('[supabase] Token 已更新，通过 setAuth 推送到现有连接');
    }

    const connected = isRealtimeSocketConnected();
    
    // 关键修改：TOKEN_REFRESHED 时跳过重连
    // setAuth 会自动将新 token 推送到已连接的 channels，无需 disconnect/connect
    const shouldReconnect = forceReconnect || (tokenChanged && !skipReconnectOnTokenChange);
    const shouldEnsureConnect = ensureConnected && !connected;

    if (shouldReconnect) {
      console.log('[supabase] 执行 disconnect/connect');
      await supabase.realtime.disconnect();
    }

    if (shouldReconnect || shouldEnsureConnect) {
      await supabase.realtime.connect();
    }
  })();

  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
};
