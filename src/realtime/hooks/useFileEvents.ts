/**
 * useFileEvents Hook
 * 
 * 提供项目文件变更的实时订阅功能。
 * 组件通过此 hook 获取文件列表，无需直接操作 Supabase。
 * 
 * Step 3: 新增 file_events 表订阅，支持实时文件变更通知和热刷新。
 * 热刷新使用 500ms 节流，避免短时间内多次刷新。
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { ProjectFile } from '../../types/project';
import { fileService } from '../../services/fileService';
import { subscribeFileEvents } from '../subscribeFileEvents';
import type { FileState, FileAction, UseFileEventsOptions, UseFileEventsReturn, DbFileEvent } from '../types';

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
  
  const [state, dispatch] = useReducer(fileReducer, initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Step 3: 热刷新节流相关 refs
  const hotRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFileEventsRef = useRef<DbFileEvent[]>([]);
  const onHotRefreshRef = useRef<((events: DbFileEvent[]) => void) | null>(null);

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

  // 设置订阅
  useEffect(() => {
    if (!projectId) {
      dispatch({ type: 'SET_FILES', payload: [] });
      setIsConnected(false);
      return;
    }

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
        console.error('[useFileEvents] 订阅错误:', error);
      }
    });

    setIsConnected(true);

    return () => {
      console.log('[useFileEvents] 清理订阅');
      unsubscribe();
      setIsConnected(false);
      
      // 清理热刷新定时器
      if (hotRefreshTimerRef.current) {
        clearTimeout(hotRefreshTimerRef.current);
        hotRefreshTimerRef.current = null;
      }
      pendingFileEventsRef.current = [];
    };
  }, [projectId, versionId, refreshFiles, handleFileCreated, handleFileUpdated, handleFileDeleted, handleFileEvent]);

  return {
    files: state.files,
    isLoading,
    isConnected,
    refreshFiles
  };
}

export default useFileEvents;
