import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { Client } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';

// --- 配置与常量 ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey'
};

// 根据任务类型配置模型 - 统一使用 Google Gemini 3 Pro Preview
const MODEL_CONFIG: Record<string, string> = {
  chat_reply: 'google/gemini-3-pro-preview',
  build_site: 'google/gemini-3-pro-preview',
  refactor_code: 'google/gemini-3-pro-preview',
  default: 'google/gemini-3-pro-preview'
};

const IMAGE_MODEL = 'google/gemini-3-pro-image-preview';

// --- 数据库操作函数 ---
async function claimTask(pgClient: Client, projectId?: string) {
  try {
    const projectFilterSQL = projectId ? 'AND project_id = $1' : '';
    const query = `
      WITH next_task AS (
        SELECT id
        FROM ai_tasks
        WHERE status = 'queued'
          AND attempts < max_attempts
          ${projectFilterSQL}
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE ai_tasks
      SET 
        status = 'running',
        attempts = attempts + 1,
        started_at = now()
      WHERE id = (SELECT id FROM next_task)
      RETURNING *
    `;
    const result = await pgClient.queryObject({
      text: query,
      args: projectId ? [projectId] : []
    });
    if (result.rows.length === 0) return null;
    return result.rows[0];
  } catch (error) {
    console.error('抢占任务失败:', error);
    throw error;
  }
}

async function fetchRecentChatMessages(supabase: ReturnType<typeof createClient>, projectId: string, limit = 10) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error('获取聊天历史失败:', error);
    return [];
  }
  return (data || []).reverse();
}

// --- 文件上下文处理 ---
async function getProjectFileContext(supabase: ReturnType<typeof createClient>, bucket: string, path: string) {
  try {
    const { data: fileList, error: listError } = await supabase.storage.from(bucket).list(path, {
      limit: 20,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' }
    });
    
    if (listError || !fileList || fileList.length === 0) return '';
    
    let contextStr = "\n\n=== 当前项目文件上下文 ===\n";
    const textExtensions = ['.html', '.css', '.js', '.ts', '.jsx', '.tsx', '.json', '.md'];
    
    const filesToRead = fileList.filter(
      (f) => textExtensions.some((ext) => f.name.endsWith(ext)) && f.metadata?.size < 20000
    );
    
    const fileContents = await Promise.all(
      filesToRead.map(async (f) => {
        const filePath = `${path}/${f.name}`.replace(/^\/+/, '');
        const { data, error } = await supabase.storage.from(bucket).download(filePath);
        if (error) return null;
        const text = await data.text();
        return `\n--- File: ${f.name} ---\n${text}`;
      })
    );
    
    contextStr += fileContents.filter(Boolean).join('\n');
    return contextStr;
  } catch (e) {
    console.error("读取文件上下文失败:", e);
    return "";
  }
}

// --- Chat Completions API 工具定义 ---
// 使用 Chat Completions API 格式，工具定义需要嵌套在 function 对象中
const CHAT_COMPLETION_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'generate_image',
      description: '生成图片。当用户要求创建、生成或绘制图片时使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '图片生成的详细描述,用英文描述' },
          aspect_ratio: { type: 'string', description: '图片的宽高比', enum: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] }
        },
        required: ['prompt']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_files',
      description: '列出项目目录下的文件和子目录。用于了解项目结构。',
      parameters: { type: 'object', properties: { path: { type: 'string', description: '要列出的目录路径，相对于项目根目录。留空表示根目录。' } }, required: [] }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: '读取项目中指定文件的内容。用于查看现有代码或配置。',
      parameters: { type: 'object', properties: { path: { type: 'string', description: '要读取的文件路径，相对于项目根目录' } }, required: ['path'] }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: '写入或创建文件。用于生成新代码或修改现有文件。',
      parameters: { type: 'object', properties: { path: { type: 'string', description: '要写入的文件路径，相对于项目根目录' }, content: { type: 'string', description: '要写入的文件内容' } }, required: ['path', 'content'] }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_file',
      description: '删除指定文件。谨慎使用，仅在用户明确要求删除时调用。',
      parameters: { type: 'object', properties: { path: { type: 'string', description: '要删除的文件路径，相对于项目根目录' } }, required: ['path'] }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_files',
      description: '在项目文件中搜索包含指定关键词的内容。用于定位相关代码。',
      parameters: { type: 'object', properties: { keyword: { type: 'string', description: '要搜索的关键词' }, file_extension: { type: 'string', description: '限制搜索的文件扩展名，如 .ts, .html 等（可选）' } }, required: ['keyword'] }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_project_structure',
      description: '获取完整的项目文件树结构。用于全局了解项目组成。',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  }
];

// --- Chat Completions API 类型定义 ---
interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
  index?: number;
}

interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  // reasoning_details 用于保留 Gemini 的推理信息，必须原样传回
  reasoning_details?: unknown;
  // reasoning 是 OpenRouter 返回的可读推理文本
  reasoning?: string | null;
}

interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: Array<{ index: number; message: ChatCompletionMessage; finish_reason: string | null }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface ChatCompletionOptions {
  tools?: typeof CHAT_COMPLETION_TOOLS | null;
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  reasoning?: { effort: 'minimal' | 'low' | 'medium' | 'high' } | null;
}

// --- Chat Completions API 调用函数 ---
async function callOpenRouterChatCompletions(
  messages: ChatCompletionMessage[],
  apiKey: string,
  model: string,
  options: ChatCompletionOptions = {}
): Promise<{ message: ChatCompletionMessage; finishReason: string | null; raw: ChatCompletionResponse }> {
  const { tools = null, toolChoice = 'auto', reasoning = null } = options;
  
  const requestBody: Record<string, unknown> = { model, messages, max_tokens: 16000 };
  if (tools) { requestBody.tools = tools; requestBody.tool_choice = toolChoice; }
  if (reasoning) { requestBody.reasoning = reasoning; }
  
  console.log('Chat Completions API Request:', JSON.stringify({ model, messageCount: messages.length, hasTools: !!tools, toolChoice, reasoning }));
  
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': 'https://aisitebuilder.app', 'X-Title': 'AI Site Builder' },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenRouter Chat Completions API 错误: ${response.status} - ${errorData}`);
  }
  
  const data = await response.json() as ChatCompletionResponse;
  console.log('Chat Completions API Response:', JSON.stringify({ id: data.id, model: data.model, finishReason: data.choices?.[0]?.finish_reason, hasToolCalls: !!data.choices?.[0]?.message?.tool_calls?.length, hasReasoningDetails: !!data.choices?.[0]?.message?.reasoning_details, contentLength: data.choices?.[0]?.message?.content?.length || 0 }));
  
  const choice = data.choices?.[0];
  if (!choice?.message) throw new Error('Chat Completions API 响应中没有 message');
  
  return { message: choice.message, finishReason: choice.finish_reason, raw: data };
}

// --- 图片生成函数 ---
async function generateImage(prompt: string, apiKey: string, aspectRatio = '1:1') {
  const requestBody = { model: IMAGE_MODEL, messages: [{ role: 'user', content: prompt }], modalities: ['image', 'text'], image_config: { aspect_ratio: aspectRatio } };
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': 'https://aisitebuilder.app', 'X-Title': 'AI Site Builder' },
    body: JSON.stringify(requestBody)
  });
  if (!response.ok) { const errorData = await response.text(); throw new Error(`图片生成API错误: ${response.status} - ${errorData}`); }
  const data = await response.json();
  const message = data.choices[0].message;
  if (message.images && message.images.length > 0) return message.images[0].image_url.url;
  throw new Error('未能生成图片');
}

// --- 文件存储函数 ---
async function saveImageToStorage(supabase: ReturnType<typeof createClient>, projectId: string, versionId: string, imageDataUrl: string, fileName: string) {
  const base64Data = imageDataUrl.split(',')[1];
  const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  const filePath = `${projectId}/${versionId}/${fileName}`;
  const { error } = await supabase.storage.from('project-files').upload(filePath, binaryData, { contentType: 'image/png', upsert: true });
  if (error) throw new Error(`保存图片失败: ${error.message}`);
  const { error: dbError } = await supabase.from('project_files').upsert({ project_id: projectId, version_id: versionId, file_path: fileName, file_category: 'asset', source_type: 'ai_generated', is_public: false }, { onConflict: 'project_id,version_id,file_path' });
  if (dbError) console.error('记录文件元数据失败:', dbError);
  return fileName;
}

// --- 文件操作辅助函数 ---
function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = { 'html': 'text/html', 'css': 'text/css', 'js': 'application/javascript', 'ts': 'application/typescript', 'jsx': 'text/jsx', 'tsx': 'text/tsx', 'json': 'application/json', 'md': 'text/markdown', 'txt': 'text/plain', 'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif', 'svg': 'image/svg+xml', 'webp': 'image/webp' };
  return mimeTypes[ext] || 'application/octet-stream';
}

function getFileCategory(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['html', 'css', 'js', 'ts', 'jsx', 'tsx', 'json'].includes(ext)) return 'code';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) return 'asset';
  return 'document';
}

// --- 工具上下文类型 ---
interface ToolContext {
  supabase: ReturnType<typeof createClient>;
  projectId: string;
  versionId: string;
  bucket: string;
  basePath: string;
}

// --- 工具处理函数 ---
async function handleListFiles(ctx: ToolContext, path: string = '') {
  const fullPath = path ? `${ctx.basePath}/${path}`.replace(/\/+/g, '/') : ctx.basePath;
  const { data: fileList, error } = await ctx.supabase.storage.from(ctx.bucket).list(fullPath, { limit: 100, sortBy: { column: 'name', order: 'asc' } });
  if (error) return { success: false, error: error.message };
  const files = (fileList || []).map((f) => ({ name: f.name, type: f.metadata ? 'file' : 'directory', size: f.metadata?.size || 0 }));
  return { success: true, path: path || '/', files };
}

async function handleReadFile(ctx: ToolContext, path: string) {
  const fullPath = `${ctx.basePath}/${path}`.replace(/\/+/g, '/');
  const { data, error } = await ctx.supabase.storage.from(ctx.bucket).download(fullPath);
  if (error) return { success: false, error: error.message };
  const content = await data.text();
  return { success: true, path, content };
}

async function handleWriteFile(ctx: ToolContext, path: string, content: string) {
  const fullPath = `${ctx.basePath}/${path}`.replace(/\/+/g, '/');
  const mimeType = getMimeType(path);
  const { error: uploadError } = await ctx.supabase.storage.from(ctx.bucket).upload(fullPath, new TextEncoder().encode(content), { contentType: mimeType, upsert: true });
  if (uploadError) return { success: false, error: uploadError.message };
  const { data: existingFile } = await ctx.supabase.from('project_files').select('id').eq('project_id', ctx.projectId).eq('version_id', ctx.versionId).eq('file_path', path).single();
  if (!existingFile) await ctx.supabase.from('project_files').insert({ project_id: ctx.projectId, version_id: ctx.versionId, file_path: path, file_category: getFileCategory(path), source_type: 'ai_generated', is_public: false });
  return { success: true, file_path: path, message: `文件 ${path} 已成功写入` };
}

async function handleDeleteFile(ctx: ToolContext, path: string) {
  const fullPath = `${ctx.basePath}/${path}`.replace(/\/+/g, '/');
  const { error: deleteError } = await ctx.supabase.storage.from(ctx.bucket).remove([fullPath]);
  if (deleteError) return { success: false, error: deleteError.message };
  await ctx.supabase.from('project_files').delete().eq('project_id', ctx.projectId).eq('version_id', ctx.versionId).eq('file_path', path);
  return { success: true, message: `文件 ${path} 已删除` };
}

async function handleSearchFiles(ctx: ToolContext, keyword: string, fileExtension?: string) {
  const { data: fileList, error: listError } = await ctx.supabase.storage.from(ctx.bucket).list(ctx.basePath, { limit: 100 });
  if (listError) return { success: false, error: listError.message };
  const textExtensions = ['.html', '.css', '.js', '.ts', '.jsx', '.tsx', '.json', '.md', '.txt'];
  const filesToSearch = (fileList || []).filter((f) => { if (!f.metadata) return false; const ext = '.' + (f.name.split('.').pop() || ''); if (fileExtension && ext !== fileExtension) return false; return textExtensions.includes(ext); });
  const results: Array<{ file: string; matches: string[] }> = [];
  for (const file of filesToSearch) {
    const fullPath = `${ctx.basePath}/${file.name}`.replace(/\/+/g, '/');
    const { data, error } = await ctx.supabase.storage.from(ctx.bucket).download(fullPath);
    if (error) continue;
    const content = await data.text();
    const lines = content.split('\n');
    const matches: string[] = [];
    lines.forEach((line, index) => { if (line.toLowerCase().includes(keyword.toLowerCase())) matches.push(`Line ${index + 1}: ${line.trim().substring(0, 100)}`); });
    if (matches.length > 0) results.push({ file: file.name, matches: matches.slice(0, 5) });
  }
  return { success: true, keyword, results };
}

async function handleGetProjectStructure(ctx: ToolContext) {
  const { data: fileList, error } = await ctx.supabase.storage.from(ctx.bucket).list(ctx.basePath, { limit: 200 });
  if (error) return { success: false, error: error.message };
  const structure = (fileList || []).map((f) => ({ name: f.name, type: f.metadata ? 'file' : 'directory', size: f.metadata?.size || 0 }));
  return { success: true, structure };
}

// --- 工具执行函数 ---
async function executeToolCall(toolName: string, args: Record<string, unknown>, ctx: ToolContext): Promise<{ result: unknown }> {
  switch (toolName) {
    case 'list_files': return { result: await handleListFiles(ctx, args.path as string | undefined) };
    case 'read_file': return { result: await handleReadFile(ctx, args.path as string) };
    case 'write_file': return { result: await handleWriteFile(ctx, args.path as string, args.content as string) };
    case 'delete_file': return { result: await handleDeleteFile(ctx, args.path as string) };
    case 'search_files': return { result: await handleSearchFiles(ctx, args.keyword as string, args.file_extension as string | undefined) };
    case 'get_project_structure': return { result: await handleGetProjectStructure(ctx) };
    default: return { result: { success: false, error: `未知工具: ${toolName}` } };
  }
}

// --- 日志和消息函数 ---
async function writeBuildLog(supabase: ReturnType<typeof createClient>, projectId: string, logType: string, message: string) {
  const { error } = await supabase.from('build_logs').insert({ project_id: projectId, log_type: logType, message: message });
  if (error) console.error('写入构建日志失败:', error);
}

async function writeAssistantMessage(supabase: ReturnType<typeof createClient>, projectId: string, content: string) {
  const { data, error } = await supabase.from('chat_messages').insert({ project_id: projectId, role: 'assistant', content: content }).select('id').single();
  if (error) { console.error('写入助手消息失败:', error); return null; }
  return data?.id;
}

async function updateTaskStatus(supabase: ReturnType<typeof createClient>, taskId: string, status: string, result?: Record<string, unknown>, errorMsg?: string) {
  const updateData: Record<string, unknown> = { status, completed_at: new Date().toISOString() };
  if (result) updateData.result = result;
  if (errorMsg) updateData.error = errorMsg;
  await supabase.from('ai_tasks').update(updateData).eq('id', taskId);
}

// --- 任务处理主函数 ---
interface Task { id: string; project_id: string; type: string; payload?: Record<string, unknown>; attempts: number; max_attempts: number; }
interface ProjectFilesContext { bucket?: string; path?: string; versionId?: string; }

async function processTask(task: Task, supabase: ReturnType<typeof createClient>, apiKey: string, projectFilesContext?: ProjectFilesContext) {
  console.log(`开始处理任务: ${task.id}, 类型: ${task.type}`);
  const model = MODEL_CONFIG[task.type] || MODEL_CONFIG.default;
  
  try {
    await writeBuildLog(supabase, task.project_id, 'info', `开始处理 AI 任务: ${task.type} (Model: ${model})`);
    
    let fileContextStr = "";
    if (task.type !== 'chat_reply' && projectFilesContext?.bucket && projectFilesContext?.path) {
      await writeBuildLog(supabase, task.project_id, 'info', `正在读取项目文件...`);
      fileContextStr = await getProjectFileContext(supabase, projectFilesContext.bucket, projectFilesContext.path);
    }
    
    const versionId = projectFilesContext?.versionId || 'default';
    const bucket = projectFilesContext?.bucket || 'project-files';
    const basePath = projectFilesContext?.path || `${task.project_id}/${versionId}`;
    
    const toolContext: ToolContext = { supabase, projectId: task.project_id, versionId, bucket, basePath };
    const messages: ChatCompletionMessage[] = [];
    
    const agentSystemPrompt = `你是一个专业的全栈开发 AI Agent。请用简体中文回复。

你拥有以下工具能力，可以通过函数调用来使用它们：

**文件操作工具：**
- list_files: 列出项目目录下的文件和子目录，用于了解项目结构
- read_file: 读取指定文件的内容，用于查看现有代码或配置
- write_file: 写入或创建文件，用于生成新代码或修改现有文件
- delete_file: 删除指定文件（谨慎使用，仅在用户明确要求时调用）
- search_files: 在项目文件中搜索关键词，用于定位相关代码
- get_project_structure: 获取完整的项目文件树结构

**创意工具：**
- generate_image: 根据描述生成图片

**工作流程指南：**
1. 当需要了解项目现状时，先使用 get_project_structure 或 list_files 查看项目结构
2. 当需要修改代码时，先使用 read_file 读取现有文件内容，理解上下文
3. 使用 write_file 创建或修改文件，将生成的代码保存到项目中
4. 当需要查找特定功能或变量时，使用 search_files 搜索
5. 完成所有必要的文件操作后，给出最终的总结回复

**重要提示：**
- 你可以多次调用工具来完成复杂任务
- 每次工具调用后，根据结果决定下一步行动
- 在完成所有步骤后再给出最终答案
- 所有文件操作都限定在当前项目范围内`;
    
    if (task.type === 'chat_reply') {
      const chatHistory = await fetchRecentChatMessages(supabase, task.project_id, 10);
      const contextPrompt = fileContextStr ? `\n\n当前项目文件参考:\n${fileContextStr}` : '';
      messages.push({ role: 'system', content: agentSystemPrompt + contextPrompt });
      for (const msg of chatHistory) messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
    } else if (task.type === 'build_site') {
      const requirement = (task.payload?.requirement as string) || "创建基础着陆页";
      const buildPrompt = `${agentSystemPrompt}\n\n**当前任务：构建网站**\n你的任务是根据用户需求生成网站代码。请按以下步骤执行：\n1. 首先使用 get_project_structure 了解现有项目结构\n2. 根据需求规划要创建或修改的文件\n3. 使用 write_file 工具创建必要的文件（如 index.html, styles.css, script.js 等）\n4. 如果需要图片，使用 generate_image 生成\n5. 完成后给出构建总结\n${fileContextStr ? `\n当前项目文件参考:\n${fileContextStr}` : ''}`;
      messages.push({ role: 'system', content: buildPrompt });
      messages.push({ role: 'user', content: `请帮我构建网站，需求如下：${requirement}` });
    } else if (task.type === 'refactor_code') {
      const code = (task.payload?.code as string) || "";
      const filePath = (task.payload?.filePath as string) || "";
      const refactorPrompt = `${agentSystemPrompt}\n\n**当前任务：代码重构**\n你的任务是重构代码，关注性能、可读性和最佳实践。请按以下步骤执行：\n1. 如果提供了文件路径，使用 read_file 读取完整文件内容\n2. 分析代码结构和问题\n3. 使用 write_file 将重构后的代码写回文件\n4. 给出重构说明和改进点\n${fileContextStr ? `\n当前项目文件参考:\n${fileContextStr}` : ''}`;
      messages.push({ role: 'system', content: refactorPrompt });
      messages.push({ role: 'user', content: filePath ? `请重构文件 ${filePath} 中的代码` : `请重构以下代码：\n\`\`\`\n${code}\n\`\`\`` });
    } else {
      throw new Error(`不支持的任务类型: ${task.type}`);
    }
    
    console.log(`调用 OpenRouter Chat Completions API, Model: ${model}, Msg Count: ${messages.length}`);
    
    let iteration = 0;
    let finalResponse = '';
    const generatedImages: string[] = [];
    const modifiedFiles: string[] = [];
    
    // Agent 循环：持续调用 API 直到没有工具调用
    while (true) {
      iteration++;
      console.log(`Agent 迭代 ${iteration}`);
      await writeBuildLog(supabase, task.project_id, 'info', `Agent 执行中 (迭代 ${iteration})...`);
      
      const { message: assistantMessage } = await callOpenRouterChatCompletions(messages, apiKey, model, { tools: CHAT_COMPLETION_TOOLS, toolChoice: 'auto', reasoning: { effort: 'medium' } });
      
      // 记录推理信息（如果有）
      if (assistantMessage.reasoning) {
        console.log('推理:', assistantMessage.reasoning.substring(0, 200));
        await writeBuildLog(supabase, task.project_id, 'info', `AI 推理: ${assistantMessage.reasoning.substring(0, 100)}...`);
      }
      
      // 将完整的 assistant message 添加到历史记录中
      // 重要：必须保留 tool_calls 和 reasoning_details，这是 Gemini 要求的
      messages.push(assistantMessage);
      
      const toolCalls = assistantMessage.tool_calls || [];
      
      if (toolCalls.length === 0) {
        // 没有工具调用，这是最终响应
        finalResponse = assistantMessage.content || '';
        console.log(`Agent 完成，最终响应长度: ${finalResponse.length}`);
        break;
      }
      
      // 执行所有工具调用
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function?.name || '';
        const argsStr = toolCall.function?.arguments || '{}';
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(argsStr); } catch (e) { console.error(`解析工具参数失败: ${argsStr}`, e); args = {}; }
        
        console.log(`执行工具: ${toolName}`, args);
        await writeBuildLog(supabase, task.project_id, 'info', `调用工具: ${toolName}`);
        
        let toolOutput: string;
        
        if (toolName === 'generate_image') {
          try {
            const prompt = args.prompt as string;
            const aspectRatio = (args.aspect_ratio as string) || '1:1';
            await writeBuildLog(supabase, task.project_id, 'info', `正在生成图片: ${prompt}`);
            const imageDataUrl = await generateImage(prompt, apiKey, aspectRatio);
            const timestamp = Date.now();
            const fileName = `generated_image_${timestamp}.png`;
            const imagePath = await saveImageToStorage(supabase, task.project_id, versionId, imageDataUrl, fileName);
            generatedImages.push(imagePath);
            await writeBuildLog(supabase, task.project_id, 'success', `图片已生成并保存: ${imagePath}`);
            toolOutput = JSON.stringify({ success: true, image_path: imagePath, file_name: fileName, message: '图片已成功生成并保存到项目文件夹' });
          } catch (error) {
            console.error('图片生成失败:', error);
            await writeBuildLog(supabase, task.project_id, 'error', `图片生成失败: ${(error as Error).message}`);
            toolOutput = JSON.stringify({ success: false, error: (error as Error).message });
          }
        } else {
          const { result } = await executeToolCall(toolName, args, toolContext);
          if (toolName === 'write_file' && (result as { success: boolean; file_path?: string }).success) {
            const writeResult = result as { success: boolean; file_path?: string };
            if (writeResult.file_path) { modifiedFiles.push(writeResult.file_path); await writeBuildLog(supabase, task.project_id, 'success', `文件已写入: ${writeResult.file_path}`); }
          } else if (toolName === 'delete_file' && (result as { success: boolean }).success) {
            await writeBuildLog(supabase, task.project_id, 'info', `文件已删除: ${args.path}`);
          } else if (toolName === 'read_file') {
            await writeBuildLog(supabase, task.project_id, 'info', `已读取文件: ${args.path}`);
          } else if (toolName === 'list_files' || toolName === 'get_project_structure') {
            await writeBuildLog(supabase, task.project_id, 'info', `已获取项目结构`);
          } else if (toolName === 'search_files') {
            await writeBuildLog(supabase, task.project_id, 'info', `已搜索关键词: ${args.keyword}`);
          }
          toolOutput = JSON.stringify(result);
        }
        
        // 将工具结果添加到消息历史中
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: toolOutput });
      }
    }
    
    const resultData: Record<string, unknown> = { text: finalResponse, model, processed_files: !!fileContextStr, generated_images: generatedImages, modified_files: modifiedFiles, iterations: iteration };
    const messageId = await writeAssistantMessage(supabase, task.project_id, finalResponse);
    if (!messageId) throw new Error('写入助手消息失败');
    resultData.messageId = messageId;
    
    await writeBuildLog(supabase, task.project_id, 'success', `AI 任务处理完成 (${iteration} 次迭代, ${modifiedFiles.length} 个文件修改)`);
    await updateTaskStatus(supabase, task.id, 'completed', resultData);
    
  } catch (error) {
    console.error(`处理任务 ${task.id} 失败:`, error);
    await writeBuildLog(supabase, task.project_id, 'error', `AI 任务处理失败: ${(error as Error).message}`);
    if (task.attempts >= task.max_attempts) {
      await updateTaskStatus(supabase, task.id, 'failed', undefined, (error as Error).message);
    } else {
      await supabase.from('ai_tasks').update({ status: 'queued', error: `Attempt ${task.attempts} failed: ${(error as Error).message}` }).eq('id', task.id);
    }
    throw error;
  }
}

// --- 主服务入口 ---
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openrouterApiKey = Deno.env.get('OPENROUTER_KEY');
    const databaseUrl = Deno.env.get('SUPABASE_DB_URL');
    
    if (!openrouterApiKey || !supabaseUrl || !supabaseServiceKey || !databaseUrl) throw new Error('缺少必要的环境变量设置 (URL/KEY)');
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    let body: { projectId?: string; projectFilesContext?: ProjectFilesContext } = {};
    try { body = await req.json(); } catch { /* empty body allowed */ }
    
    const projectId = body.projectId;
    const projectFilesContext = body.projectFilesContext;
    
    const pgClient = new Client(databaseUrl);
    await pgClient.connect();
    
    try {
      const task = await claimTask(pgClient, projectId);
      if (!task) return new Response(JSON.stringify({ success: true, message: '没有待处理的任务' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      await processTask(task as Task, supabase, openrouterApiKey, projectFilesContext);
      return new Response(JSON.stringify({ success: true, taskId: (task as Task).id }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } finally {
      await pgClient.end();
    }
  } catch (error) {
    console.error('处理请求失败:', error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
