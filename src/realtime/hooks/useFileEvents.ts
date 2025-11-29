/**
 * useFileEvents Hook
 * 
 * 提供项目文件变更的实时订阅功能。
 * 组件通过此 hook 获取文件列表，无需直接操作 Supabase。
 * 注意：此功能为预留接口，当前后端可能尚未完全支持文件变更事件。
 */

import { useCallback, useEffect, useReducer, useState } from 'react';
import type { ProjectFile } from '../../types/project';
import { fileService } from '../../services/fileService';
import { subscribeFileEvents } from '../subscribeFileEvents';
import type { FileState, FileAction, UseFileEventsOptions, UseFileEventsReturn } from '../types';

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
 */
export function useFileEvents(options: UseFileEventsOptions): UseFileEventsReturn {
  const { projectId, versionId } = options;
  
  const [state, dispatch] = useReducer(fileReducer, initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

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

  // 设置订阅
  useEffect(() => {
    if (!projectId) {
      dispatch({ type: 'SET_FILES', payload: [] });
      setIsConnected(false);
      return;
    }

    // 加载初始数据
    refreshFiles();

    // 订阅事件
    const unsubscribe = subscribeFileEvents({
      projectId,
      versionId,
      onFileCreated: handleFileCreated,
      onFileUpdated: handleFileUpdated,
      onFileDeleted: handleFileDeleted,
      onError: (error) => {
        console.error('[useFileEvents] 订阅错误:', error);
      }
    });

    setIsConnected(true);

    return () => {
      console.log('[useFileEvents] 清理订阅');
      unsubscribe();
      setIsConnected(false);
    };
  }, [projectId, versionId, refreshFiles, handleFileCreated, handleFileUpdated, handleFileDeleted]);

  return {
    files: state.files,
    isLoading,
    isConnected,
    refreshFiles
  };
}

export default useFileEvents;
