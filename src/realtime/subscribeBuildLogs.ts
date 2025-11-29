/**
 * 构建日志订阅
 * 
 * 提供构建日志的实时订阅功能。
 */

import type { BuildLog } from '../types/project';
import { subscribeToTable } from './realtimeClient';
import type { SubscribeBuildLogsOptions } from './types';

/**
 * 订阅构建日志事件
 * 
 * @param options 订阅选项
 * @returns 取消订阅函数
 */
export function subscribeBuildLogs(options: SubscribeBuildLogsOptions): () => void {
  const { projectId, onLogCreated, onError } = options;

  if (!projectId) {
    console.warn('[subscribeBuildLogs] projectId 为空，跳过订阅');
    return () => {};
  }

  try {
    // 订阅构建日志
    const unsubscribe = subscribeToTable<BuildLog>(
      `build-logs-${projectId}`,
      'build_logs',
      'INSERT',
      `project_id=eq.${projectId}`,
      (log) => {
        console.log('[subscribeBuildLogs] 收到新日志:', log.id, log.log_type);
        onLogCreated?.(log);
      }
    );

    console.log(`[subscribeBuildLogs] 已订阅项目 ${projectId} 的构建日志`);

    return () => {
      console.log(`[subscribeBuildLogs] 取消订阅项目 ${projectId} 的构建日志`);
      unsubscribe();
    };
  } catch (error) {
    console.error('[subscribeBuildLogs] 订阅失败:', error);
    onError?.(error instanceof Error ? error : new Error(String(error)));
    return () => {};
  }
}

export default subscribeBuildLogs;
