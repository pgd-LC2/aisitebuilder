/**
 * process-ai-tasks Edge Function
 * AI 任务处理主入口 - 模块化重构版本
 * 
 * 功能：处理 AI 任务队列，支持 chat_reply、build_site、refactor_code 三种任务类型
 * 特性：五层 Prompt 架构、自我修复循环、工具调用
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';

// 导入共享模块
import {
  corsHeaders,
  MODEL_CONFIG,
  getFilteredTools,
  ChatMessage,
  PromptRouterContext,
  TaskType,
  WorkflowMode,
  assembleSystemPrompt,
  writeBuildLog,
  writeAssistantMessage,
  updateTaskStatus,
  logAgentEvent,
  processTaskWithSelfRepair,
  // AgentLoop - 统一的 Agent 循环
  runAgentLoop,
  AgentLoopConfig,
  AgentLoopContext,
  // Subagent 系统
  initializeBuiltinSubagents
} from '../_shared/ai/index.ts';

// 初始化内置 subagent
initializeBuiltinSubagents();

// --- 数据库操作函数 ---

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

async function fetchRecentChatMessages(supabase: ReturnType<typeof createClient>, projectId: string, limit = 10) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`获取聊天记录失败: ${error.message}`);
  return (data || []).reverse();
}

async function getProjectFileContext(supabase: ReturnType<typeof createClient>, bucket: string, basePath: string) {
  const { data: fileList, error: listError } = await supabase.storage
    .from(bucket)
    .list(basePath, { limit: 20, sortBy: { column: 'name', order: 'asc' } });
  if (listError) {
    console.error('获取项目文件列表失败:', listError);
    return '';
  }
  const textExtensions = ['.html', '.css', '.js', '.ts', '.tsx', '.jsx', '.json', '.md'];
  const filesToRead = (fileList || []).filter(f => f.id && textExtensions.some(ext => f.name.endsWith(ext))).slice(0, 5);
  const fileContents: string[] = [];
  for (const file of filesToRead) {
    const filePath = `${basePath}/${file.name}`.replace(/\/+/g, '/');
    const { data, error } = await supabase.storage.from(bucket).download(filePath);
    if (!error && data) {
      const content = await data.text();
      fileContents.push(`### ${file.name}\n\`\`\`\n${content.substring(0, 2000)}\n\`\`\``);
    }
  }
  return fileContents.join('\n\n');
}

// --- 主任务处理函数 ---

async function processTask(
  task: { id: string; type: string; project_id: string; payload?: Record<string, unknown>; attempts: number; max_attempts: number },
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  projectFilesContext?: { bucket: string; path: string; versionId?: string }
) {
  console.log(`开始处理任务: ${task.id}, 类型: ${task.type}`);
  const model = MODEL_CONFIG[task.type] || MODEL_CONFIG.default;
  
  try {
    await writeBuildLog(supabase, task.project_id, 'info', `开始处理 AI 任务: ${task.type} (Model: ${model})`);
    await logAgentEvent(supabase, task.id, task.project_id, 'agent_phase', { phase: 'started', status: 'running', taskType: task.type, model });
    
    let fileContextStr = "";
    if (task.type !== 'chat_reply' && projectFilesContext?.bucket && projectFilesContext?.path) {
      await writeBuildLog(supabase, task.project_id, 'info', `正在读取项目文件...`);
      fileContextStr = await getProjectFileContext(supabase, projectFilesContext.bucket, projectFilesContext.path);
    }
    
    const versionId = projectFilesContext?.versionId || 'default';
    const bucket = projectFilesContext?.bucket || 'project-files';
    const basePath = projectFilesContext?.path || `${task.project_id}/${versionId}`;
    
    const workflowMode = task.payload?.workflowMode as WorkflowMode | undefined;
    const routerContext: PromptRouterContext = {
      taskType: task.type as TaskType,
      hasError: !!task.payload?.errorInfo,
      errorInfo: task.payload?.errorInfo as string | undefined,
      isNewProject: !fileContextStr || fileContextStr.length < 100,
      workflowMode
    };
    
    if (workflowMode) {
      console.log(`[ProcessAITasks] 工作流模式: ${workflowMode}`);
      await writeBuildLog(supabase, task.project_id, 'info', `工作流模式: ${workflowMode}`);
    }
    
    await writeBuildLog(supabase, task.project_id, 'info', `正在加载提示词 (PromptRouter)...`);
    const fileContextSection = fileContextStr ? `\n\n## 当前项目文件参考\n${fileContextStr}` : '';
    const systemPrompt = await assembleSystemPrompt(supabase, routerContext, fileContextSection);
    
    let messages: { role: string; content: string }[] = [];
    
    if (task.type === 'chat_reply') {
      const chatHistory = await fetchRecentChatMessages(supabase, task.project_id, 10);
      messages = [{ role: 'system', content: systemPrompt }, ...chatHistory.map(msg => ({ role: msg.role, content: msg.content }))];
    } else if (task.type === 'build_site') {
      // 方案A: 兼容修复 - 优先使用 requirement，fallback 到 content
      const requirement = (task.payload?.requirement as string) 
        || (task.payload?.content as string) 
        || "创建基础着陆页";
      
      // 方案C: 如果有 planSummary，构建更丰富的上下文
      const planSummary = task.payload?.planSummary as { 
        requirement?: string; 
        technicalPlan?: string; 
        implementationSteps?: string[] 
      } | undefined;
      
      let userMessage: string;
      if (planSummary && planSummary.technicalPlan) {
        // 有完整的规划摘要，使用结构化上下文
        const stepsText = planSummary.implementationSteps?.length 
          ? `\n\n实施步骤：\n${planSummary.implementationSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
          : '';
        userMessage = `请帮我构建网站。

## 需求
${planSummary.requirement || requirement}

## 技术方案
${planSummary.technicalPlan}${stepsText}

请严格按照上述计划执行。`;
      } else {
        // 没有规划摘要，获取聊天历史作为上下文
        const chatHistory = await fetchRecentChatMessages(supabase, task.project_id, 5);
        if (chatHistory.length > 0) {
          // 有聊天历史，将其作为上下文
          const historyContext = chatHistory
            .map(msg => `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}`)
            .join('\n\n');
          userMessage = `请帮我构建网站。

## 对话上下文
${historyContext}

## 当前需求
${requirement}

请根据上述对话上下文和当前需求进行构建。`;
        } else {
          // 没有聊天历史，使用简单格式
          userMessage = `请帮我构建网站，需求如下：${requirement}`;
        }
      }
      
      messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }];
    } else if (task.type === 'refactor_code') {
      // 方案A: 兼容修复 - 优先使用 code/filePath，fallback 到 content
      const code = (task.payload?.code as string) || (task.payload?.content as string) || "";
      const filePath = (task.payload?.filePath as string) || "";
      messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: filePath ? `请重构文件 ${filePath} 中的代码` : `请重构以下代码：\n\`\`\`\n${code}\n\`\`\`` }];
    } else {
      throw new Error(`不支持的任务类型: ${task.type}`);
    }
    
    console.log(`调用 OpenRouter Chat Completions API, Model: ${model}, Msg Count: ${messages.length}`);
    
    // 构建 AgentLoop 配置
    const agentLoopConfig: AgentLoopConfig = {
      model,
      apiKey,
      tools: getFilteredTools(task.type as TaskType, workflowMode),
      toolChoice: task.type === 'chat_reply' ? 'auto' : 'required',
      maxIterations: 50
    };
    
    // 构建 AgentLoop 上下文
    const agentLoopContext: AgentLoopContext = {
      supabase,
      projectId: task.project_id,
      taskId: task.id,
      versionId,
      bucket,
      basePath,
      nestingLevel: (task.payload?.nestingLevel as number) || 0,
      projectFilesContext: projectFilesContext ? { bucket, path: basePath, versionId } : undefined
    };
    
    // 转换消息格式
    const chatMessages: ChatMessage[] = messages.map(msg => ({ 
      role: msg.role as 'system' | 'user' | 'assistant', 
      content: msg.content 
    }));
    
    // 运行统一的 Agent 循环
    const loopResult = await runAgentLoop(chatMessages, agentLoopConfig, agentLoopContext);
    
    // 检查循环结果
    if (!loopResult.success) {
      throw new Error(loopResult.error || 'Agent 循环执行失败');
    }
    
    const resultData: Record<string, unknown> = { 
      text: loopResult.finalResponse, 
      model, 
      processed_files: !!fileContextStr, 
      generated_images: loopResult.generatedImages, 
      modified_files: loopResult.modifiedFiles, 
      iterations: loopResult.iterations 
    };
    const messageId = await writeAssistantMessage(supabase, task.project_id, loopResult.finalResponse);
    if (!messageId) throw new Error('写入助手消息失败');
    resultData.messageId = messageId;
    
    await writeBuildLog(supabase, task.project_id, 'success', `AI 任务处理完成 (${loopResult.iterations} 次迭代, ${loopResult.modifiedFiles.length} 个文件修改)`);
    await updateTaskStatus(supabase, task.id, 'completed', resultData);
    await logAgentEvent(supabase, task.id, task.project_id, 'agent_phase', { phase: 'completed', status: 'completed', iterations: loopResult.iterations, modifiedFilesCount: loopResult.modifiedFiles.length, generatedImagesCount: loopResult.generatedImages.length });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`处理任务 ${task.id} 失败:`, error);
    await writeBuildLog(supabase, task.project_id, 'error', `AI 任务处理失败: ${errorMessage}`);
    await logAgentEvent(supabase, task.id, task.project_id, 'error', { errorMessage, errorType: 'task_execution_error', attempts: task.attempts });
    
    if (task.attempts >= task.max_attempts) {
      await updateTaskStatus(supabase, task.id, 'failed', undefined, errorMessage);
    } else {
      await supabase.from('ai_tasks').update({ status: 'queued', error: `Attempt ${task.attempts} failed: ${errorMessage}` }).eq('id', task.id);
    }
    throw error;
  }
}

// --- 主服务入口 ---

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openrouterApiKey = Deno.env.get('OPENROUTER_KEY');
    const databaseUrl = Deno.env.get('SUPABASE_DB_URL');
    
    if (!openrouterApiKey || !supabaseUrl || !supabaseServiceKey || !databaseUrl) {
      throw new Error('缺少必要的环境变量设置 (URL/KEY)');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const pgClient = new Client(databaseUrl);
    await pgClient.connect();
    
    try {
      const body = await req.json().catch(() => null);
      const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : undefined;
      const rawCtx = body?.projectFilesContext;
      const projectFilesContext = rawCtx ? { bucket: rawCtx.bucket, path: rawCtx.path, versionId: rawCtx.versionId } : undefined;
      
      const task = await claimTask(pgClient, projectId);
      if (!task) {
        return new Response(JSON.stringify({ message: '没有待处理的任务' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
      console.log(`成功抢占任务: ${task.id}`);
      const selfRepairResult = await processTaskWithSelfRepair(task, supabase, openrouterApiKey, projectFilesContext, processTask);
      
      return new Response(JSON.stringify({
        success: selfRepairResult.status === 'completed' || selfRepairResult.status === 'recovered',
        taskId: task.id,
        message: selfRepairResult.status === 'recovered' 
          ? `任务在 ${selfRepairResult.totalAttempts} 次尝试后成功完成（已自动修复）`
          : selfRepairResult.status === 'completed' ? '任务处理完成' : `任务处理失败: ${selfRepairResult.finalError}`,
        selfRepairResult
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } finally {
      await pgClient.end();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('处理请求失败:', error);
    return new Response(JSON.stringify({ error: '服务器错误', details: errorMessage }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
