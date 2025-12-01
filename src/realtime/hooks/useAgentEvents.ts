/**
 * useAgentEvents Hook
 * 
 * 提供 AI 任务和聊天消息的实时订阅功能。
 * 组件通过此 hook 获取消息列表和任务状态，无需直接操作 Supabase。
 * 
 * 修复：使用 ref 存储回调函数，避免因回调变化导致的订阅循环。
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { AITask, ChatMessage } from '../../types/project';
import { messageService } from '../../services/messageService';
import { aiTaskService } from '../../services/aiTaskService';
import { imageProxyService } from '../../services/imageProxyService';
import { subscribeAgentEvents } from '../subscribeAgentEvents';
import type {
  AgentState,
  AgentAction,
  UseAgentEventsOptions,
  UseAgentEventsReturn,
  RealtimeSubscribeStatus
} from '../types';

// 初始状态
const initialState: AgentState = {
  currentTask: null,
  messages: [],
  isProcessing: false,
  lastError: null
};

// Agent 状态 Reducer
function agentReducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case 'SET_MESSAGES':
      return { ...state, messages: action.payload };
    
    case 'APPEND_MESSAGE': {
      // 去重检查
      if (state.messages.some(m => m.id === action.payload.id)) {
        return state;
      }
      return { ...state, messages: [...state.messages, action.payload] };
    }
    
    case 'SET_CURRENT_TASK':
      return { ...state, currentTask: action.payload };
    
    case 'TASK_UPDATED':
      return {
        ...state,
        currentTask: action.payload,
        isProcessing: action.payload.status === 'running' || action.payload.status === 'queued'
      };
    
    case 'TASK_COMPLETED':
      return {
        ...state,
        currentTask: null,
        isProcessing: false
      };
    
    case 'TASK_FAILED':
      return {
        ...state,
        currentTask: null,
        isProcessing: false,
        lastError: action.payload.error
      };
    
    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.payload };
    
    case 'SET_ERROR':
      return { ...state, lastError: action.payload };
    
    default:
      return state;
  }
}

/**
 * Agent 事件 Hook
 */
export function useAgentEvents(options: UseAgentEventsOptions): UseAgentEventsReturn {
  const { projectId, onTaskCompleted, onMessageReceived } = options;
  
  const [state, dispatch] = useReducer(agentReducer, initialState);
  const [isConnected, setIsConnected] = useState(false);
  const [messageImages, setMessageImages] = useState<Record<string, string[]>>({});
  const [imageBlobUrls, setImageBlobUrls] = useState<Record<string, string>>({});
  
  // 用于追踪加载版本，防止过期数据覆盖新数据
  const loadVersionRef = useRef(0);
  const lastFetchAtRef = useRef(0);
  
  // 追踪 hook 是否仍然挂载/激活，用于防止卸载后的操作
  const isMountedRef = useRef(true);
  const currentProjectIdRef = useRef(projectId);
  currentProjectIdRef.current = projectId;
  
  // 使用 ref 存储回调，避免订阅循环
  const onTaskCompletedRef = useRef(onTaskCompleted);
  const onMessageReceivedRef = useRef(onMessageReceived);
  onTaskCompletedRef.current = onTaskCompleted;
  onMessageReceivedRef.current = onMessageReceived;

  // 加载消息列表
  const refreshMessages = useCallback(async () => {
    // 检查是否仍然挂载且 projectId 有效
    if (!projectId || !isMountedRef.current) {
      return;
    }
    
    // 检查 projectId 是否仍然是当前项目
    if (projectId !== currentProjectIdRef.current) {
      console.log(`[useAgentEvents] projectId 已变更，跳过加载`);
      return;
    }

    loadVersionRef.current += 1;
    const currentVersion = loadVersionRef.current;
    console.log(`[useAgentEvents] 加载消息 (版本 ${currentVersion}), projectId:`, projectId);

    const { data, error } = await messageService.getMessagesByProjectId(projectId);

    // 检查是否仍然挂载且版本是否过期
    if (!isMountedRef.current || currentVersion < loadVersionRef.current) {
      console.log(`[useAgentEvents] 版本 ${currentVersion} 已过期或组件已卸载，忽略结果`);
      return;
    }

    if (error) {
      console.error('[useAgentEvents] 加载消息失败:', error);
    } else if (data) {
      console.log('[useAgentEvents] 加载到', data.length, '条消息');
      dispatch({ type: 'SET_MESSAGES', payload: data });

      // 加载任务中的图片
      const { data: tasks } = await aiTaskService.getTasksByProjectId(projectId);
      if (tasks) {
        const newMessageImages: Record<string, string[]> = {};
        const newImageBlobUrls: Record<string, string> = {};

        for (const task of tasks) {
          if (task.status === 'completed' && task.result) {
            const messageId = task.result.messageId as string | undefined;
            const generatedImages = task.result.generated_images as string[] | undefined;
            if (messageId && generatedImages && generatedImages.length > 0) {
              newMessageImages[messageId] = generatedImages;

              for (const imagePath of generatedImages) {
                const { data: blob, error: imgError } = await imageProxyService.fetchImage(imagePath);
                if (blob && !imgError) {
                  const blobUrl = URL.createObjectURL(blob);
                  newImageBlobUrls[imagePath] = blobUrl;
                }
              }
            }
          }
        }

        if (Object.keys(newMessageImages).length > 0) {
          setMessageImages(newMessageImages);
          setImageBlobUrls(newImageBlobUrls);
        }
      }
    }

    lastFetchAtRef.current = Date.now();
  }, [projectId]);

  // 添加消息（使用 ref 访问最新的 onMessageReceived）
  const appendMessage = useCallback((message: ChatMessage) => {
    console.log('[useAgentEvents] 添加消息到状态:', message.id, message.role);
    dispatch({ type: 'APPEND_MESSAGE', payload: message });
    onMessageReceivedRef.current?.(message);
  }, []);

  const handleStatusChange = useCallback(
    (status?: RealtimeSubscribeStatus, error?: Error | null) => {
      // 如果组件已卸载，忽略状态变化
      if (!isMountedRef.current) {
        console.log(`[useAgentEvents] 组件已卸载，忽略状态变化: ${status}`);
        return;
      }

      if (status === 'SUBSCRIBED') {
        setIsConnected(true);
        // catch-up: 确保订阅稳定后再做一次刷新，避免刚建立时的竞态
        // 短延迟后刷新消息，补偿订阅建立瞬间可能丢失的事件
        setTimeout(() => {
          if (isMountedRef.current && projectId === currentProjectIdRef.current) {
            console.log('[useAgentEvents] SUBSCRIBED catch-up: 延迟刷新消息');
            refreshMessages();
          }
        }, 250);
        return;
      }

      if (status === 'RETRYING') {
        setIsConnected(false);
        return;
      }

      if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || error) {
        setIsConnected(false);
        // 只有在组件仍然挂载时才刷新消息
        if (isMountedRef.current) {
          refreshMessages();
        }
      }
    },
    [projectId, refreshMessages]
  );

  // 处理任务更新的内部函数（用于订阅回调）
  const handleTaskUpdateInternal = useCallback(async (task: AITask) => {
    // 检查是否仍然挂载
    if (!isMountedRef.current) {
      console.log('[useAgentEvents] 组件已卸载，忽略任务更新');
      return;
    }

    console.log('[useAgentEvents] 任务更新:', task.id, task.status, 'result:', task.result);

    if (task.type !== 'chat_reply') {
      console.log('[useAgentEvents] 非 chat_reply 任务，跳过');
      return;
    }

    dispatch({ type: 'TASK_UPDATED', payload: task });

    if (task.status === 'completed') {
      console.log('[useAgentEvents] 任务完成，开始处理结果');
      dispatch({ type: 'TASK_COMPLETED', payload: task });
      onTaskCompletedRef.current?.(task);

      // 处理生成的图片
      const messageId = task.result?.messageId as string | undefined;
      const generatedImages = task.result?.generated_images as string[] | undefined;
      console.log('[useAgentEvents] 从 task.result 获取 messageId:', messageId);

      if (generatedImages && generatedImages.length > 0 && messageId) {
        if (!isMountedRef.current) return;
        setMessageImages(prev => ({
          ...prev,
          [messageId]: generatedImages
        }));

        const newImageBlobUrls: Record<string, string> = {};
        for (const imagePath of generatedImages) {
          if (!isMountedRef.current) break;
          const { data: blob, error } = await imageProxyService.fetchImage(imagePath);
          if (blob && !error) {
            const blobUrl = URL.createObjectURL(blob);
            newImageBlobUrls[imagePath] = blobUrl;
          }
        }
        if (isMountedRef.current) {
          setImageBlobUrls(prev => ({ ...prev, ...newImageBlobUrls }));
        }
      }

      // 获取消息
      if (messageId) {
        if (!isMountedRef.current) return;
        console.log('[useAgentEvents] 尝试通过 messageId 获取消息:', messageId);
        const { data, error } = await messageService.getMessageById(messageId);
        console.log('[useAgentEvents] getMessageById 结果:', { data, error });
        if (data) {
          if (!isMountedRef.current) return;
          console.log('[useAgentEvents] 获取到任务关联的消息:', data.id, data.role);
          dispatch({ type: 'APPEND_MESSAGE', payload: data });
          onMessageReceivedRef.current?.(data);
        } else {
          // 消息可能还未写入，延迟刷新
          console.log('[useAgentEvents] 消息未找到，延迟 500ms 后刷新');
          setTimeout(async () => {
            // 检查是否仍然挂载
            if (!isMountedRef.current) {
              console.log('[useAgentEvents] 组件已卸载，取消延迟刷新');
              return;
            }
            console.log('[useAgentEvents] 延迟刷新开始');
            const { data: messages } = await messageService.getMessagesByProjectId(task.project_id);
            if (messages && isMountedRef.current) {
              console.log('[useAgentEvents] 延迟刷新获取到', messages.length, '条消息');
              // 使用增量合并而不是覆盖，避免丢失已 append 的消息
              dispatch({ type: 'SET_MESSAGES', payload: messages });
            }
          }, 500);
        }
      } else {
        // messageId 为空，说明 task.result 中没有 messageId
        // 这可能是因为 realtime 事件中的 result 字段不完整
        console.warn('[useAgentEvents] task.result.messageId 为空，尝试刷新消息列表');
        console.log('[useAgentEvents] task.result 完整内容:', JSON.stringify(task.result));
        // 延迟刷新以获取最新消息
        setTimeout(async () => {
          // 检查是否仍然挂载
          if (!isMountedRef.current) {
            console.log('[useAgentEvents] 组件已卸载，取消延迟刷新');
            return;
          }
          console.log('[useAgentEvents] messageId 为空，延迟刷新开始');
          const { data: messages } = await messageService.getMessagesByProjectId(task.project_id);
          if (messages && isMountedRef.current) {
            console.log('[useAgentEvents] 延迟刷新获取到', messages.length, '条消息');
            dispatch({ type: 'SET_MESSAGES', payload: messages });
          }
        }, 500);
      }
    } else if (task.status === 'failed') {
      dispatch({
        type: 'TASK_FAILED',
        payload: { taskId: task.id, error: task.error || '任务处理失败' }
      });
    }
  }, []);

  // 设置订阅 - 只依赖 projectId，避免订阅循环
  useEffect(() => {
    // 标记为已挂载
    isMountedRef.current = true;
    
    if (!projectId) {
      dispatch({ type: 'SET_MESSAGES', payload: [] });
      setIsConnected(false);
      return;
    }

    console.log('[useAgentEvents] 设置订阅, projectId:', projectId);

    // 加载初始数据
    refreshMessages();

    // 订阅事件 - 使用内联函数和 ref 避免依赖外部回调
    const unsubscribe = subscribeAgentEvents({
      projectId,
      onTaskUpdate: handleTaskUpdateInternal,
      onMessageCreated: (message: ChatMessage) => {
        // 检查是否仍然挂载
        if (!isMountedRef.current) return;
        console.log('[useAgentEvents] 收到新消息事件:', message.id, message.role);
        dispatch({ type: 'APPEND_MESSAGE', payload: message });
        onMessageReceivedRef.current?.(message);
      },
      onError: (error) => {
        // 检查是否仍然挂载
        if (!isMountedRef.current) {
          console.log('[useAgentEvents] 组件已卸载，忽略错误回调');
          return;
        }
        console.error('[useAgentEvents] 订阅错误:', error);
        dispatch({ type: 'SET_ERROR', payload: error.message });
        setIsConnected(false);
        refreshMessages();
      },
      onStatusChange: handleStatusChange
    });

    return () => {
      console.log('[useAgentEvents] 清理订阅, projectId:', projectId);
      // 标记为已卸载，阻止后续回调
      isMountedRef.current = false;
      unsubscribe();
      setIsConnected(false);
    };
  }, [handleStatusChange, projectId, refreshMessages, handleTaskUpdateInternal]);

  // 清理 blob URLs
  useEffect(() => {
    return () => {
      Object.values(imageBlobUrls).forEach(url => {
        URL.revokeObjectURL(url);
      });
    };
  }, [imageBlobUrls]);

  return {
    messages: state.messages,
    currentTask: state.currentTask,
    isProcessing: state.isProcessing,
    isConnected,
    lastError: state.lastError,
    appendMessage,
    refreshMessages,
    messageImages,
    imageBlobUrls
  };
}

export default useAgentEvents;
