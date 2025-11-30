/**
 * Agent 事件订阅
 * 
 * 提供 AI 任务和聊天消息的实时订阅功能。
 * Step 3: 新增 agent_events 表订阅，支持实时 Activity Timeline 更新。
 */

import type { AITask, ChatMessage } from '../types/project';
import { subscribeToTable } from './realtimeClient';
import type { SubscribeAgentEventsOptions, DbAgentEvent } from './types';

/**
 * 订阅 Agent 事件（AI 任务更新、新消息、agent_events 表事件）
 * 
 * @param options 订阅选项
 * @returns 取消订阅函数
 */
export function subscribeAgentEvents(options: SubscribeAgentEventsOptions): () => void {
  const { projectId, onTaskUpdate, onMessageCreated, onAgentEvent, onError, onStatusChange } = options;

  if (!projectId) {
    console.warn('[subscribeAgentEvents] projectId 为空，跳过订阅');
    return () => {};
  }

  const unsubscribers: Array<() => void> = [];

  try {
    // 订阅 AI 任务更新
    if (onTaskUpdate) {
      const unsubscribeTask = subscribeToTable<AITask>(
        `agent-tasks-${projectId}`,
        'ai_tasks',
        'UPDATE',
        `project_id=eq.${projectId}`,
        (task) => {
          console.log('[subscribeAgentEvents] 收到任务更新:', task.id, task.status);
          onTaskUpdate(task);
        },
        onStatusChange
      );
      unsubscribers.push(unsubscribeTask);
    }

    // 订阅新消息
    if (onMessageCreated) {
      const unsubscribeMessage = subscribeToTable<ChatMessage>(
        `agent-messages-${projectId}`,
        'chat_messages',
        'INSERT',
        `project_id=eq.${projectId}`,
        (message) => {
          console.log('[subscribeAgentEvents] 收到新消息:', message.id, message.role);
          onMessageCreated(message);
        },
        onStatusChange
      );
      unsubscribers.push(unsubscribeMessage);
    }

    // Step 3: 订阅 agent_events 表（实时 Activity Timeline 事件）
    if (onAgentEvent) {
      const unsubscribeAgentEvent = subscribeToTable<DbAgentEvent>(
        `agent-events-${projectId}`,
        'agent_events',
        'INSERT',
        `project_id=eq.${projectId}`,
        (event) => {
          console.log('[subscribeAgentEvents] 收到 agent_events:', event.id, event.type);
          onAgentEvent(event);
        },
        onStatusChange
      );
      unsubscribers.push(unsubscribeAgentEvent);
    }

    console.log(`[subscribeAgentEvents] 已订阅项目 ${projectId} 的 Agent 事件`);
  } catch (error) {
    console.error('[subscribeAgentEvents] 订阅失败:', error);
    onError?.(error instanceof Error ? error : new Error(String(error)));
  }

  // 返回统一的取消订阅函数
  return () => {
    console.log(`[subscribeAgentEvents] 取消订阅项目 ${projectId} 的 Agent 事件`);
    unsubscribers.forEach(unsubscribe => unsubscribe());
  };
}

export default subscribeAgentEvents;
