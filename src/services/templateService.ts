import { supabase } from '../lib/supabase';

interface InitializeProjectResponse {
  success: boolean;
  versionId?: string;
  filesCreated?: number;
  filesError?: number;
  totalSize?: number;
  error?: string;
  details?: string;
}

export const templateService = {
  /**
   * 通过 Edge Function 初始化项目模板
   * 将模板生成和文件上传逻辑移到服务端执行，大幅提升初始化速度
   */
  async initializeProjectWithTemplate(
    projectId: string,
    projectTitle: string,
    projectDescription: string
  ): Promise<{ success: boolean; error?: any; versionId?: string }> {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        return { success: false, error: '未授权' };
      }

      // 调用 Edge Function 进行初始化
      const response = await fetch(`${supabaseUrl}/functions/v1/initialize-project`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          title: projectTitle,
          description: projectDescription
        })
      });

      const result: InitializeProjectResponse = await response.json();

      if (!response.ok) {
        console.error('初始化项目失败:', result.error, result.details);
        return { 
          success: false, 
          error: result.error || '初始化失败' 
        };
      }

      return { 
        success: result.success, 
        versionId: result.versionId,
        error: result.error
      };
    } catch (err) {
      console.error('初始化项目模板出错:', err);
      return { success: false, error: err };
    }
  }
};
