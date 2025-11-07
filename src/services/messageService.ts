import { supabase } from '../lib/supabase';
import { ChatMessage, MessageRole } from '../types/project';

export const messageService = {
  async addMessage(
    projectId: string,
    role: MessageRole,
    content: string,
    metadata?: Record<string, any>
  ): Promise<{ data: ChatMessage | null; error: any }> {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        project_id: projectId,
        role,
        content,
        metadata: metadata || {}
      })
      .select()
      .maybeSingle();

    return { data, error };
  },

  async getMessagesByProjectId(projectId: string): Promise<{ data: ChatMessage[] | null; error: any }> {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    return { data, error };
  },

  subscribeToMessages(projectId: string, callback: (message: ChatMessage) => void) {
    const channel = supabase
      .channel(`chat-messages-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          callback(payload.new as ChatMessage);
        }
      )
      .subscribe();

    return channel;
  },

  async clearMessages(projectId: string): Promise<{ error: any }> {
    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .eq('project_id', projectId);

    return { error };
  }
};
