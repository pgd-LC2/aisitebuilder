/**
 * Agent 事件日志模块
 * 负责记录 Agent 执行过程中的各类事件
 * 
 * 支持的 Progress 事件 kind:
 * - stage_enter / stage_exit: 阶段进入/退出
 * - iteration_start: 迭代开始
 * - tool_start / tool_complete: 工具执行开始/完成
 * - thinking: AI 正在思考
 * - stream_delta / stream_complete: 流式输出
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import type { 
  AgentEventType, 
  AgentEventPayload, 
  FileEventOp,
  ProgressEventKind,
  ProgressEventPayload,
  TaskPhase
} from '../types.ts';

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

/**
 * 记录进度事件（用于 UI 实时展示和重放）
 * 
 * 事件类型说明：
 * - stage_enter/stage_exit: 阶段进入/退出
 * - iteration_start: 迭代开始
 * - tool_start/tool_complete: 工具执行开始/完成
 * - thinking: AI 正在思考
 * - stream_delta: 流式输出 chunk
 * - stream_complete: 流式输出完成
 */
export async function logProgressEvent(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  projectId: string,
  kind: ProgressEventKind,
  data?: Partial<Omit<ProgressEventPayload, 'kind' | 'timestamp'>>
): Promise<void> {
  const payload: ProgressEventPayload = {
    kind,
    timestamp: new Date().toISOString(),
    ...data
  };
  
  await logAgentEvent(supabase, taskId, projectId, 'agent_phase', payload as AgentEventPayload);
}

/**
 * 记录阶段进入事件
 */
export async function logStageEnter(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  projectId: string,
  stage: TaskPhase,
  message?: string
): Promise<void> {
  await logProgressEvent(supabase, taskId, projectId, 'stage_enter', {
    stage,
    message
  });
}

/**
 * 记录阶段退出事件
 */
export async function logStageExit(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  projectId: string,
  stage: TaskPhase,
  message?: string
): Promise<void> {
  await logProgressEvent(supabase, taskId, projectId, 'stage_exit', {
    stage,
    message
  });
}

/**
 * 记录迭代开始事件
 */
export async function logIterationStart(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  projectId: string,
  iteration: number,
  totalIterations?: number
): Promise<void> {
  await logProgressEvent(supabase, taskId, projectId, 'iteration_start', {
    iteration,
    totalIterations
  });
}

/**
 * 记录工具开始事件
 */
export async function logToolStart(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  projectId: string,
  toolName: string,
  toolArgs?: Record<string, unknown>
): Promise<void> {
  await logProgressEvent(supabase, taskId, projectId, 'tool_start', {
    toolName,
    toolArgs
  });
}

/**
 * 记录工具完成事件
 */
export async function logToolComplete(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  projectId: string,
  toolName: string,
  toolResult?: unknown,
  toolSuccess?: boolean
): Promise<void> {
  await logProgressEvent(supabase, taskId, projectId, 'tool_complete', {
    toolName,
    toolResult,
    toolSuccess
  });
}

/**
 * 记录流式输出 delta 事件
 * 用于 token 级流式输出
 */
export async function logStreamDelta(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  projectId: string,
  delta: string,
  seq: number,
  messageId: string
): Promise<void> {
  await logProgressEvent(supabase, taskId, projectId, 'stream_delta', {
    delta,
    seq,
    messageId
  });
}

/**
 * 记录流式输出完成事件
 */
export async function logStreamComplete(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  projectId: string,
  messageId: string,
  message?: string
): Promise<void> {
  await logProgressEvent(supabase, taskId, projectId, 'stream_complete', {
    messageId,
    message
  });
}
