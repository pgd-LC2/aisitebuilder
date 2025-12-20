/**
 * 自我修复循环模块
 * 负责管理任务执行和错误修复的完整循环
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { SELF_REPAIR_MAX } from '../config.ts';
import type { 
  ToolContext, 
  DebuggerSuggestion, 
  RepairAttempt, 
  SelfRepairLoopResult
} from '../types.ts';
import { writeBuildLog, logSelfRepairAttemptToBuildLog, logSelfRepairFinalStatusToBuildLog } from '../logging/buildLog.ts';
import { logAgentEvent } from '../logging/agentEvents.ts';
import { handleWriteFile, handleDeleteFile } from '../tools/fileOperations.ts';
import { isRepairableError, collectErrorContext, invokeDebugger } from './debugger.ts';

/**
 * 应用修复建议
 * 
 * 设计原则：强一致性 - 任意文件操作失败 = 整体失败
 * 不再使用 "appliedFiles.length > 0 即成功" 的弱一致逻辑
 */
export async function applyRepairSuggestions(
  toolContext: ToolContext,
  suggestions: DebuggerSuggestion,
  supabase: ReturnType<typeof createClient>,
  projectId: string
): Promise<{ success: boolean; appliedFiles: string[]; failedFiles: string[] }> {
  const appliedFiles: string[] = [];
  const failedFiles: string[] = [];
  
  console.log(`[SelfRepairLoop] 应用 ${suggestions.fileModifications.length} 个文件修改...`);
  
  for (const mod of suggestions.fileModifications) {
    try {
      if (mod.action === 'delete') {
        const result = await handleDeleteFile(toolContext, { path: mod.path });
        if (result.success) {
          appliedFiles.push(mod.path);
          await writeBuildLog(supabase, projectId, 'info', `[SelfRepairLoop] 已删除文件: ${mod.path}`);
        } else {
          failedFiles.push(mod.path);
          console.error(`[SelfRepairLoop] 删除文件失败: ${mod.path}`, result.error);
          await writeBuildLog(supabase, projectId, 'error', `[SelfRepairLoop] 删除文件失败: ${mod.path} - ${result.error}`);
        }
      } else if ((mod.action === 'create' || mod.action === 'modify') && mod.content) {
        const result = await handleWriteFile(toolContext, { path: mod.path, content: mod.content });
        if (result.success) {
          appliedFiles.push(mod.path);
          await writeBuildLog(supabase, projectId, 'info', `[SelfRepairLoop] 已${mod.action === 'create' ? '创建' : '修改'}文件: ${mod.path}`);
        } else {
          failedFiles.push(mod.path);
          console.error(`[SelfRepairLoop] 写入文件失败: ${mod.path}`, result.error);
          await writeBuildLog(supabase, projectId, 'error', `[SelfRepairLoop] 写入文件失败: ${mod.path} - ${result.error}`);
        }
      }
    } catch (e) {
      failedFiles.push(mod.path);
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`[SelfRepairLoop] 应用修改失败 (${mod.path}):`, e);
      await writeBuildLog(supabase, projectId, 'error', `[SelfRepairLoop] 应用修改异常: ${mod.path} - ${errorMessage}`);
    }
  }
  
  return {
    success: failedFiles.length === 0 && appliedFiles.length > 0,
    appliedFiles,
    failedFiles
  };
}

/**
 * 自我修复循环包装函数
 * 
 * 设计原则：
 * - 职责单一：只负责执行修复循环，不判断任务类型
 * - 任务类型判断应在入口层（调用方）进行
 * - 进入此函数的任务一定允许修复
 */
export async function processTaskWithSelfRepair(
  task: { id: string; type: string; project_id: string; payload?: Record<string, unknown>; attempts: number; max_attempts: number },
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  projectFilesContext: { bucket: string; path: string; versionId?: string } | undefined,
  processTaskFn: (task: unknown, supabase: ReturnType<typeof createClient>, apiKey: string, projectFilesContext: unknown) => Promise<void>
): Promise<SelfRepairLoopResult> {
  const repairHistory: RepairAttempt[] = [];
  let lastError: Error | null = null;
  
  console.log(`[SelfRepairLoop] 开始自我修复循环，任务: ${task.id}, 类型: ${task.type}, 最大尝试次数: ${SELF_REPAIR_MAX}`);
  await writeBuildLog(supabase, task.project_id, 'info', `[SelfRepairLoop] 启动自我修复循环 (最大 ${SELF_REPAIR_MAX} 次尝试)`);
  
  await logAgentEvent(supabase, task.id, task.project_id, 'self_repair', {
    status: 'loop_started',
    maxAttempts: SELF_REPAIR_MAX,
    taskType: task.type
  });
  
  const versionId = projectFilesContext?.versionId || 'default';
  const bucket = projectFilesContext?.bucket || 'project-files';
  const basePath = projectFilesContext?.path || `${task.project_id}/${versionId}`;
  
  const toolContext: ToolContext = {
    supabase,
    projectId: task.project_id,
    versionId,
    bucket,
    basePath
  };
  
  let modifiedFiles: string[] = [];
  
  for (let repairAttempt = 0; repairAttempt < SELF_REPAIR_MAX; repairAttempt++) {
    console.log(`[SelfRepairLoop] 尝试 #${repairAttempt + 1}/${SELF_REPAIR_MAX}`);
    
    try {
      await processTaskFn(task, supabase, apiKey, projectFilesContext);
      
      const result: SelfRepairLoopResult = {
        status: repairAttempt === 0 ? 'completed' : 'recovered',
        totalAttempts: repairAttempt + 1,
        repairHistory
      };
      
      await logSelfRepairFinalStatusToBuildLog(supabase, task.project_id, task.id, task.type, result);
      return result;
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.log(`[SelfRepairLoop] 任务执行失败 (尝试 #${repairAttempt + 1}): ${lastError.message}`);
      
      if (!isRepairableError(lastError)) {
        console.log(`[SelfRepairLoop] 错误不可修复，停止循环`);
        const result: SelfRepairLoopResult = {
          status: 'failed',
          totalAttempts: repairAttempt + 1,
          repairHistory,
          finalError: lastError.message
        };
        await logSelfRepairFinalStatusToBuildLog(supabase, task.project_id, task.id, task.type, result);
        throw lastError;
      }
      
      if (repairAttempt >= SELF_REPAIR_MAX - 1) {
        console.log(`[SelfRepairLoop] 已达到最大尝试次数，停止循环`);
        break;
      }
      
      const errorContext = await collectErrorContext(
        supabase,
        task.project_id,
        lastError,
        toolContext,
        modifiedFiles
      );
      
      const attempt: RepairAttempt = {
        attemptNumber: repairAttempt + 1,
        errorContext,
        repairApplied: false,
        timestamp: new Date().toISOString()
      };
      
      await writeBuildLog(supabase, task.project_id, 'info', `[SelfRepairLoop] 调用 Debugger 进行诊断...`);
      const debuggerSuggestion = await invokeDebugger(
        supabase,
        errorContext,
        apiKey
      );
      
      if (debuggerSuggestion) {
        attempt.debuggerResponse = debuggerSuggestion;
        console.log(`[SelfRepairLoop] Debugger 诊断完成: ${debuggerSuggestion.rootCause}`);
        await writeBuildLog(supabase, task.project_id, 'info', `[SelfRepairLoop] Debugger 诊断: ${debuggerSuggestion.rootCause}`);
        
        if (debuggerSuggestion.fileModifications.length > 0) {
          const applyResult = await applyRepairSuggestions(
            toolContext,
            debuggerSuggestion,
            supabase,
            task.project_id
          );
          
          attempt.repairApplied = applyResult.success;
          modifiedFiles = [...modifiedFiles, ...applyResult.appliedFiles];
          
          if (applyResult.success) {
            console.log(`[SelfRepairLoop] 修复已应用: ${applyResult.appliedFiles.join(', ')}`);
            
            if (debuggerSuggestion.verificationCommands.length > 0) {
              await writeBuildLog(supabase, task.project_id, 'info', 
                `[SelfRepairLoop] 验证命令已记录，将在下次执行时验证: ${debuggerSuggestion.verificationCommands.join(', ')}`);
            }
          } else {
            console.log(`[SelfRepairLoop] 修复应用失败: ${applyResult.failedFiles.join(', ')}`);
            await writeBuildLog(supabase, task.project_id, 'error', 
              `[SelfRepairLoop] 修复应用失败，失败文件: ${applyResult.failedFiles.join(', ')}`);
          }
        }
      } else {
        console.log(`[SelfRepairLoop] Debugger 未能提供修复建议`);
        await writeBuildLog(supabase, task.project_id, 'warning', `[SelfRepairLoop] Debugger 未能提供修复建议`);
      }
      
      repairHistory.push(attempt);
      await logSelfRepairAttemptToBuildLog(supabase, task.project_id, task.id, task.type, attempt);
      
      await logAgentEvent(supabase, task.id, task.project_id, 'self_repair', {
        status: 'attempt_completed',
        attemptNumber: repairAttempt + 1,
        repairApplied: attempt.repairApplied,
        errorType: errorContext.errorType,
        rootCause: debuggerSuggestion?.rootCause
      });
    }
  }
  
  const result: SelfRepairLoopResult = {
    status: 'failed_after_repair',
    totalAttempts: SELF_REPAIR_MAX,
    repairHistory,
    finalError: lastError?.message || '未知错误'
  };
  
  await logSelfRepairFinalStatusToBuildLog(supabase, task.project_id, task.id, task.type, result);
  
  return result;
}
