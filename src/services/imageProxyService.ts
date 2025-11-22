import { supabase } from '../lib/supabase';

export const imageProxyService = {
  async getProxyUrl(filePath: string): Promise<string> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      console.error('VITE_SUPABASE_URL 未配置');
      return '';
    }
    
    const encodedPath = encodeURIComponent(filePath);
    return `${supabaseUrl}/functions/v1/proxy-image?path=${encodedPath}`;
  },

  async getProxyUrlByFileId(fileId: string): Promise<string> {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      console.error('VITE_SUPABASE_URL 未配置');
      return '';
    }
    
    return `${supabaseUrl}/functions/v1/proxy-image?fileId=${fileId}`;
  },

  async fetchImage(
    filePath: string
  ): Promise<{ data: Blob | null; error: any }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        return { data: null, error: new Error('未登录') };
      }

      const url = await this.getProxyUrl(filePath);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { data: null, error: new Error(`获取图片失败: ${errorText}`) };
      }

      const blob = await response.blob();
      return { data: blob, error: null };
    } catch (err) {
      console.error('获取图片异常:', err);
      return { data: null, error: err };
    }
  },

  async fetchImageByFileId(
    fileId: string
  ): Promise<{ data: Blob | null; error: any }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        return { data: null, error: new Error('未登录') };
      }

      const url = await this.getProxyUrlByFileId(fileId);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { data: null, error: new Error(`获取图片失败: ${errorText}`) };
      }

      const blob = await response.blob();
      return { data: blob, error: null };
    } catch (err) {
      console.error('获取图片异常:', err);
      return { data: null, error: err };
    }
  }
};
