/**
 * 文件事件订阅
 * 
 * 提供项目文件变更的实时订阅功能。
 * 注意：此功能为预留接口，当前后端可能尚未完全支持文件变更事件。
 */

import type { ProjectFile } from '../types/project';
import { subscribeToTable } from './realtimeClient';
import type { SubscribeFileEventsOptions } from './types';

/**
 * 订阅文件事件（创建、更新、删除）
 * 
 * @param options 订阅选项
 * @returns 取消订阅函数
 */
export function subscribeFileEvents(options: SubscribeFileEventsOptions): () => void {
  const { projectId, versionId, onFileCreated, onFileUpdated, onFileDeleted, onError } = options;

  if (!projectId) {
    console.warn('[subscribeFileEvents] projectId 为空，跳过订阅');
    return () => {};
  }

  const unsubscribers: Array<() => void> = [];

  try {
    // 构建过滤条件
    const baseFilter = `project_id=eq.${projectId}`;
    const filter = versionId ? `${baseFilter},version_id=eq.${versionId}` : baseFilter;
    const channelSuffix = versionId ? `-${versionId}` : '';

    // 订阅文件创建
    if (onFileCreated) {
      const unsubscribeCreate = subscribeToTable<ProjectFile>(
        `file-events-create-${projectId}${channelSuffix}`,
        'project_files',
        'INSERT',
        filter,
        (file) => {
          console.log('[subscribeFileEvents] 收到文件创建:', file.file_name);
          onFileCreated(file);
        }
      );
      unsubscribers.push(unsubscribeCreate);
    }

    // 订阅文件更新
    if (onFileUpdated) {
      const unsubscribeUpdate = subscribeToTable<ProjectFile>(
        `file-events-update-${projectId}${channelSuffix}`,
        'project_files',
        'UPDATE',
        filter,
        (file) => {
          console.log('[subscribeFileEvents] 收到文件更新:', file.file_name);
          onFileUpdated(file);
        }
      );
      unsubscribers.push(unsubscribeUpdate);
    }

    // 订阅文件删除
    if (onFileDeleted) {
      const unsubscribeDelete = subscribeToTable<{ id: string }>(
        `file-events-delete-${projectId}${channelSuffix}`,
        'project_files',
        'DELETE',
        filter,
        (payload) => {
          console.log('[subscribeFileEvents] 收到文件删除:', payload.id);
          onFileDeleted(payload.id);
        }
      );
      unsubscribers.push(unsubscribeDelete);
    }

    console.log(`[subscribeFileEvents] 已订阅项目 ${projectId} 的文件事件`);
  } catch (error) {
    console.error('[subscribeFileEvents] 订阅失败:', error);
    onError?.(error instanceof Error ? error : new Error(String(error)));
  }

  // 返回统一的取消订阅函数
  return () => {
    console.log(`[subscribeFileEvents] 取消订阅项目 ${projectId} 的文件事件`);
    unsubscribers.forEach(unsubscribe => unsubscribe());
  };
}

export default subscribeFileEvents;
