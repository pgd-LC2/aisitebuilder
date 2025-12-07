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
  ToolContext,
  PromptRouterContext,
  TaskType,
  WorkflowMode,
  assembleSystemPrompt,
  callOpenRouterChatCompletionsApi,
  generateImage,
  saveImageToStorage,
  executeToolCall,
  writeBuildLog,
  writeAssistantMessage,
  updateTaskStatus,
  logAgentEvent,
  processTaskWithSelfRepair,
  // Subagent 系统
  initializeBuiltinSubagents,
  executeSubagent,
  canSpawnSubagent,
  SubagentContext,
  SubagentTaskParams,
  SubagentType
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
    
    const toolContext: ToolContext = { supabase, projectId: task.project_id, versionId, bucket, basePath };
    
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
    
    let iteration = 0;
    let finalResponse = '';
    const generatedImages: string[] = [];
    const modifiedFiles: string[] = [];
    const chatMessages: ChatMessage[] = messages.map(msg => ({ role: msg.role as 'system' | 'user' | 'assistant', content: msg.content }));
    
    while (true) {
      iteration++;
      console.log(`Agent 迭代 ${iteration}`);
      await writeBuildLog(supabase, task.project_id, 'info', `Agent 执行中 (迭代 ${iteration})...`);
      
      // 根据任务类型动态设置 toolChoice
      // - chat_reply: 使用 'auto'，允许模型选择是否调用工具
      // - build_site, refactor_code: 使用 'required'，强制模型调用工具
      const toolChoice = task.type === 'chat_reply' ? 'auto' : 'required';
      
      // 根据任务类型和工作流模式过滤工具列表
      // chat_reply 任务在 default/planning 模式下只能使用只读工具
      const filteredTools = getFilteredTools(task.type as TaskType, workflowMode);
      const assistantResponse = await callOpenRouterChatCompletionsApi(chatMessages, apiKey, model, { tools: filteredTools, toolChoice });
      
      if (assistantResponse.tool_calls && assistantResponse.tool_calls.length > 0) {
        chatMessages.push(assistantResponse.rawMessage);
        
        for (const toolCall of assistantResponse.tool_calls) {
          const toolName = toolCall.name;
          const args = JSON.parse(toolCall.arguments || '{}');
          
          console.log(`执行工具: ${toolName}`, args);
          await writeBuildLog(supabase, task.project_id, 'info', `调用工具: ${toolName}`);
          await logAgentEvent(supabase, task.id, task.project_id, 'tool_call', { toolName, toolArgs: args, status: 'started' });
          
          let toolOutput: string;
          
          if (toolName === 'generate_image') {
            try {
              const prompt = args.prompt;
              const aspectRatio = args.aspect_ratio || '1:1';
              await writeBuildLog(supabase, task.project_id, 'info', `正在生成图片: ${prompt}`);
              const imageDataUrl = await generateImage(prompt, apiKey, aspectRatio);
              const timestamp = Date.now();
              const fileName = `generated_image_${timestamp}.png`;
              const imagePath = await saveImageToStorage(supabase, task.project_id, versionId, imageDataUrl, fileName);
              generatedImages.push(imagePath);
              await writeBuildLog(supabase, task.project_id, 'success', `图片已生成并保存: ${imagePath}`);
              toolOutput = JSON.stringify({ success: true, image_path: imagePath, file_name: fileName, message: '图片已成功生成并保存到项目文件夹' });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.error('图片生成失败:', error);
              await writeBuildLog(supabase, task.project_id, 'error', `图片生成失败: ${errorMessage}`);
              toolOutput = JSON.stringify({ success: false, error: errorMessage });
            }
          } else if (toolName === 'spawn_subagent') {
            // 处理 spawn_subagent 工具调用
            const nestingLevel = (task.payload?.nestingLevel as number) || 0;
            
            if (!canSpawnSubagent(nestingLevel)) {
              toolOutput = JSON.stringify({ 
                success: false, 
                error: `已达到最大嵌套层级 (1)，无法创建更多子代理` 
              });
            } else {
              try {
                const subagentType = args.type as SubagentType;
                const instruction = args.instruction as string;
                const targetFilesStr = args.target_files as string | undefined;
                const targetFiles = targetFilesStr ? targetFilesStr.split(',').map((f: string) => f.trim()) : undefined;
                
                const subagentContext: SubagentContext = {
                  supabase,
                  apiKey,
                  projectId: task.project_id,
                  toolContext,
                  projectFilesContext: projectFilesContext ? { bucket, path: basePath, versionId } : undefined,
                  parentTaskId: task.id,
                  nestingLevel
                };
                
                const subagentParams: SubagentTaskParams = {
                  type: subagentType,
                  instruction,
                  targetFiles
                };
                
                await writeBuildLog(supabase, task.project_id, 'info', `正在创建子代理: ${subagentType}`);
                const subagentResult = await executeSubagent(subagentContext, subagentParams);
                
                // 将子代理修改的文件添加到主任务的修改文件列表
                modifiedFiles.push(...subagentResult.modifiedFiles);
                
                toolOutput = JSON.stringify({
                  success: subagentResult.success,
                  type: subagentResult.type,
                  output: subagentResult.output,
                  modified_files: subagentResult.modifiedFiles,
                  execution_time_ms: subagentResult.executionTime,
                  error: subagentResult.error
                });
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('子代理执行失败:', error);
                await writeBuildLog(supabase, task.project_id, 'error', `子代理执行失败: ${errorMessage}`);
                toolOutput = JSON.stringify({ success: false, error: errorMessage });
              }
            }
          } else {
            const { result } = await executeToolCall(toolName, args, toolContext);
            const toolResult = result as { success: boolean; file_path?: string; error?: string };
            if (!toolResult.success) {
              const errorMsg = toolResult.error || '未知错误';
              await writeBuildLog(supabase, task.project_id, 'error', `工具执行失败 [${toolName}]: ${errorMsg}`);
              await logAgentEvent(supabase, task.id, task.project_id, 'tool_call', { toolName, toolArgs: args, status: 'failed', error: errorMsg });
            }
            if (toolName === 'write_file' && toolResult.success && toolResult.file_path) {
              modifiedFiles.push(toolResult.file_path);
            }
            toolOutput = JSON.stringify(result);
          }
          
          chatMessages.push({ role: 'tool', content: toolOutput, tool_call_id: toolCall.id });
        }
      } else {
        finalResponse = assistantResponse.content || '';
        break;
      }
    }
    
    const resultData: Record<string, unknown> = { text: finalResponse, model, processed_files: !!fileContextStr, generated_images: generatedImages, modified_files: modifiedFiles, iterations: iteration };
    const messageId = await writeAssistantMessage(supabase, task.project_id, finalResponse);
    if (!messageId) throw new Error('写入助手消息失败');
    resultData.messageId = messageId;
    
    await writeBuildLog(supabase, task.project_id, 'success', `AI 任务处理完成 (${iteration} 次迭代, ${modifiedFiles.length} 个文件修改)`);
    await updateTaskStatus(supabase, task.id, 'completed', resultData);
    await logAgentEvent(supabase, task.id, task.project_id, 'agent_phase', { phase: 'completed', status: 'completed', iterations: iteration, modifiedFilesCount: modifiedFiles.length, generatedImagesCount: generatedImages.length });
    
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
