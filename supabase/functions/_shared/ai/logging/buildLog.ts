/**
 * 构建日志模块
 * 负责写入构建日志、助手消息和更新任务状态
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

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
