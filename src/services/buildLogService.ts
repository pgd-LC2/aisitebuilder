import { supabase } from '../lib/supabase';
import { BuildLog, BuildLogType } from '../types/project';

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

  async subscribeToBuildLogs(projectId: string, callback: (log: BuildLog) => void) {
    const channel = supabase
      .channel(`build-logs-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'build_logs',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          callback(payload.new as BuildLog);
        }
      )
      .subscribe();

    return channel;
  },

  async clearBuildLogs(projectId: string): Promise<{ error: any }> {
    const { error } = await supabase
      .from('build_logs')
      .delete()
      .eq('project_id', projectId);

    return { error };
  }
};
