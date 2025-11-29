/**
 * useAgentEvents Hook
 * 
 * 提供 AI 任务和聊天消息的实时订阅功能。
 * 组件通过此 hook 获取消息列表和任务状态，无需直接操作 Supabase。
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { AITask, ChatMessage } from '../../types/project';
import { messageService } from '../../services/messageService';
import { aiTaskService } from '../../services/aiTaskService';
import { imageProxyService } from '../../services/imageProxyService';
import { subscribeAgentEvents } from '../subscribeAgentEvents';
import type { AgentState, AgentAction, UseAgentEventsOptions, UseAgentEventsReturn } from '../types';

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

  // 加载消息列表
  const refreshMessages = useCallback(async () => {
    if (!projectId) return;

    loadVersionRef.current += 1;
    const currentVersion = loadVersionRef.current;
    console.log(`[useAgentEvents] 加载消息 (版本 ${currentVersion})`);

    const { data, error } = await messageService.getMessagesByProjectId(projectId);

    // 检查版本是否过期
    if (currentVersion < loadVersionRef.current) {
      console.log(`[useAgentEvents] 版本 ${currentVersion} 已过期，忽略结果`);
      return;
    }

    if (!error && data) {
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

  // 添加消息
  const appendMessage = useCallback((message: ChatMessage) => {
    dispatch({ type: 'APPEND_MESSAGE', payload: message });
    onMessageReceived?.(message);
  }, [onMessageReceived]);

  // 处理任务更新
  const handleTaskUpdate = useCallback(async (task: AITask) => {
    console.log('[useAgentEvents] 任务更新:', task.id, task.status);

    if (task.type !== 'chat_reply') {
      console.log('[useAgentEvents] 非 chat_reply 任务，跳过');
      return;
    }

    dispatch({ type: 'TASK_UPDATED', payload: task });

    if (task.status === 'completed') {
      dispatch({ type: 'TASK_COMPLETED', payload: task });
      onTaskCompleted?.(task);

      // 处理生成的图片
      const messageId = task.result?.messageId as string | undefined;
      const generatedImages = task.result?.generated_images as string[] | undefined;

      if (generatedImages && generatedImages.length > 0 && messageId) {
        setMessageImages(prev => ({
          ...prev,
          [messageId]: generatedImages
        }));

        const newImageBlobUrls: Record<string, string> = {};
        for (const imagePath of generatedImages) {
          const { data: blob, error } = await imageProxyService.fetchImage(imagePath);
          if (blob && !error) {
            const blobUrl = URL.createObjectURL(blob);
            newImageBlobUrls[imagePath] = blobUrl;
          }
        }
        setImageBlobUrls(prev => ({ ...prev, ...newImageBlobUrls }));
      }

      // 获取消息
      if (messageId) {
        const { data } = await messageService.getMessageById(messageId);
        if (data) {
          appendMessage(data);
        } else {
          // 消息可能还未写入，延迟刷新
          setTimeout(() => refreshMessages(), 500);
        }
      } else {
        await refreshMessages();
      }
    } else if (task.status === 'failed') {
      dispatch({
        type: 'TASK_FAILED',
        payload: { taskId: task.id, error: task.error || '任务处理失败' }
      });
    }
  }, [onTaskCompleted, appendMessage, refreshMessages]);

  // 处理新消息
  const handleMessageCreated = useCallback((message: ChatMessage) => {
    console.log('[useAgentEvents] 新消息:', message.id, message.role);
    appendMessage(message);
  }, [appendMessage]);

  // 设置订阅
  useEffect(() => {
    if (!projectId) {
      dispatch({ type: 'SET_MESSAGES', payload: [] });
      setIsConnected(false);
      return;
    }

    // 加载初始数据
    refreshMessages();

    // 订阅事件
    const unsubscribe = subscribeAgentEvents({
      projectId,
      onTaskUpdate: handleTaskUpdate,
      onMessageCreated: handleMessageCreated,
      onError: (error) => {
        console.error('[useAgentEvents] 订阅错误:', error);
        dispatch({ type: 'SET_ERROR', payload: error.message });
      }
    });

    setIsConnected(true);

    return () => {
      console.log('[useAgentEvents] 清理订阅');
      unsubscribe();
      setIsConnected(false);
    };
  }, [projectId, refreshMessages, handleTaskUpdate, handleMessageCreated]);

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
