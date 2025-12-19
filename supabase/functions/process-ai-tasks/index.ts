/**
 * process-ai-tasks Edge Function
 * AI 任务处理主入口 - TaskRunner 重构版本
 * 
 * 功能：处理 AI 任务队列，支持 chat/plan/build 三种交互模式
 * 特性：阶段化执行、五层 Prompt 架构、工具调用
 * 
 * 主入口职责：
 * - CORS 处理
 * - claimTask() 抢占任务
 * - TaskRunner.run() 执行任务
 * - 简单错误处理
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';

// 导入共享模块
import {
  corsHeaders,
  // TaskRunner - 阶段化任务执行主干
  createTaskRunner,
  // 类型
  mapToInteractionMode,
  TaskType,
  WorkflowMode,
  // 日志
  writeBuildLog,
  updateTaskStatus,
  // 自我修复（保留用于兼容，chat_reply 跳过）
  processTaskWithSelfRepair,
  // Subagent 系统
  initializeBuiltinSubagents
} from '../_shared/ai/index.ts';

// 初始化内置 subagent
initializeBuiltinSubagents();

// --- 数据库操作函数 ---

/**
 * 抢占任务 - 使用 FOR UPDATE SKIP LOCKED 实现原子抢占
 * 支持新的 mode 字段，同时兼容旧的 type + payload.workflowMode
 */
async function claimTask(pgClient: Client, projectId?: string) {
  let query = `
    UPDATE ai_tasks
    SET status = 'running', started_at = NOW(), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM ai_tasks
      WHERE status = 'queued'
  `;
  const params: string[] = [];
  if (projectId) {
    params.push(projectId);
    query += ` AND project_id = $1`;
  }
  query += `
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, type, project_id, payload, attempts, max_attempts, mode;
  `;
  const result = await pgClient.queryObject<{
    id: string;
    type: string;
    project_id: string;
    payload: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
    mode?: string;
  }>(query, params);
  return result.rows[0] || null;
}

// --- 旧版任务处理函数（用于 selfRepair 兼容） ---

/**
 * @deprecated 保留用于 selfRepair 兼容，新任务应使用 TaskRunner
 */
async function processTaskLegacy(
  task: { id: string; type: string; project_id: string; payload?: Record<string, unknown>; attempts: number; max_attempts: number; mode?: string },
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  projectFilesContext?: { bucket: string; path: string; versionId?: string }
) {
  // 确定交互模式
  const mode = task.mode 
    ? (task.mode as 'chat' | 'plan' | 'build')
    : mapToInteractionMode(
        task.type as TaskType,
        task.payload?.workflowMode as WorkflowMode | undefined
      );
  
  const versionId = projectFilesContext?.versionId || 'default';
  const bucket = projectFilesContext?.bucket || 'project-files';
  const basePath = projectFilesContext?.path || `${task.project_id}/${versionId}`;
  
  // 创建 TaskRunner 并执行
  const runner = createTaskRunner(
    supabase,
    { apiKey, maxIterations: 50 },
    {
      taskId: task.id,
      projectId: task.project_id,
      mode,
      versionId,
      bucket,
      basePath,
      payload: { ...task.payload, type: task.type }
    }
  );
  
  const result = await runner.run();
  
  if (!result.success) {
    throw new Error(result.error || 'TaskRunner 执行失败');
  }
}

// --- 主服务入口 ---

Deno.serve(async (req) => {
  // CORS 处理
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  
  try {
    // 环境变量检查
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openrouterApiKey = Deno.env.get('OPENROUTER_KEY');
    const databaseUrl = Deno.env.get('SUPABASE_DB_URL');
    
    if (!openrouterApiKey || !supabaseUrl || !supabaseServiceKey || !databaseUrl) {
      throw new Error('缺少必要的环境变量设置 (URL/KEY)');
    }
    
    // 初始化客户端
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const pgClient = new Client(databaseUrl);
    await pgClient.connect();
    
    try {
      // 解析请求体
      const body = await req.json().catch(() => null);
      const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : undefined;
      const rawCtx = body?.projectFilesContext;
      const projectFilesContext = rawCtx 
        ? { bucket: rawCtx.bucket, path: rawCtx.path, versionId: rawCtx.versionId } 
        : undefined;
      
      // 抢占任务
      const task = await claimTask(pgClient, projectId);
      if (!task) {
        return new Response(
          JSON.stringify({ message: '没有待处理的任务' }), 
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`[ProcessAITasks] 成功抢占任务: ${task.id}, 类型: ${task.type}, 模式: ${task.mode || '(从 type+workflowMode 推断)'}`);
      
      // 确定交互模式
      const mode = task.mode 
        ? (task.mode as 'chat' | 'plan' | 'build')
        : mapToInteractionMode(
            task.type as TaskType,
            task.payload?.workflowMode as WorkflowMode | undefined
          );
      
      // chat/plan 模式不走自我修复循环，直接使用 TaskRunner
      if (mode === 'chat' || mode === 'plan') {
        const versionId = projectFilesContext?.versionId || 'default';
        const bucket = projectFilesContext?.bucket || 'project-files';
        const basePath = projectFilesContext?.path || `${task.project_id}/${versionId}`;
        
        const runner = createTaskRunner(
          supabase,
          { apiKey: openrouterApiKey, maxIterations: 50 },
          {
            taskId: task.id,
            projectId: task.project_id,
            mode,
            versionId,
            bucket,
            basePath,
            payload: { ...task.payload, type: task.type }
          }
        );
        
        const result = await runner.run();
        
        if (!result.success) {
          // 更新任务状态为失败
          await updateTaskStatus(supabase, task.id, 'failed', undefined, result.error);
          await writeBuildLog(supabase, task.project_id, 'error', `AI 任务处理失败: ${result.error}`);
        }
        
        return new Response(
          JSON.stringify({
            success: result.success,
            taskId: task.id,
            message: result.success ? '任务处理完成' : `任务处理失败: ${result.error}`,
            phases: result.phases,
            mode
          }), 
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // build 模式走自我修复循环（保持向后兼容）
      const selfRepairResult = await processTaskWithSelfRepair(
        task, 
        supabase, 
        openrouterApiKey, 
        projectFilesContext, 
        processTaskLegacy
      );
      
      return new Response(
        JSON.stringify({
          success: selfRepairResult.status === 'completed' || selfRepairResult.status === 'recovered',
          taskId: task.id,
          message: selfRepairResult.status === 'recovered' 
            ? `任务在 ${selfRepairResult.totalAttempts} 次尝试后成功完成（已自动修复）`
            : selfRepairResult.status === 'completed' 
              ? '任务处理完成' 
              : `任务处理失败: ${selfRepairResult.finalError}`,
          selfRepairResult,
          mode
        }), 
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } finally {
      await pgClient.end();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[ProcessAITasks] 处理请求失败:', error);
    return new Response(
      JSON.stringify({ error: '服务器错误', details: errorMessage }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
