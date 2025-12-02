import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

let currentRealtimeToken: string | null = null;
let refreshPromise: Promise<void> | null = null;

export const refreshRealtimeAuth = async (options?: { forceReconnect?: boolean }): Promise<void> => {
  const forceReconnect = options?.forceReconnect ?? false;

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

    if (tokenChanged || forceReconnect) {
      await supabase.realtime.disconnect();
      await supabase.realtime.connect();
    }
  })();

  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
};
