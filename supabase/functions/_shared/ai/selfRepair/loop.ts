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
  SelfRepairLoopResult,
  VerificationResult
} from '../types.ts';
import { writeBuildLog, logSelfRepairAttemptToBuildLog, logSelfRepairFinalStatusToBuildLog } from '../logging/buildLog.ts';
import { logAgentEvent } from '../logging/agentEvents.ts';
import { handleWriteFile, handleDeleteFile } from '../tools/fileOperations.ts';
import { isRepairableError, collectErrorContext, invokeDebugger } from './debugger.ts';

// 应用修复建议
export async function applyRepairSuggestions(
  toolContext: ToolContext,
  suggestions: DebuggerSuggestion,
  supabase: ReturnType<typeof createClient>,
  projectId: string
): Promise<{ success: boolean; appliedFiles: string[] }> {
  const appliedFiles: string[] = [];
  
  console.log(`[SelfRepairLoop] 应用 ${suggestions.fileModifications.length} 个文件修改...`);
  
  for (const mod of suggestions.fileModifications) {
    try {
      if (mod.action === 'delete') {
        const result = await handleDeleteFile(toolContext, { path: mod.path });
        if (result.success) {
          appliedFiles.push(mod.path);
          await writeBuildLog(supabase, projectId, 'info', `[SelfRepairLoop] 已删除文件: ${mod.path}`);
        } else {
          console.error(`[SelfRepairLoop] 删除文件失败: ${mod.path}`, result.error);
        }
      } else if ((mod.action === 'create' || mod.action === 'modify') && mod.content) {
        const result = await handleWriteFile(toolContext, { path: mod.path, content: mod.content });
        if (result.success) {
          appliedFiles.push(mod.path);
          await writeBuildLog(supabase, projectId, 'info', `[SelfRepairLoop] 已${mod.action === 'create' ? '创建' : '修改'}文件: ${mod.path}`);
        } else {
          console.error(`[SelfRepairLoop] 写入文件失败: ${mod.path}`, result.error);
        }
      }
    } catch (e) {
      console.error(`[SelfRepairLoop] 应用修改失败 (${mod.path}):`, e);
    }
  }
  
  return {
    success: appliedFiles.length > 0,
    appliedFiles
  };
}

// 运行验证命令（模拟验证，因为 Edge Function 环境无法直接执行 shell 命令）
export async function runVerificationCommands(
  commands: string[],
  supabase: ReturnType<typeof createClient>,
  projectId: string
): Promise<VerificationResult> {
  console.log(`[SelfRepairLoop] 验证命令: ${commands.join(', ')}`);
  
  await writeBuildLog(supabase, projectId, 'info', `[SelfRepairLoop] 修复已应用，将在下次执行时验证: ${commands.join(', ')}`);
  
  return {
    command: commands.join(' && '),
    success: true,
    output: '修复已应用，等待重新执行验证'
  };
}

// 自我修复循环包装函数
export async function processTaskWithSelfRepair(
  task: { id: string; type: string; project_id: string; payload?: Record<string, unknown>; attempts: number; max_attempts: number },
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  projectFilesContext: { bucket: string; path: string; versionId?: string } | undefined,
  processTaskFn: (task: unknown, supabase: ReturnType<typeof createClient>, apiKey: string, projectFilesContext: unknown) => Promise<void>
): Promise<SelfRepairLoopResult> {
  const repairHistory: RepairAttempt[] = [];
  let lastError: Error | null = null;
  
  // chat_reply 任务不走自我修复循环
  if (task.type === 'chat_reply') {
    console.log(`[SelfRepairLoop] chat_reply 任务跳过自我修复循环`);
    try {
      await processTaskFn(task, supabase, apiKey, projectFilesContext);
      return {
        status: 'completed',
        totalAttempts: 1,
        repairHistory: []
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        status: 'failed',
        totalAttempts: 1,
        repairHistory: [],
        finalError: errorMessage
      };
    }
  }
  
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
              const verificationResult = await runVerificationCommands(
                debuggerSuggestion.verificationCommands,
                supabase,
                task.project_id
              );
              attempt.verificationResult = verificationResult;
            }
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
