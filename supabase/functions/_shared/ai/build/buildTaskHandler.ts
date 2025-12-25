/**
 * Build 任务处理器
 * 负责 build 模式的任务执行
 * 
 * 设计原则：
 * - 复用 TaskRunner，与 chat/plan 模式保持一致的执行流程
 * - 实现自我修复循环，在失败时尝试修复
 * - 支持终止条件检查和 repair 预算管理
 */

import { createTaskRunner } from '../core/taskRunner.ts';
import { BUILD_CONFIG } from './buildConfig.ts';
import { writeBuildLog } from '../logging/buildLog.ts';
import type { BuildTaskInput, BuildTaskResult } from './types.ts';
import type { TaskRunnerResult } from '../types.ts';

export interface RepairConfig {
  maxRepairAttempts: number;
  repairBudget: number;
}

export interface RepairContext {
  attemptNumber: number;
  previousErrors: string[];
  totalIterationsUsed: number;
}

const DEFAULT_REPAIR_CONFIG: RepairConfig = {
  maxRepairAttempts: 3,
  repairBudget: 100
};

function shouldAttemptRepair(
  result: TaskRunnerResult,
  repairContext: RepairContext,
  config: RepairConfig
): boolean {
  if (result.success) return false;
  if (repairContext.attemptNumber >= config.maxRepairAttempts) {
    console.log(`[BuildTaskHandler] 已达到最大修复尝试次数: ${config.maxRepairAttempts}`);
    return false;
  }
  if (repairContext.totalIterationsUsed >= config.repairBudget) {
    console.log(`[BuildTaskHandler] 已耗尽修复预算: ${config.repairBudget}`);
    return false;
  }
  
  const error = result.error || '';
  const nonRecoverableErrors = [
    'API_KEY_INVALID',
    'RATE_LIMIT_EXCEEDED',
    'CONTEXT_LENGTH_EXCEEDED',
    'PERMISSION_DENIED',
    'PROJECT_NOT_FOUND'
  ];
  
  for (const nonRecoverable of nonRecoverableErrors) {
    if (error.includes(nonRecoverable)) {
      console.log(`[BuildTaskHandler] 遇到不可恢复错误: ${nonRecoverable}`);
      return false;
    }
  }
  
  return true;
}

function buildRepairPromptSuffix(repairContext: RepairContext): string {
  if (repairContext.attemptNumber === 0) return '';
  
  const errorSummary = repairContext.previousErrors
    .slice(-3)
    .map((err, i) => `${i + 1}. ${err}`)
    .join('\n');
  
  return `

---
[自我修复模式 - 第 ${repairContext.attemptNumber} 次尝试]

之前的尝试遇到了以下问题：
${errorSummary}

请分析这些错误并采取不同的方法来解决问题。避免重复之前失败的操作。
---`;
}

/**
 * 处理 build 模式任务
 * 支持自我修复循环
 * 
 * @param input - Build 任务输入参数
 * @param repairConfig - 修复配置（可选）
 * @returns Build 任务执行结果
 */
export async function handleBuildTask(
  input: BuildTaskInput,
  repairConfig: Partial<RepairConfig> = {}
): Promise<BuildTaskResult> {
  const { task, supabase, apiKey, projectFilesContext } = input;
  const config: RepairConfig = { ...DEFAULT_REPAIR_CONFIG, ...repairConfig };

  const versionId = projectFilesContext?.versionId || BUILD_CONFIG.defaultVersionId;
  const bucket = projectFilesContext?.bucket || BUILD_CONFIG.defaultBucket;
  const basePath = projectFilesContext?.path || `${task.project_id}/${versionId}`;

  const repairContext: RepairContext = {
    attemptNumber: 0,
    previousErrors: [],
    totalIterationsUsed: 0
  };

  let finalResult: TaskRunnerResult | null = null;
  let allModifiedFiles: string[] = [];
  let allGeneratedImages: string[] = [];

  while (true) {
    const repairSuffix = buildRepairPromptSuffix(repairContext);
    const iterationsRemaining = config.repairBudget - repairContext.totalIterationsUsed;
    const maxIterationsThisRun = Math.min(BUILD_CONFIG.maxIterations, iterationsRemaining);

    if (maxIterationsThisRun <= 0) {
      console.log(`[BuildTaskHandler] 迭代预算已耗尽`);
      break;
    }

    console.log(`[BuildTaskHandler] 开始执行 (尝试 ${repairContext.attemptNumber + 1}/${config.maxRepairAttempts + 1}, 剩余迭代: ${iterationsRemaining})`);

    const runner = createTaskRunner(
      supabase,
      {
        apiKey,
        maxIterations: maxIterationsThisRun,
      },
      {
        taskId: task.id,
        projectId: task.project_id,
        mode: 'build',
        versionId,
        bucket,
        basePath,
        payload: { 
          ...task.payload, 
          type: task.type,
          repairContext: repairContext.attemptNumber > 0 ? {
            attemptNumber: repairContext.attemptNumber,
            previousErrors: repairContext.previousErrors.slice(-3),
            repairPromptSuffix: repairSuffix
          } : undefined
        }
      }
    );

    const result = await runner.run();
    finalResult = result;

    if (result.modifiedFiles) {
      allModifiedFiles = [...new Set([...allModifiedFiles, ...result.modifiedFiles])];
    }
    if (result.generatedImages) {
      allGeneratedImages = [...new Set([...allGeneratedImages, ...result.generatedImages])];
    }

    const iterationsUsed = result.phases?.find(p => p.phase === 'agent_loop')?.data?.iterations as number || 10;
    repairContext.totalIterationsUsed += iterationsUsed;

    if (result.success) {
      console.log(`[BuildTaskHandler] 任务成功完成 (尝试 ${repairContext.attemptNumber + 1})`);
      break;
    }

    if (!shouldAttemptRepair(result, repairContext, config)) {
      console.log(`[BuildTaskHandler] 不再尝试修复`);
      break;
    }

    repairContext.attemptNumber++;
    if (result.error) {
      repairContext.previousErrors.push(result.error);
    }

    await writeBuildLog(
      supabase,
      task.project_id,
      'info',
      `开始第 ${repairContext.attemptNumber} 次自我修复尝试...`
    );
  }

  if (!finalResult) {
    return {
      success: false,
      taskId: task.id,
      error: '任务执行失败：未能获取结果'
    };
  }

  return {
    success: finalResult.success,
    taskId: finalResult.taskId,
    finalResponse: finalResult.finalResponse,
    modifiedFiles: allModifiedFiles.length > 0 ? allModifiedFiles : finalResult.modifiedFiles,
    generatedImages: allGeneratedImages.length > 0 ? allGeneratedImages : finalResult.generatedImages,
    error: finalResult.error,
    repairAttempts: repairContext.attemptNumber,
    totalIterationsUsed: repairContext.totalIterationsUsed
  };
}
