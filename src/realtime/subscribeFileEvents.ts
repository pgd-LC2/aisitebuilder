/**
 * 文件事件订阅
 * 
 * 提供项目文件变更的实时订阅功能。
 * Step 3: 新增 file_events 表订阅，支持实时文件变更通知和热刷新。
 */

import type { ProjectFile } from '../types/project';
import { subscribeToTable } from './realtimeClient';
import type { SubscribeFileEventsOptions, DbFileEvent } from './types';

/**
 * 订阅文件事件（创建、更新、删除、file_events 表事件）
 * 
 * @param options 订阅选项
 * @returns 取消订阅函数
 */
export function subscribeFileEvents(options: SubscribeFileEventsOptions): () => void {
  const { projectId, versionId, onFileCreated, onFileUpdated, onFileDeleted, onFileEvent, onError } = options;

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

    // Step 3: 订阅 file_events 表（实时文件变更事件，用于热刷新）
    if (onFileEvent) {
      const unsubscribeFileEvent = subscribeToTable<DbFileEvent>(
        `file-events-table-${projectId}`,
        'file_events',
        'INSERT',
        baseFilter,
        (event) => {
          console.log('[subscribeFileEvents] 收到 file_events:', event.id, event.op, event.path);
          onFileEvent(event);
        }
      );
      unsubscribers.push(unsubscribeFileEvent);
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
