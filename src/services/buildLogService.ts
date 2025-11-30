import { supabase } from '../lib/supabase';
import { BuildLog, BuildLogType } from '../types/project';
import { subscribeBuildLogs as subscribeToLogs } from '../realtime/subscribeBuildLogs';

export const buildLogService = {
  async addBuildLog(
    projectId: string,
    logType: BuildLogType,
    message: string,
    metadata?: Record<string, any>
  ): Promise<{ data: BuildLog | null; error: any }> {
    console.log('保存构建日志:', { projectId, logType, message });
    const { data, error } = await supabase
      .from('build_logs')
      .insert({
        project_id: projectId,
        log_type: logType,
        message,
        metadata: metadata || {}
      })
      .select()
      .maybeSingle();

    console.log('构建日志保存结果:', { data, error });
    return { data, error };
  },

  async getBuildLogsByProjectId(projectId: string, limit?: number): Promise<{ data: BuildLog[] | null; error: any }> {
    let query = supabase
      .from('build_logs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    return { data, error };
  },

  /**
   * 订阅构建日志
   * 
   * 使用统一的 realtime 封装，避免直接调用 supabase.channel()
   */
  subscribeToBuildLogs(projectId: string, callback: (log: BuildLog) => void) {
    // 调用统一封装并返回取消订阅函数
    const unsubscribe = subscribeToLogs({
      projectId,
      onLogCreated: callback,
      onError: (err) => console.error('[buildLogService] subscribe error', err)
    });

    // 为兼容旧接口，返回包含 unsubscribe 的对象
    return { unsubscribe };
  },

  async clearBuildLogs(projectId: string): Promise<{ error: any }> {
    const { error } = await supabase
      .from('build_logs')
      .delete()
      .eq('project_id', projectId);

    return { error };
  }
};
