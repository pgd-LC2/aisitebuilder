/**
 * 构建日志模块
 * 负责写入构建日志、助手消息和更新任务状态
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import type { RepairAttempt, SelfRepairLoopResult } from '../types.ts';

// 写入构建日志
export async function writeBuildLog(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  logType: string,
  message: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await supabase.from('build_logs').insert({
    project_id: projectId,
    log_type: logType,
    message: message,
    metadata
  });
  if (error) console.error('写入构建日志失败:', error);
}

// 写入助手消息
export async function writeAssistantMessage(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  content: string
): Promise<string | null> {
  const { data, error } = await supabase.from('chat_messages').insert({
    project_id: projectId,
    role: 'assistant',
    content: content,
    metadata: {}
  }).select().maybeSingle();
  if (error) {
    console.error('写入助手消息失败:', error);
    return null;
  }
  return data?.id || null;
}

// 更新任务状态
export async function updateTaskStatus(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  status: string,
  result?: Record<string, unknown>,
  errorMsg?: string
): Promise<void> {
  const updateData: Record<string, unknown> = {
    status: status,
    finished_at: new Date().toISOString()
  };
  if (result) updateData.result = result;
  if (errorMsg) updateData.error = errorMsg;
  const { error } = await supabase.from('ai_tasks').update(updateData).eq('id', taskId);
  if (error) console.error('更新任务状态失败:', error);
}

// 自我修复循环日志
export async function logSelfRepairAttemptToBuildLog(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  taskId: string,
  taskType: string,
  attempt: RepairAttempt,
  startTime?: number
): Promise<void> {
  const duration = startTime ? Date.now() - startTime : undefined;
  
  const logMessage = `[SelfRepairLoop] 修复尝试 #${attempt.attemptNumber}
- 任务ID: ${taskId}
- 任务类型: ${taskType}
- 错误类型: ${attempt.errorContext.errorType}
- 错误摘要: ${attempt.errorContext.errorMessage.substring(0, 200)}
- Debugger 已调用: ${attempt.debuggerResponse ? '是' : '否'}
- 修复已应用: ${attempt.repairApplied}
- 验证结果: ${attempt.verificationResult?.success ? '成功' : '待验证'}
${duration ? `- 耗时: ${duration}ms` : ''}`;

  await writeBuildLog(supabase, projectId, 'info', logMessage, {
    taskId,
    taskType,
    attempt: attempt.attemptNumber,
    errorCategory: attempt.errorContext.errorType,
    status: attempt.repairApplied ? 'repair_applied' : 'repair_pending',
    duration,
    selfRepairAttempt: attempt.attemptNumber,
    errorType: attempt.errorContext.errorType,
    repairApplied: attempt.repairApplied,
    attemptIndex: attempt.attemptNumber - 1,
    fixApplied: attempt.repairApplied,
    verifications: attempt.verificationResult ? [attempt.verificationResult.command] : [],
    result: attempt.verificationResult?.success ? 'success' : 'pending'
  });
}

// 自我修复循环最终状态日志
export async function logSelfRepairFinalStatusToBuildLog(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  taskId: string,
  taskType: string,
  result: SelfRepairLoopResult,
  totalDuration?: number
): Promise<void> {
  const statusMessages: Record<string, string> = {
    'completed': '任务成功完成（无需修复）',
    'recovered': '任务在修复后成功完成',
    'failed_after_repair': `任务在 ${result.totalAttempts} 次修复尝试后仍然失败`,
    'failed': '任务失败（错误不可修复）'
  };
  
  const logMessage = `[SelfRepairLoop] 最终状态: ${result.status}
- ${statusMessages[result.status]}
- 总尝试次数: ${result.totalAttempts}
${result.finalError ? `- 最终错误: ${result.finalError}` : ''}
${totalDuration ? `- 总耗时: ${totalDuration}ms` : ''}`;

  await writeBuildLog(
    supabase, 
    projectId, 
    result.status === 'recovered' || result.status === 'completed' ? 'success' : 'error', 
    logMessage, 
    {
      taskId,
      taskType,
      attempt: result.totalAttempts,
      errorCategory: result.repairHistory.length > 0 ? result.repairHistory[result.repairHistory.length - 1].errorContext.errorType : 'none',
      status: result.status,
      duration: totalDuration,
      selfRepairStatus: result.status,
      totalAttempts: result.totalAttempts,
      repairHistory: result.repairHistory.map(h => ({
        attemptIndex: h.attemptNumber - 1,
        attempt: h.attemptNumber,
        errorType: h.errorContext.errorType,
        errorCategory: h.errorContext.errorType,
        fixApplied: h.repairApplied,
        repairApplied: h.repairApplied,
        verifications: h.verificationResult ? [h.verificationResult.command] : [],
        result: h.verificationResult?.success ? 'success' : 'pending'
      }))
    }
  );
}
