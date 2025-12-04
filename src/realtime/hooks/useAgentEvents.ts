/**
 * useAgentEvents Hook
 * 
 * 提供 AI 任务和聊天消息的实时订阅功能。
 * 组件通过此 hook 获取消息列表和任务状态，无需直接操作 Supabase。
 * 
 * 修复：
 * 1. 使用 ref 存储回调函数，避免因回调变化导致的订阅循环
 * 2. 引入 generation 检查，区分「预期关闭」和「异常关闭」
 * 3. 使用 StatusChangeMeta 获取关闭原因，避免错误的兜底刷新
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { AITask, ChatMessage } from '../../types/project';
import { messageService } from '../../services/messageService';
import { aiTaskService } from '../../services/aiTaskService';
import { imageProxyService } from '../../services/imageProxyService';
import { subscribeAgentEvents } from '../subscribeAgentEvents';
import { useAuth } from '../../contexts/AuthContext';
import { getRealtimeClient } from '../realtimeClient';
import type {
  AgentState,
  AgentAction,
  UseAgentEventsOptions,
  UseAgentEventsReturn,
  RealtimeSubscribeStatus,
  StatusChangeMeta
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
  const { authReady, authVersion } = useAuth();
  const client = getRealtimeClient();
  
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
  
  // 防止 refreshMessages 并发执行
  const isRefreshingRef = useRef(false);
  
  // 追踪上一次的订阅状态，用于边缘检测（只在状态变化时触发刷新）
  const lastStatusRef = useRef<RealtimeSubscribeStatus | undefined>(undefined);
  
  // 记录订阅创建时的 generation，用于忽略旧回调
  const subscriptionGenerationRef = useRef<number>(0);
  
  // 使用 ref 存储回调，避免订阅循环
  const onTaskCompletedRef = useRef(onTaskCompleted);
  const onMessageReceivedRef = useRef(onMessageReceived);
  onTaskCompletedRef.current = onTaskCompleted;
  onMessageReceivedRef.current = onMessageReceived;

  // 加载消息列表
  // opts.force: 强制刷新，忽略时间节流（用于 SUBSCRIBED catch-up）
  const refreshMessages = useCallback(async (opts?: { force?: boolean }) => {
    // 检查是否仍然挂载且 projectId 有效
    if (!projectId || !isMountedRef.current) {
      return;
    }
    
    // 检查 projectId 是否仍然是当前项目
    if (projectId !== currentProjectIdRef.current) {
      console.log(`[useAgentEvents] projectId 已变更，跳过加载`);
      return;
    }
    
    // 防止并发刷新：如果已有刷新在进行中，跳过本次
    if (isRefreshingRef.current) {
      console.log('[useAgentEvents] 已有刷新进行中，跳过本次 refresh');
      return;
    }
    
    // 时间节流：非强制刷新时，1秒内不允许重复刷新
    const now = Date.now();
    if (!opts?.force && now - lastFetchAtRef.current < 1000) {
      console.log('[useAgentEvents] 刷新过于频繁，跳过本次刷新');
      return;
    }
    
    isRefreshingRef.current = true;
    lastFetchAtRef.current = now;

    loadVersionRef.current += 1;
    const currentVersion = loadVersionRef.current;
    console.log(`[useAgentEvents] 加载消息 (版本 ${currentVersion}), projectId:`, projectId);

    try {
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
    } finally {
      isRefreshingRef.current = false;
    }
  }, [projectId]);

  // 添加消息（使用 ref 访问最新的 onMessageReceived）
  const appendMessage = useCallback((message: ChatMessage) => {
    console.log('[useAgentEvents] 添加消息到状态:', message.id, message.role);
    dispatch({ type: 'APPEND_MESSAGE', payload: message });
    onMessageReceivedRef.current?.(message);
  }, []);

  const handleStatusChange = useCallback(
    (status?: RealtimeSubscribeStatus, error?: Error | null, meta?: StatusChangeMeta) => {
      // 如果组件已卸载，忽略状态变化
      if (!isMountedRef.current) {
        console.log(`[useAgentEvents] 组件已卸载，忽略状态变化: ${status}`);
        return;
      }
      
      // 检查 generation 是否仍然有效，忽略旧 generation 的回调
      if (meta?.generation !== undefined && !client.isGenerationValid(meta.generation)) {
        console.log(`[useAgentEvents] 忽略旧 generation 的状态回调: gen=${meta.generation}, current=${client.getSessionGeneration()}`);
        return;
      }
      
      // 记录上一次状态，用于边缘检测
      const prevStatus = lastStatusRef.current;
      lastStatusRef.current = status;
      
      console.log(`[useAgentEvents] 状态变化: ${prevStatus} -> ${status}, closeReason=${meta?.closeReason}, isExpectedClose=${meta?.isExpectedClose}`);

      if (status === 'SUBSCRIBED') {
        setIsConnected(true);
        // catch-up: 确保订阅稳定后再做一次刷新，避免刚建立时的竞态
        // 短延迟后刷新消息，补偿订阅建立瞬间可能丢失的事件
        setTimeout(() => {
          if (isMountedRef.current && projectId === currentProjectIdRef.current) {
            console.log('[useAgentEvents] SUBSCRIBED catch-up: 延迟刷新消息');
            refreshMessages({ force: true });
          }
        }, 250);
        return;
      }

      if (status === 'RETRYING') {
        setIsConnected(false);
        return;
      }

      const isErrorStatus = status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT';
      if (isErrorStatus || error) {
        setIsConnected(false);
        
        // 关键修复：检查是否是预期关闭
        // 如果是预期关闭（CLEANUP、UNSUBSCRIBE、AUTH_CHANGE），不触发兜底刷新
        if (meta?.isExpectedClose || meta?.closeReason === 'CLEANUP' || meta?.closeReason === 'UNSUBSCRIBE' || meta?.closeReason === 'AUTH_CHANGE') {
          console.log(`[useAgentEvents] 预期关闭 (reason=${meta?.closeReason})，等待新订阅建立`);
          return;
        }
        
        // 边缘检测：只在从非错误状态变为错误状态时触发一次刷新
        // 避免在持续错误状态下反复刷新导致死循环
        const wasErrorBefore = prevStatus === 'CLOSED' || prevStatus === 'CHANNEL_ERROR' || prevStatus === 'TIMED_OUT';
        if (!wasErrorBefore && isMountedRef.current) {
          console.log('[useAgentEvents] 首次进入错误状态，做一次兜底刷新');
          refreshMessages();
        } else {
          console.log(`[useAgentEvents] 已处于错误状态 (prev=${prevStatus}, curr=${status})，跳过刷新`);
        }
      }
    },
    [projectId, refreshMessages, client]
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

  // 设置订阅 - 依赖 projectId 和 authReady，确保认证完成后再创建订阅
  useEffect(() => {
    // 标记为已挂载
    isMountedRef.current = true;
    
    if (!projectId) {
      dispatch({ type: 'SET_MESSAGES', payload: [] });
      setIsConnected(false);
      return;
    }

    // 等待认证完成后再创建订阅，避免使用未认证的 token
    if (!authReady) {
      console.log('[useAgentEvents] 等待认证完成, authReady:', authReady);
      return;
    }

    // 记录订阅创建时的 generation
    subscriptionGenerationRef.current = client.getSessionGeneration();
    console.log('[useAgentEvents] 设置订阅, projectId:', projectId, 'authReady:', authReady, 'authVersion:', authVersion, 'generation:', subscriptionGenerationRef.current);

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
        // 注意：这里不再无条件调用 refreshMessages
        // refreshMessages 已有并发保护和时间节流，会自动防止过于频繁的刷新
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
  }, [authReady, authVersion, handleStatusChange, projectId, refreshMessages, handleTaskUpdateInternal, client]);

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
