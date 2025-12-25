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
  type InteractionMode,
  // 日志
  writeBuildLog,
  updateTaskStatus,
  // Build 模块
  handleBuildTask
} from '../_shared/ai/index.ts';

// --- 数据库操作函数 ---

/**
 * 抢占任务 - 使用 FOR UPDATE SKIP LOCKED 实现原子抢占
 * 
 * 任务分发基于 task.type 字段（chat/plan/build）
 * mode 字段已废弃，不再使用
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
    RETURNING id, type, project_id, payload, attempts, max_attempts;
  `;
  const result = await pgClient.queryObject<{
    id: string;
    type: string;
    project_id: string;
    payload: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
  }>(query, params);
  return result.rows[0] || null;
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
      
      console.log(`[ProcessAITasks] 成功抢占任务: ${task.id}, 类型: ${task.type}`);
      
      // 确定交互模式 - 直接使用 task.type（chat/plan/build）
      // 验证 type 是否为有效的 InteractionMode
      const validModes: InteractionMode[] = ['chat', 'plan', 'build'];
      const mode: InteractionMode = validModes.includes(task.type as InteractionMode) 
        ? (task.type as InteractionMode)
        : 'chat'; // 默认回退到 chat 模式
      
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
      
      // build 模式使用 handleBuildTask
      const buildResult = await handleBuildTask({
        task: {
          id: task.id,
          type: task.type,
          project_id: task.project_id,
          payload: task.payload,
          attempts: task.attempts,
          max_attempts: task.max_attempts
        },
        supabase,
        apiKey: openrouterApiKey,
        projectFilesContext
      });
      
      if (!buildResult.success) {
        await updateTaskStatus(supabase, task.id, 'failed', undefined, buildResult.error);
        await writeBuildLog(supabase, task.project_id, 'error', `AI 任务处理失败: ${buildResult.error}`);
      }
      
      return new Response(
        JSON.stringify({
          success: buildResult.success,
          taskId: task.id,
          message: buildResult.success ? '任务处理完成' : `任务处理失败: ${buildResult.error}`,
          modifiedFiles: buildResult.modifiedFiles,
          generatedImages: buildResult.generatedImages,
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
