import { supabase } from '../lib/supabase';
import { AITask, AITaskType, ProjectFilesContext } from '../types/project';

export const aiTaskService = {
  async addTask(
    projectId: string,
    type: AITaskType,
    payload: Record<string, any>
  ): Promise<{ data: AITask | null; error: any }> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return { data: null, error: new Error('User not authenticated') };
    }

    const { data, error } = await supabase
      .from('ai_tasks')
      .insert({
        project_id: projectId,
        user_id: user.id,
        type,
        payload,
        status: 'queued'
      })
      .select()
      .maybeSingle();

    return { data, error };
  },

  async triggerProcessor(
    projectId: string,
    projectFilesContext?: ProjectFilesContext
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await supabase.functions.invoke('process-ai-tasks', {
      body: { projectId, projectFilesContext }
    });

    return { data, error };
  },

  async getTask(taskId: string): Promise<{ data: AITask | null; error: any }> {
    const { data, error } = await supabase
      .from('ai_tasks')
      .select('*')
      .eq('id', taskId)
      .maybeSingle();

    return { data, error };
  },

  async getTasksByProjectId(projectId: string): Promise<{ data: AITask[] | null; error: any }> {
    const { data, error } = await supabase
      .from('ai_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    return { data, error };
  },

  subscribeToTasks(projectId: string, callback: (task: AITask) => void) {
    const channel = supabase
      .channel(`ai-tasks-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ai_tasks',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          callback(payload.new as AITask);
        }
      )
      .subscribe();

    return channel;
  }
};
