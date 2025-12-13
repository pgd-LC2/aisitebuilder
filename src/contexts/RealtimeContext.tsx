/**
 * RealtimeContext - Realtime 连接状态集中管理
 * 
 * 提供全局的 Realtime 连接状态管理，包括：
 * - sessionGeneration: 会话世代，每次 cleanup/reset 时递增
 * - connectionStatus: 全局连接状态
 * - authReady: 认证是否就绪
 * - authVersion: 认证版本号
 * - isExpectedClose: 是否正在进行预期关闭
 * 
 * 通过 generation 机制，可以区分「预期关闭」和「异常关闭」，
 * 避免旧的回调干扰新的订阅流程。
 */

import { createContext, useState, useCallback, useRef, ReactNode, useEffect } from 'react';
import type { RealtimeContextValue, RealtimeContextState, ConnectionStatus } from '../realtime/types';
import { getRealtimeClient } from '../realtime/realtimeClient';

export const RealtimeContext = createContext<RealtimeContextValue | undefined>(undefined);

interface RealtimeProviderProps {
  children: ReactNode;
  /** 认证是否就绪 */
  authReady: boolean;
  /** 认证版本号 */
  authVersion: number;
}

export function RealtimeProvider({ children, authReady, authVersion }: RealtimeProviderProps) {
  // 从 RealtimeClient 同步 generation
  const client = getRealtimeClient();
  
  // 使用 ref 来跟踪最新的 generation，避免闭包问题
  const generationRef = useRef(client.getSessionGeneration());
  
  // 状态
  const [sessionGeneration, setSessionGeneration] = useState(() => client.getSessionGeneration());
  // connectionStatus 目前从 RealtimeClient 获取，未来可以扩展为响应式状态
  const connectionStatus: ConnectionStatus = client.getConnectionStatus();
  const [isExpectedClose, setIsExpectedClose] = useState(false);

  /**
   * 递增会话世代
   * 通常在 cleanup 或 reset 时调用
   */
  const incrementGeneration = useCallback((): number => {
    const newGen = client.incrementGeneration();
    generationRef.current = newGen;
    setSessionGeneration(newGen);
    console.log(`[RealtimeContext] incrementGeneration: ${newGen}`);
    return newGen;
  }, [client]);

  /**
   * 标记开始预期关闭
   * 在调用 cleanup 之前调用，这样后续的 CLOSED 回调会被识别为预期关闭
   */
  const markExpectedClose = useCallback(() => {
    setIsExpectedClose(true);
    console.log('[RealtimeContext] markExpectedClose');
  }, []);

  /**
   * 清除预期关闭标记
   * 在 cleanup 完成后调用
   */
  const clearExpectedClose = useCallback(() => {
    setIsExpectedClose(false);
    console.log('[RealtimeContext] clearExpectedClose');
  }, []);

  /**
   * 检查给定的 generation 是否仍然有效
   * 用于判断回调是否应该被处理
   */
  const isGenerationValid = useCallback((generation: number): boolean => {
    const currentGen = generationRef.current;
    const valid = generation === currentGen;
    if (!valid) {
      console.log(`[RealtimeContext] isGenerationValid: generation=${generation}, current=${currentGen}, valid=${valid}`);
    }
    return valid;
  }, []);

  /**
   * 获取当前 generation
   */
  const getCurrentGeneration = useCallback((): number => {
    return generationRef.current;
  }, []);

  // 同步 RealtimeClient 的 generation 变化
  // 当 authVersion 变化时，可能需要同步 generation
  const syncGeneration = useCallback(() => {
    const clientGen = client.getSessionGeneration();
    if (clientGen !== generationRef.current) {
      generationRef.current = clientGen;
      setSessionGeneration(clientGen);
      console.log(`[RealtimeContext] syncGeneration: ${clientGen}`);
    }
  }, [client]);

  // 当 authVersion 变化时同步 generation
  useEffect(() => {
    syncGeneration();
  }, [authVersion, syncGeneration]);

  const state: RealtimeContextState = {
    sessionGeneration,
    connectionStatus,
    authReady,
    authVersion,
    isExpectedClose
  };

  const value: RealtimeContextValue = {
    ...state,
    incrementGeneration,
    markExpectedClose,
    clearExpectedClose,
    isGenerationValid,
    getCurrentGeneration
  };

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export default RealtimeContext;
