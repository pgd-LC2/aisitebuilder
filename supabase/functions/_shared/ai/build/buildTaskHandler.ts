/**
 * Build 任务处理器
 * 负责 build 模式的任务执行
 * 
 * 设计原则：
 * - 复用 TaskRunner，与 chat/plan 模式保持一致的执行流程
 * - 不实现自我修复循环，失败直接返回错误
 */

import { createTaskRunner } from '../core/taskRunner.ts';
import { BUILD_CONFIG } from './buildConfig.ts';
import type { BuildTaskInput, BuildTaskResult } from './types.ts';

/**
 * 处理 build 模式任务
 * 
 * @param input - Build 任务输入参数
 * @returns Build 任务执行结果
 */
export async function handleBuildTask(input: BuildTaskInput): Promise<BuildTaskResult> {
  const { task, supabase, apiKey, projectFilesContext } = input;

  const versionId = projectFilesContext?.versionId || BUILD_CONFIG.defaultVersionId;
  const bucket = projectFilesContext?.bucket || BUILD_CONFIG.defaultBucket;
  const basePath = projectFilesContext?.path || `${task.project_id}/${versionId}`;

  const runner = createTaskRunner(
    supabase,
    {
      apiKey,
      maxIterations: BUILD_CONFIG.maxIterations,
    },
    {
      taskId: task.id,
      projectId: task.project_id,
      mode: 'build',
      versionId,
      bucket,
      basePath,
      payload: { ...task.payload, type: task.type }
    }
  );

  const result = await runner.run();

  return {
    success: result.success,
    taskId: result.taskId,
    finalResponse: result.finalResponse,
    modifiedFiles: result.modifiedFiles,
    generatedImages: result.generatedImages,
    error: result.error,
  };
}
