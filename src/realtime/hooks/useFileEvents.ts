/**
 * useFileEvents Hook
 * 
 * 提供项目文件变更的实时订阅功能。
 * 组件通过此 hook 获取文件列表，无需直接操作 Supabase。
 * 
 * Step 3: 新增 file_events 表订阅，支持实时文件变更通知和热刷新。
 * 热刷新使用 500ms 节流，避免短时间内多次刷新。
 * 
 * 修复：
 * 1. 引入 generation 检查，区分「预期关闭」和「异常关闭」
 * 2. 使用 StatusChangeMeta 获取关闭原因，避免错误的兜底刷新
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { ProjectFile } from '../../types/project';
import { fileService } from '../../services/fileService';
import { subscribeFileEvents } from '../subscribeFileEvents';
import { useAuth } from '../../hooks/useAuth';
import { getRealtimeClient } from '../realtimeClient';
import type { FileState, FileAction, UseFileEventsOptions, UseFileEventsReturn, DbFileEvent, RealtimeSubscribeStatus, StatusChangeMeta } from '../types';

// Step 3: 热刷新节流时间（毫秒）
const HOT_REFRESH_THROTTLE_MS = 500;

// 初始状态
const initialState: FileState = {
  files: [],
  lastUpdated: null
};

// 文件状态 Reducer
function fileReducer(state: FileState, action: FileAction): FileState {
  switch (action.type) {
    case 'SET_FILES':
      return { files: action.payload, lastUpdated: new Date().toISOString() };
    
    case 'ADD_FILE': {
      // 去重检查
      if (state.files.some(f => f.id === action.payload.id)) {
        return state;
      }
      return {
        files: [...state.files, action.payload],
        lastUpdated: new Date().toISOString()
      };
    }
    
    case 'UPDATE_FILE': {
      const index = state.files.findIndex(f => f.id === action.payload.id);
      if (index === -1) {
        return state;
      }
      const newFiles = [...state.files];
      newFiles[index] = action.payload;
      return {
        files: newFiles,
        lastUpdated: new Date().toISOString()
      };
    }
    
    case 'REMOVE_FILE':
      return {
        files: state.files.filter(f => f.id !== action.payload),
        lastUpdated: new Date().toISOString()
      };
    
    default:
      return state;
  }
}

/**
 * 文件事件 Hook
 * 
 * Step 3: 新增 file_events 表订阅和热刷新节流逻辑
 */
export function useFileEvents(options: UseFileEventsOptions): UseFileEventsReturn {
  const { projectId, versionId } = options;
  const { authReady, authVersion } = useAuth();
  const client = getRealtimeClient();
  
  const [state, dispatch] = useReducer(fileReducer, initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Step 3: 热刷新节流相关 refs
  const hotRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFileEventsRef = useRef<DbFileEvent[]>([]);
  const onHotRefreshRef = useRef<((events: DbFileEvent[]) => void) | null>(null);
  
  // 追踪 hook 是否仍然挂载/激活，用于防止卸载后的操作
  const isMountedRef = useRef(true);
  
  // 追踪上一次的订阅状态，用于边缘检测
  const lastStatusRef = useRef<RealtimeSubscribeStatus | undefined>(undefined);
  
  // 记录订阅创建时的 generation，用于忽略旧回调
  const subscriptionGenerationRef = useRef<number>(0);

  // 加载文件列表
  const refreshFiles = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    console.log('[useFileEvents] 加载文件列表');

    const { data, error } = await fileService.getFilesByProject(projectId, versionId);

    if (!error && data) {
      dispatch({ type: 'SET_FILES', payload: data });
    }

    setIsLoading(false);
  }, [projectId, versionId]);

  // 处理文件创建
  const handleFileCreated = useCallback((file: ProjectFile) => {
    console.log('[useFileEvents] 文件创建:', file.file_name);
    dispatch({ type: 'ADD_FILE', payload: file });
  }, []);

  // 处理文件更新
  const handleFileUpdated = useCallback((file: ProjectFile) => {
    console.log('[useFileEvents] 文件更新:', file.file_name);
    dispatch({ type: 'UPDATE_FILE', payload: file });
  }, []);

  // 处理文件删除
  const handleFileDeleted = useCallback((fileId: string) => {
    console.log('[useFileEvents] 文件删除:', fileId);
    dispatch({ type: 'REMOVE_FILE', payload: fileId });
  }, []);

  // Step 3: 处理 file_events 表事件（带节流的热刷新）
  const handleFileEvent = useCallback((event: DbFileEvent) => {
    console.log('[useFileEvents] 收到 file_events:', event.op, event.path);
    
    // 将事件加入待处理队列
    pendingFileEventsRef.current.push(event);

    // 如果已有定时器在运行，不重复设置
    if (hotRefreshTimerRef.current) {
      return;
    }

    // 设置节流定时器
    hotRefreshTimerRef.current = setTimeout(() => {
      const events = [...pendingFileEventsRef.current];
      pendingFileEventsRef.current = [];
      hotRefreshTimerRef.current = null;

      console.log(`[useFileEvents] 热刷新触发，合并 ${events.length} 个文件事件`);

      // 触发文件列表刷新
      refreshFiles();

      // 触发热刷新回调（如果有）
      if (onHotRefreshRef.current) {
        onHotRefreshRef.current(events);
      }

      // 发送自定义事件，通知 PreviewPanel 刷新
      const hotRefreshEvent = new CustomEvent('file-hot-refresh', {
        detail: { events, projectId }
      });
      window.dispatchEvent(hotRefreshEvent);
    }, HOT_REFRESH_THROTTLE_MS);
  }, [projectId, refreshFiles]);

  // 处理状态变化
  const handleStatusChange = useCallback(
    (status?: RealtimeSubscribeStatus, error?: Error | null, meta?: StatusChangeMeta) => {
      // 如果组件已卸载，忽略状态变化
      if (!isMountedRef.current) {
        console.log(`[useFileEvents] 组件已卸载，忽略状态变化: ${status}`);
        return;
      }
      
      // 检查 generation 是否仍然有效，忽略旧 generation 的回调
      if (meta?.generation !== undefined && !client.isGenerationValid(meta.generation)) {
        console.log(`[useFileEvents] 忽略旧 generation 的状态回调: gen=${meta.generation}, current=${client.getSessionGeneration()}`);
        return;
      }
      
      // 记录上一次状态，用于边缘检测
      const prevStatus = lastStatusRef.current;
      lastStatusRef.current = status;
      
      console.log(`[useFileEvents] 状态变化: ${prevStatus} -> ${status}, closeReason=${meta?.closeReason}, isExpectedClose=${meta?.isExpectedClose}`);

      if (status === 'SUBSCRIBED') {
        setIsConnected(true);
        // catch-up: 确保订阅稳定后再做一次刷新
        setTimeout(() => {
          if (isMountedRef.current) {
            console.log('[useFileEvents] SUBSCRIBED catch-up: 延迟刷新文件');
            refreshFiles();
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
        if (meta?.isExpectedClose || meta?.closeReason === 'CLEANUP' || meta?.closeReason === 'UNSUBSCRIBE' || meta?.closeReason === 'AUTH_CHANGE') {
          console.log(`[useFileEvents] 预期关闭 (reason=${meta?.closeReason})，等待新订阅建立`);
          return;
        }
        
        // 边缘检测：只在从非错误状态变为错误状态时触发一次刷新
        const wasErrorBefore = prevStatus === 'CLOSED' || prevStatus === 'CHANNEL_ERROR' || prevStatus === 'TIMED_OUT';
        if (!wasErrorBefore && isMountedRef.current) {
          console.log('[useFileEvents] 首次进入错误状态，做一次兜底刷新');
          refreshFiles();
        } else {
          console.log(`[useFileEvents] 已处于错误状态 (prev=${prevStatus}, curr=${status})，跳过刷新`);
        }
      }
    },
    [refreshFiles, client]
  );

  // 设置订阅 - 依赖 projectId 和 authReady，确保认证完成后再创建订阅
  useEffect(() => {
    // 标记为已挂载
    isMountedRef.current = true;
    
    if (!projectId) {
      dispatch({ type: 'SET_FILES', payload: [] });
      setIsConnected(false);
      return;
    }

    // 等待认证完成后再创建订阅，避免使用未认证的 token
    if (!authReady) {
      console.log('[useFileEvents] 等待认证完成, authReady:', authReady);
      return;
    }

    // 记录订阅创建时的 generation
    subscriptionGenerationRef.current = client.getSessionGeneration();
    console.log('[useFileEvents] 设置订阅, projectId:', projectId, 'authReady:', authReady, 'authVersion:', authVersion, 'generation:', subscriptionGenerationRef.current);

    // 加载初始数据
    refreshFiles();

    // 订阅事件（包括 project_files 表和 file_events 表）
    const unsubscribe = subscribeFileEvents({
      projectId,
      versionId,
      onFileCreated: handleFileCreated,
      onFileUpdated: handleFileUpdated,
      onFileDeleted: handleFileDeleted,
      onFileEvent: handleFileEvent,
      onError: (error) => {
        // 检查是否仍然挂载
        if (!isMountedRef.current) return;
        console.error('[useFileEvents] 订阅错误:', error);
        setIsConnected(false);
        refreshFiles();
      },
      onStatusChange: handleStatusChange
    });

    return () => {
      console.log('[useFileEvents] 清理订阅, projectId:', projectId);
      // 标记为已卸载，阻止后续回调
      isMountedRef.current = false;
      unsubscribe();
      setIsConnected(false);
      
      // 清理热刷新定时器
      if (hotRefreshTimerRef.current) {
        clearTimeout(hotRefreshTimerRef.current);
        hotRefreshTimerRef.current = null;
      }
      pendingFileEventsRef.current = [];
    };
  }, [authReady, authVersion, projectId, versionId, refreshFiles, handleFileCreated, handleFileUpdated, handleFileDeleted, handleFileEvent, handleStatusChange, client]);

  return {
    files: state.files,
    isLoading,
    isConnected,
    refreshFiles
  };
}

export default useFileEvents;
