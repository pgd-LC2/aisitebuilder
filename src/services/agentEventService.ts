/**
 * Agent Event Service
 * 
 * 提供 agent_events 表的 CRUD 操作，支持 UI 重放功能。
 * 
 * UI 重放流程：
 * 1. 页面加载时先拉取历史 agent_events 快照
 * 2. 按时间顺序 replay
 * 3. 再接 realtime 增量
 */

import { supabase } from '../lib/supabase';
import type { DbAgentEvent } from '../realtime/types';

/**
 * 获取项目的历史 agent_events
 * 用于 UI 重放
 */
export async function getAgentEventsByProjectId(
  projectId: string,
  options?: {
    taskId?: string;
    limit?: number;
    since?: string; // ISO timestamp
  }
): Promise<{ data: DbAgentEvent[] | null; error: Error | null }> {
  try {
    let query = supabase
      .from('agent_events')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (options?.taskId) {
      query = query.eq('task_id', options.taskId);
    }

    if (options?.since) {
      query = query.gte('created_at', options.since);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[agentEventService] 获取 agent_events 失败:', error);
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as DbAgentEvent[], error: null };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error('[agentEventService] 获取 agent_events 异常:', error);
    return { data: null, error };
  }
}

/**
 * 获取任务的历史 agent_events
 * 用于 UI 重放特定任务的进度
 */
export async function getAgentEventsByTaskId(
  taskId: string,
  options?: {
    limit?: number;
    since?: string; // ISO timestamp
  }
): Promise<{ data: DbAgentEvent[] | null; error: Error | null }> {
  try {
    let query = supabase
      .from('agent_events')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });

    if (options?.since) {
      query = query.gte('created_at', options.since);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[agentEventService] 获取任务 agent_events 失败:', error);
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as DbAgentEvent[], error: null };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    console.error('[agentEventService] 获取任务 agent_events 异常:', error);
    return { data: null, error };
  }
}

/**
 * 重放 agent_events
 * 按时间顺序处理事件，支持回调处理每个事件
 */
export async function replayAgentEvents(
  events: DbAgentEvent[],
  handlers: {
    onEvent?: (event: DbAgentEvent) => void;
    onStreamDelta?: (delta: string, messageId: string) => void;
    onStreamComplete?: (content: string, messageId: string) => void;
    onProgress?: (current: number, total: number) => void;
  }
): Promise<void> {
  const { onEvent, onStreamDelta, onStreamComplete, onProgress } = handlers;
  const total = events.length;

  // 用于累积流式消息
  const streamingMessages = new Map<string, string>();

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    
    // 通知进度
    onProgress?.(i + 1, total);
    
    // 通用事件回调
    onEvent?.(event);

    // 处理 progress 类型事件
    if (event.type === 'progress' && event.payload?.kind) {
      const { kind, delta, content, messageId } = event.payload;

      switch (kind) {
        case 'stream_delta':
          if (delta && messageId) {
            // 累积流式消息
            const existing = streamingMessages.get(messageId as string) || '';
            streamingMessages.set(messageId as string, existing + (delta as string));
            onStreamDelta?.(delta as string, messageId as string);
          }
          break;

        case 'stream_complete':
          if (messageId) {
            const finalContent = (content as string) || streamingMessages.get(messageId as string) || '';
            onStreamComplete?.(finalContent, messageId as string);
            streamingMessages.delete(messageId as string);
          }
          break;
      }
    }
  }
}

export const agentEventService = {
  getAgentEventsByProjectId,
  getAgentEventsByTaskId,
  replayAgentEvents
};

export default agentEventService;
