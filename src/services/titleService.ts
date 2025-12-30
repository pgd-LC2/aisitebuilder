import { supabase } from '../lib/supabase';

interface GenerateTitleResponse {
  title: string;
  reasoning?: string;
}

export const titleService = {
  async generateTitle(prompt: string): Promise<{ data: GenerateTitleResponse | null; error: Error | null }> {
    try {
      const { data, error } = await supabase.functions.invoke('generate-project-title', {
        body: { prompt }
      });

      if (error) {
        console.error('生成标题失败:', error);
        return { data: null, error: new Error(error.message || '生成标题失败') };
      }

      if (!data || !data.title) {
        return { data: null, error: new Error('AI 返回的标题为空') };
      }

      return { data: data as GenerateTitleResponse, error: null };
    } catch (err) {
      console.error('调用标题生成服务出错:', err);
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error(String(err)) 
      };
    }
  }
};
