/**
 * useRealtimeResource - 通用 Realtime 资源 Hook
 * 
 * 统一处理 "fetch snapshot first, then subscribe to increments" 模式。
 * 所有 Realtime 资源 Hook（useBuildLogs, useAgentEvents, useFileEvents）都应该基于此 Hook 实现。
 * 
 * 核心功能：
 * 1. 快照获取：组件挂载时获取初始数据
 * 2. 增量订阅：订阅实时更新
 * 3. Generation 检查：忽略旧 generation 的回调，避免竞态条件
 * 4. 并发保护：防止重复刷新
 * 5. 预期关闭识别：区分「预期关闭」和「异常关闭」
 */

import { useCallback, useEffect, useReducer, useRef, useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getRealtimeClient } from '../realtimeClient';
import type {
  RealtimeResourceConfig,
  RealtimeResourceReturn,
  StatusChangeMeta,
  RealtimeSubscribeStatus
} from '../types';

interface ResourceState<T> {
  items: T[];
  isLoading: boolean;
  error: string | null;
}

type ResourceAction<T> =
  | { type: 'SET_ITEMS'; payload: T[] }
  | { type: 'INSERT_ITEM'; payload: T }
  | { type: 'UPDATE_ITEM'; payload: T }
  | { type: 'DELETE_ITEM'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR' };

function createReducer<T>(getItemId: (item: T) => string) {
  return function resourceReducer(state: ResourceState<T>, action: ResourceAction<T>): ResourceState<T> {
    switch (action.type) {
      case 'SET_ITEMS':
        return { ...state, items: action.payload, isLoading: false, error: null };
      
      case 'INSERT_ITEM': {
        const newId = getItemId(action.payload);
        if (state.items.some(item => getItemId(item) === newId)) {
          return state;
        }
        return { ...state, items: [...state.items, action.payload] };
      }
      
      case 'UPDATE_ITEM': {
        const updateId = getItemId(action.payload);
        const index = state.items.findIndex(item => getItemId(item) === updateId);
        if (index === -1) {
          return { ...state, items: [...state.items, action.payload] };
        }
        const newItems = [...state.items];
        newItems[index] = action.payload;
        return { ...state, items: newItems };
      }
      
      case 'DELETE_ITEM': {
        return { ...state, items: state.items.filter(item => getItemId(item) !== action.payload) };
      }
      
      case 'SET_LOADING':
        return { ...state, isLoading: action.payload };
      
      case 'SET_ERROR':
        return { ...state, error: action.payload };
      
      case 'CLEAR':
        return { items: [], isLoading: false, error: null };
      
      default:
        return state;
    }
  };
}

/**
 * 通用 Realtime 资源 Hook
 * 
 * @template T 资源类型
 * @param config 配置选项
 * @returns 资源状态和操作方法
 */
export function useRealtimeResource<T>(config: RealtimeResourceConfig<T>): RealtimeResourceReturn<T> {
  const {
    resourceKey,
    projectId,
    fetchSnapshot,
    subscribeIncrements,
    getItemId,
    enabled = true,
    refreshThrottleMs = 1000,
    deps = []
  } = config;

  const { authReady, authVersion } = useAuth();
  const client = getRealtimeClient();

  // 将 deps 数组序列化为字符串，用于稳定化依赖
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const depsKey = useMemo(() => JSON.stringify(deps), deps);

  const reducer = useMemo(() => createReducer(getItemId), [getItemId]);
  const [state, dispatch] = useReducer(reducer, { items: [], isLoading: false, error: null });
  const [isConnected, setIsConnected] = useState(false);

  const isMountedRef = useRef(true);
  const currentProjectIdRef = useRef(projectId);
  currentProjectIdRef.current = projectId;

  const isRefreshingRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const loadVersionRef = useRef(0);

  const lastStatusRef = useRef<RealtimeSubscribeStatus | undefined>(undefined);

  const subscriptionGenerationRef = useRef<number>(0);

  /**
   * 刷新快照数据
   * @param opts.force 强制刷新，忽略时间节流
   * @param opts.priority 优先级，high 优先级不受并发保护限制
   */
  const refresh = useCallback(async (opts?: { force?: boolean; priority?: 'normal' | 'high' }) => {
    if (!projectId || !isMountedRef.current) {
      return;
    }

    if (projectId !== currentProjectIdRef.current) {
      console.log(`[${resourceKey}] projectId 已变更，跳过加载`);
      return;
    }

    if (opts?.priority !== 'high' && isRefreshingRef.current) {
      console.log(`[${resourceKey}] 已有刷新进行中，跳过本次 refresh`);
      return;
    }

    const now = Date.now();
    if (!opts?.force && now - lastFetchAtRef.current < refreshThrottleMs) {
      console.log(`[${resourceKey}] 刷新过于频繁，跳过本次刷新`);
      return;
    }

    isRefreshingRef.current = true;
    lastFetchAtRef.current = now;

    loadVersionRef.current += 1;
    const currentVersion = loadVersionRef.current;
    const currentGeneration = subscriptionGenerationRef.current;

    console.log(`[${resourceKey}] 加载数据 (版本 ${currentVersion}, generation ${currentGeneration}), projectId:`, projectId);

    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      const data = await fetchSnapshot();

      if (!isMountedRef.current || currentVersion < loadVersionRef.current) {
        console.log(`[${resourceKey}] 版本 ${currentVersion} 已过期或组件已卸载，忽略结果`);
        return;
      }

      if (!client.isGenerationValid(currentGeneration)) {
        console.log(`[${resourceKey}] generation ${currentGeneration} 已过期，忽略结果`);
        return;
      }

      console.log(`[${resourceKey}] 加载到 ${data.length} 条数据`);
      dispatch({ type: 'SET_ITEMS', payload: data });
    } catch (error) {
      if (isMountedRef.current) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[${resourceKey}] 加载数据失败:`, errorMessage);
        dispatch({ type: 'SET_ERROR', payload: errorMessage });
      }
    } finally {
      isRefreshingRef.current = false;
    }
  }, [projectId, resourceKey, fetchSnapshot, refreshThrottleMs, client]);

  /**
   * 处理状态变化
   */
  const handleStatusChange = useCallback((
    status: RealtimeSubscribeStatus | undefined,
    error: Error | null,
    meta?: StatusChangeMeta
  ) => {
    if (!isMountedRef.current) {
      console.log(`[${resourceKey}] 组件已卸载，忽略状态变化: ${status}`);
      return;
    }

    if (meta?.generation !== undefined && !client.isGenerationValid(meta.generation)) {
      console.log(`[${resourceKey}] 忽略旧 generation 的状态回调: gen=${meta.generation}, current=${client.getSessionGeneration()}`);
      return;
    }

    const prevStatus = lastStatusRef.current;
    lastStatusRef.current = status;

    console.log(`[${resourceKey}] 状态变化: ${prevStatus} -> ${status}, closeReason=${meta?.closeReason}, isExpectedClose=${meta?.isExpectedClose}`);

    if (status === 'SUBSCRIBED') {
      setIsConnected(true);
      setTimeout(() => {
        if (isMountedRef.current && projectId === currentProjectIdRef.current) {
          console.log(`[${resourceKey}] SUBSCRIBED catch-up: 延迟刷新数据`);
          refresh({ force: true, priority: 'high' });
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

      if (meta?.isExpectedClose || meta?.closeReason === 'CLEANUP' || meta?.closeReason === 'UNSUBSCRIBE' || meta?.closeReason === 'AUTH_CHANGE') {
        console.log(`[${resourceKey}] 预期关闭 (reason=${meta?.closeReason})，等待新订阅建立`);
        return;
      }

      const wasErrorBefore = prevStatus === 'CLOSED' || prevStatus === 'CHANNEL_ERROR' || prevStatus === 'TIMED_OUT';
      if (!wasErrorBefore && isMountedRef.current) {
        console.log(`[${resourceKey}] 首次进入错误状态，做一次兜底刷新`);
        refresh();
      } else {
        console.log(`[${resourceKey}] 已处于错误状态 (prev=${prevStatus}, curr=${status})，跳过刷新`);
      }
    }
  }, [resourceKey, projectId, refresh, client]);

  /**
   * 插入项目
   */
  const insertItem = useCallback((item: T) => {
    if (!isMountedRef.current) return;
    console.log(`[${resourceKey}] 插入项目:`, getItemId(item));
    dispatch({ type: 'INSERT_ITEM', payload: item });
  }, [resourceKey, getItemId]);

  /**
   * 更新项目
   */
  const updateItem = useCallback((item: T) => {
    if (!isMountedRef.current) return;
    console.log(`[${resourceKey}] 更新项目:`, getItemId(item));
    dispatch({ type: 'UPDATE_ITEM', payload: item });
  }, [resourceKey, getItemId]);

  /**
   * 删除项目
   */
  const deleteItem = useCallback((id: string) => {
    if (!isMountedRef.current) return;
    console.log(`[${resourceKey}] 删除项目:`, id);
    dispatch({ type: 'DELETE_ITEM', payload: id });
  }, [resourceKey]);

  useEffect(() => {
    isMountedRef.current = true;

    if (!projectId || !enabled) {
      dispatch({ type: 'CLEAR' });
      setIsConnected(false);
      return;
    }

    if (!authReady) {
      console.log(`[${resourceKey}] 等待认证完成, authReady:`, authReady);
      return;
    }

    subscriptionGenerationRef.current = client.getSessionGeneration();
    console.log(`[${resourceKey}] 设置订阅, projectId:`, projectId, 'authReady:', authReady, 'authVersion:', authVersion, 'generation:', subscriptionGenerationRef.current);

    refresh();

    const unsubscribe = subscribeIncrements({
      onInsert: (item: T) => {
        if (!isMountedRef.current) return;
        if (!client.isGenerationValid(subscriptionGenerationRef.current)) {
          console.log(`[${resourceKey}] 忽略旧 generation 的 INSERT 事件`);
          return;
        }
        insertItem(item);
      },
      onUpdate: (item: T) => {
        if (!isMountedRef.current) return;
        if (!client.isGenerationValid(subscriptionGenerationRef.current)) {
          console.log(`[${resourceKey}] 忽略旧 generation 的 UPDATE 事件`);
          return;
        }
        updateItem(item);
      },
      onDelete: (id: string) => {
        if (!isMountedRef.current) return;
        if (!client.isGenerationValid(subscriptionGenerationRef.current)) {
          console.log(`[${resourceKey}] 忽略旧 generation 的 DELETE 事件`);
          return;
        }
        deleteItem(id);
      },
      onStatusChange: handleStatusChange
    });

    return () => {
      console.log(`[${resourceKey}] 清理订阅, projectId:`, projectId);
      isMountedRef.current = false;
      unsubscribe();
      setIsConnected(false);
    };
  }, [authReady, authVersion, projectId, enabled, resourceKey, refresh, subscribeIncrements, insertItem, updateItem, deleteItem, handleStatusChange, client, depsKey]);

  /**
   * 追加项目（别名）
   */
  const appendItem = insertItem;

  /**
   * 删除项目（别名）
   */
  const removeItem = deleteItem;

  /**
   * 设置完整数据
   */
  const setData = useCallback((data: T[]) => {
    if (!isMountedRef.current) return;
    console.log(`[${resourceKey}] 设置完整数据:`, data.length, '条');
    dispatch({ type: 'SET_ITEMS', payload: data });
  }, [resourceKey]);

  return {
    data: state.items,
    isLoading: state.isLoading,
    isConnected,
    error: state.error,
    generation: subscriptionGenerationRef.current,
    refresh,
    appendItem,
    updateItem,
    removeItem,
    setData
  };
}

export default useRealtimeResource;
