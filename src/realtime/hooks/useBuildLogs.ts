/**
 * useBuildLogs Hook
 * 
 * 提供构建日志的实时订阅功能。
 * 组件通过此 hook 获取构建日志列表，无需直接操作 Supabase。
 * 
 * 修复：使用 ref 存储回调函数，避免因回调变化导致的订阅循环。
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { BuildLog } from '../../types/project';
import { buildLogService } from '../../services/buildLogService';
import { subscribeBuildLogs } from '../subscribeBuildLogs';
import { useAuth } from '../../contexts/AuthContext';
import type {
  BuildLogState,
  BuildLogAction,
  UseBuildLogsOptions,
  UseBuildLogsReturn,
  RealtimeSubscribeStatus
} from '../types';

// 初始状态
const initialState: BuildLogState = {
  logs: []
};

// 构建日志 Reducer
function buildLogReducer(state: BuildLogState, action: BuildLogAction): BuildLogState {
  switch (action.type) {
    case 'SET_LOGS':
      return { logs: action.payload };
    
    case 'APPEND_LOG': {
      // 去重检查
      if (state.logs.some(log => log.id === action.payload.id)) {
        return state;
      }
      return { logs: [...state.logs, action.payload] };
    }
    
    case 'CLEAR_LOGS':
      return { logs: [] };
    
    default:
      return state;
  }
}

/**
 * 构建日志 Hook
 */
export function useBuildLogs(options: UseBuildLogsOptions): UseBuildLogsReturn {
  const { projectId, onLogAdded } = options;
  const { authReady, authVersion } = useAuth();
  
  const [state, dispatch] = useReducer(buildLogReducer, initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  // 使用 ref 存储回调，避免订阅循环
  const onLogAddedRef = useRef(onLogAdded);
  onLogAddedRef.current = onLogAdded;

  // 追踪 hook 是否仍然挂载/激活，用于防止卸载后的操作
  const isMountedRef = useRef(true);
  const currentProjectIdRef = useRef(projectId);
  currentProjectIdRef.current = projectId;
  
  // 追踪上一次的订阅状态，用于边缘检测（只在状态变化时触发刷新）
  const lastStatusRef = useRef<RealtimeSubscribeStatus | undefined>(undefined);

  // 加载日志列表
  const refreshLogs = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    console.log('[useBuildLogs] 加载日志, projectId:', projectId);

    const { data, error } = await buildLogService.getBuildLogsByProjectId(projectId);

    if (error) {
      console.error('[useBuildLogs] 加载日志失败:', error);
    } else if (data) {
      console.log('[useBuildLogs] 加载到', data.length, '条日志');
      console.log("data:",data)
      dispatch({ type: 'SET_LOGS', payload: data });
    }

    setIsLoading(false);
  }, [projectId]);

  // 添加日志（使用 ref 访问最新的 onLogAdded）
  const appendLog = useCallback((log: BuildLog) => {
    console.log('[useBuildLogs] 添加日志到状态:', log.id);
    dispatch({ type: 'APPEND_LOG', payload: log });
    onLogAddedRef.current?.(log);
  }, []);

  const handleStatusChange = useCallback(
    (status?: RealtimeSubscribeStatus, error?: Error | null) => {
      // 如果组件已卸载，忽略状态变化
      if (!isMountedRef.current) {
        console.log(`[useBuildLogs] 组件已卸载，忽略状态变化: ${status}`);
        return;
      }
      
      // 记录上一次状态，用于边缘检测
      const prevStatus = lastStatusRef.current;
      lastStatusRef.current = status;

      if (status === 'SUBSCRIBED') {
        setIsConnected(true);
        // catch-up: 确保订阅稳定后再做一次刷新，避免刚建立时的竞态
        setTimeout(() => {
          if (isMountedRef.current && projectId === currentProjectIdRef.current) {
            console.log('[useBuildLogs] SUBSCRIBED catch-up: 延迟刷新日志');
            refreshLogs();
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
        
        // 边缘检测：只在从非错误状态变为错误状态时触发一次刷新
        // 避免在持续错误状态下反复刷新导致死循环
        const wasErrorBefore = prevStatus === 'CLOSED' || prevStatus === 'CHANNEL_ERROR' || prevStatus === 'TIMED_OUT';
        if (!wasErrorBefore && isMountedRef.current) {
          console.log('[useBuildLogs] 首次进入错误状态，做一次兜底刷新');
          refreshLogs();
        } else {
          console.log(`[useBuildLogs] 已处于错误状态 (prev=${prevStatus}, curr=${status})，跳过刷新`);
        }
      }
    },
    [projectId, refreshLogs]
  );

  // 设置订阅 - 依赖 projectId 和 authReady，确保认证完成后再创建订阅
  useEffect(() => {
    // 标记为已挂载
    isMountedRef.current = true;

    if (!projectId) {
      dispatch({ type: 'CLEAR_LOGS' });
      setIsConnected(false);
      return;
    }

    // 等待认证完成后再创建订阅，避免使用未认证的 token
    if (!authReady) {
      console.log('[useBuildLogs] 等待认证完成, authReady:', authReady);
      return;
    }

    console.log('[useBuildLogs] 设置订阅, projectId:', projectId, 'authReady:', authReady, 'authVersion:', authVersion);

    // 加载初始数据
    refreshLogs();

    // 订阅事件 - 使用内联函数避免依赖外部回调
    const unsubscribe = subscribeBuildLogs({
      projectId,
      onLogCreated: (log: BuildLog) => {
        // 检查是否仍然挂载
        if (!isMountedRef.current) return;
        console.log('[useBuildLogs] 收到新日志事件:', log.id, log.log_type);
        dispatch({ type: 'APPEND_LOG', payload: log });
        onLogAddedRef.current?.(log);
      },
      onError: (error) => {
        // 检查是否仍然挂载
        if (!isMountedRef.current) return;
        console.error('[useBuildLogs] 订阅错误:', error);
        setIsConnected(false);
        refreshLogs();
      },
      onStatusChange: handleStatusChange
    });

    return () => {
      console.log('[useBuildLogs] 清理订阅, projectId:', projectId);
      // 标记为已卸载，阻止后续回调
      isMountedRef.current = false;
      unsubscribe();
      setIsConnected(false);
    };
  }, [authReady, authVersion, handleStatusChange, projectId, refreshLogs]);

  return {
    logs: state.logs,
    isLoading,
    isConnected,
    appendLog,
    refreshLogs
  };
}

export default useBuildLogs;
