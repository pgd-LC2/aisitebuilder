import { useContext } from 'react';
import { RealtimeContext } from '../contexts/RealtimeContext';
import type { RealtimeContextValue } from '../realtime/types';

/**
 * 使用 Realtime 上下文
 * 必须在 RealtimeProvider 内部使用
 */
export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (context === undefined) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}

/**
 * 使用 Realtime generation
 * 简化版 hook，只返回 generation 相关的功能
 */
export function useRealtimeGeneration() {
  const { sessionGeneration, isGenerationValid, getCurrentGeneration } = useRealtime();
  return { sessionGeneration, isGenerationValid, getCurrentGeneration };
}

/**
 * 使用 Realtime 连接状态
 * 简化版 hook，只返回连接状态相关的功能
 */
export function useRealtimeConnection() {
  const { connectionStatus, authReady, authVersion, isExpectedClose } = useRealtime();
  return { connectionStatus, authReady, authVersion, isExpectedClose };
}
