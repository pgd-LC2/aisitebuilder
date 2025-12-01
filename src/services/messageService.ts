import { supabase } from '../lib/supabase';
import { ChatMessage, MessageRole } from '../types/project';
import { subscribeToTable } from '../realtime/realtimeClient';

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

  async getMessageById(messageId: string): Promise<{ data: ChatMessage | null; error: any }> {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('id', messageId)
      .maybeSingle();

    return { data, error };
  },

  /**
   * 订阅消息
   * 
   * 使用统一的 realtime 封装，避免直接调用 supabase.channel()
   * 返回取消订阅函数（与旧接口不同，旧接口返回 channel 对象）
   */
  subscribeToMessages(projectId: string, callback: (message: ChatMessage) => void) {
    // 调用统一封装并返回取消订阅函数
    const unsubscribe = subscribeToTable<ChatMessage>(
      `chat-messages-${projectId}`,
      'chat_messages',
      'INSERT',
      `project_id=eq.${projectId}`,
      (message) => {
        callback(message);
      }
    );

    // 为兼容旧接口，返回包含 unsubscribe 的对象
    // 注意：如果调用方期待的是 channel 对象，需要更新调用方
    return { unsubscribe };
  },

  async clearMessages(projectId: string): Promise<{ error: any }> {
    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .eq('project_id', projectId);

    return { error };
  }
};
