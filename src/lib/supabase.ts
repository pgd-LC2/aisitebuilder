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

export const refreshRealtimeAuth = async (options?: { forceReconnect?: boolean; ensureConnected?: boolean }): Promise<void> => {
  const forceReconnect = options?.forceReconnect ?? false;
  const ensureConnected = options?.ensureConnected ?? false;

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
    }

    const connected = isRealtimeSocketConnected();
    const shouldReconnect = tokenChanged || forceReconnect;
    const shouldEnsureConnect = ensureConnected && !connected;

    if (shouldReconnect) {
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
