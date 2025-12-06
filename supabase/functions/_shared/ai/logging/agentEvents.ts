/**
 * Agent 事件日志模块
 * 负责记录 Agent 执行过程中的各类事件
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import type { AgentEventType, AgentEventPayload, FileEventOp } from '../types.ts';

// 写入 Agent 事件（尽力而为，不影响主流程）
export async function logAgentEvent(
  supabase: ReturnType<typeof createClient>,
  taskId: string | null,
  projectId: string,
  type: AgentEventType,
  payload: AgentEventPayload
): Promise<void> {
  try {
    const { error } = await supabase.from('agent_events').insert({
      task_id: taskId,
      project_id: projectId,
      type,
      payload
    });
    if (error) {
      console.error('[AgentEvent] 写入事件失败:', error.message);
    }
  } catch (e) {
    console.error('[AgentEvent] 写入事件异常:', e instanceof Error ? e.message : String(e));
  }
}

// 写入文件事件（尽力而为，不影响主流程）
export async function logFileEvent(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  path: string,
  op: FileEventOp,
  summary?: string,
  contentRef?: string,
  version?: string,
  fromPath?: string
): Promise<void> {
  try {
    const { error } = await supabase.from('file_events').insert({
      project_id: projectId,
      path,
      op,
      summary,
      content_ref: contentRef,
      version,
      from_path: fromPath
    });
    if (error) {
      console.error('[FileEvent] 写入事件失败:', error.message);
    }
  } catch (e) {
    console.error('[FileEvent] 写入事件异常:', e instanceof Error ? e.message : String(e));
  }
}

// 记录自我修复尝试事件
export async function logSelfRepairAttempt(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  projectId: string,
  attemptNumber: number,
  repairApplied: boolean,
  errorType: string,
  rootCause?: string
): Promise<void> {
  await logAgentEvent(supabase, taskId, projectId, 'self_repair', {
    status: 'attempt_completed',
    attemptNumber,
    repairApplied,
    errorType,
    rootCause
  });
}

// 记录自我修复最终状态事件
export async function logSelfRepairFinalStatus(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  projectId: string,
  status: string,
  totalAttempts: number,
  finalError?: string
): Promise<void> {
  await logAgentEvent(supabase, taskId, projectId, 'self_repair', {
    status: `loop_${status}`,
    totalAttempts,
    message: finalError
  });
}
