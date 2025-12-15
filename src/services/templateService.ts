import { supabase } from '../lib/supabase';

interface InitializeProjectResponse {
  success: boolean;
  versionId?: string;
  filesCreated?: number;
  filesError?: number;
  totalSize?: number;
  error?: string;
  details?: string;
  usedPrecreatedTemplate?: boolean;
  templateId?: string;
  fallback?: boolean;
}

interface EnsurePoolResponse {
  success: boolean;
  action?: string;
  message?: string;
  poolStatus?: {
    ready_count: number;
    creating_count: number;
    reserved_count: number;
    total_active: number;
  };
  error?: string;
}

export const templateService = {
  /**
   * 通过 Edge Function 初始化项目模板
   * 优先使用预创建模板，如果没有可用的预创建模板则降级到原有逻辑
   */
  async initializeProjectWithTemplate(
    projectId: string,
    projectTitle: string,
    projectDescription: string
  ): Promise<{ success: boolean; error?: unknown; versionId?: string; usedPrecreatedTemplate?: boolean }> {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        return { success: false, error: '未授权' };
      }

      // 优先调用新的 initialize-project-from-template Edge Function
      // 它会自动处理预创建模板和降级逻辑
      const response = await fetch(`${supabaseUrl}/functions/v1/initialize-project-from-template`, {
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

      // 记录是否使用了预创建模板
      if (result.usedPrecreatedTemplate) {
        console.log(`使用预创建模板初始化项目: ${result.templateId}`);
      } else if (result.fallback) {
        console.log('使用标准初始化流程（预创建模板池为空）');
      }

      return { 
        success: result.success, 
        versionId: result.versionId,
        usedPrecreatedTemplate: result.usedPrecreatedTemplate,
        error: result.error
      };
    } catch (err) {
      console.error('初始化项目模板出错:', err);
      return { success: false, error: err };
    }
  },

  /**
   * 确保模板池有足够的预创建模板
   * 这是一个 fire-and-forget 调用，不会阻塞用户操作
   */
  async ensureTemplatePool(): Promise<void> {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.warn('未授权，跳过模板池补充');
        return;
      }

      // Fire-and-forget 调用，不等待响应
      fetch(`${supabaseUrl}/functions/v1/ensure-template-pool`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateKey: 'vite-react-ts'
        })
      }).then(async (response) => {
        if (response.ok) {
          const result: EnsurePoolResponse = await response.json();
          console.log('模板池状态:', result.message, result.poolStatus);
        } else {
          console.warn('模板池补充请求失败');
        }
      }).catch((err) => {
        console.warn('模板池补充请求出错:', err);
      });
    } catch (err) {
      console.warn('确保模板池出错:', err);
    }
  }
};
