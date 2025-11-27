import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { Client } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';
// --- 配置与常量 ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey'
};
// 根据任务类型配置模型 - 统一使用 Google Gemini 3 Pro Preview
const MODEL_CONFIG = {
  chat_reply: 'google/gemini-3-pro-preview',
  build_site: 'google/gemini-3-pro-preview',
  refactor_code: 'google/gemini-3-pro-preview',
  default: 'google/gemini-3-pro-preview'
};

const IMAGE_MODEL = 'google/gemini-3-pro-image-preview';
// --- 数据库操作函数 ---
async function claimTask(pgClient, projectId) {
  try {
    const projectFilterSQL = projectId ? 'AND project_id = $1' : '';
    // 使用 SKIP LOCKED 确保并发安全，同时过滤掉重试次数过多的任务
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
      args: projectId ? [
        projectId
      ] : []
    });
    if (result.rows.length === 0) return null;
    return result.rows[0];
  } catch (error) {
    console.error('抢占任务失败:', error);
    throw error;
  }
}
async function fetchRecentChatMessages(supabase, projectId, limit = 10) {
  const { data, error } = await supabase.from('chat_messages').select('*').eq('project_id', projectId).order('created_at', {
    ascending: false
  }) // 先取最新的
  .limit(limit);
  if (error) {
    console.error('获取聊天历史失败:', error);
    return [];
  }
  return (data || []).reverse(); // 反转回时间正序
}
// --- 文件上下文处理 (新功能) ---
// 从 Storage 读取文件内容并拼接为 Context 字符串
async function getProjectFileContext(supabase, bucket, path) {
  try {
    // 1. 列出目录下的文件
    const { data: fileList, error: listError } = await supabase.storage.from(bucket).list(path, {
      limit: 20,
      offset: 0,
      sortBy: {
        column: 'name',
        order: 'asc'
      }
    });
    if (listError || !fileList || fileList.length === 0) return '';
    let contextStr = "\n\n=== 当前项目文件上下文 ===\n";
    // 2. 并行下载部分关键文件内容 (过滤掉图片等非文本文件)
    const textExtensions = [
      '.html',
      '.css',
      '.js',
      '.ts',
      '.jsx',
      '.tsx',
      '.json',
      '.md'
    ];
    const filesToRead = fileList.filter((f)=>textExtensions.some((ext)=>f.name.endsWith(ext)) && f.metadata?.size < 20000 // 限制文件大小，防止Token溢出
    );
    const fileContents = await Promise.all(filesToRead.map(async (f)=>{
      const filePath = `${path}/${f.name}`.replace(/^\/+/, '');
      const { data, error } = await supabase.storage.from(bucket).download(filePath);
      if (error) return null;
      const text = await data.text();
      return `\n--- File: ${f.name} ---\n${text}`;
    }));
    contextStr += fileContents.filter(Boolean).join('\n');
    return contextStr;
  } catch (e) {
    console.error("读取文件上下文失败:", e);
    return ""; // 失败不阻断流程，只是没上下文
  }
}
// Chat Completions API 工具定义格式
const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'generate_image',
      description: '生成图片。当用户要求创建、生成或绘制图片时使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: '图片生成的详细描述,用英文描述'
          },
          aspect_ratio: {
            type: 'string',
            description: '图片的宽高比',
            enum: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']
          }
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
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要列出的目录路径，相对于项目根目录。留空表示根目录。'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: '读取项目中指定文件的内容。用于查看现有代码或配置。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要读取的文件路径，相对于项目根目录'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: '写入或创建文件。用于生成新代码或修改现有文件。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要写入的文件路径，相对于项目根目录'
          },
          content: {
            type: 'string',
            description: '要写入的文件内容'
          }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'delete_file',
      description: '删除指定文件。谨慎使用，仅在用户明确要求删除时调用。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要删除的文件路径，相对于项目根目录'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_files',
      description: '在项目文件中搜索包含指定关键词的内容。用于定位相关代码。',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: '要搜索的关键词'
          },
          file_extension: {
            type: 'string',
            description: '限制搜索的文件扩展名，如 .ts, .html 等（可选）'
          }
        },
        required: ['keyword']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_project_structure',
      description: '获取完整的项目文件树结构。用于全局了解项目组成。',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }
];

// --- API 调用与日志 ---

// Chat Completions API 消息类型定义
// 注意：为了支持 Gemini 模型的 thought_signature 和 reasoning_details，
// 我们需要允许透传 OpenRouter 返回的所有字段
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
    // 允许 provider 自定义字段（如 thought_signature）
    [key: string]: unknown;
  }>;
  tool_call_id?: string;
  // Gemini 模型需要的 reasoning 相关字段
  reasoning?: string;
  reasoning_details?: unknown;
  refusal?: unknown;
  // 允许 provider 自定义字段透传
  [key: string]: unknown;
}

interface CallOpenRouterOptions {
  tools?: typeof TOOLS | null;
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

// Chat Completions API 响应解析结果
// 包含原始 message 对象以保留 Gemini 的 reasoning_details 和 thought_signature
interface ParsedChatCompletionOutput {
  content: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  // 原始 message 对象，用于透传给下一次请求
  rawMessage: ChatMessage;
}

// 解析 Chat Completions API 输出
function parseChatCompletionOutput(data: Record<string, unknown>): ParsedChatCompletionOutput {
  const choices = data.choices as Array<{
    message: Record<string, unknown>;
  }> || [];
  
  // 获取原始 message 对象（保留所有字段）
  const rawMessage = (choices[0]?.message || { role: 'assistant' }) as ChatMessage;
  
  // 提取 tool_calls 用于执行工具
  const toolCalls = rawMessage.tool_calls as Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }> | undefined;
  
  const result: ParsedChatCompletionOutput = {
    content: typeof rawMessage.content === 'string' ? rawMessage.content : '',
    rawMessage: rawMessage
  };
  
  if (toolCalls && toolCalls.length > 0) {
    result.tool_calls = toolCalls.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments
    }));
  }
  
  return result;
}

// 调用 OpenRouter Chat Completions API
async function callOpenRouterChatCompletionsApi(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  options: CallOpenRouterOptions = {}
): Promise<ParsedChatCompletionOutput> {
  const { tools = null, toolChoice = 'auto' } = options;
  
  const requestBody: Record<string, unknown> = {
    model: model,
    messages: messages,
    max_tokens: 16000
  };
  
  if (tools) {
    requestBody.tools = tools;
    requestBody.tool_choice = toolChoice;
  }
  
  console.log('Chat Completions API Request:', JSON.stringify(requestBody, null, 2).substring(0, 2000));
  
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://aisitebuilder.app',
      'X-Title': 'AI Site Builder'
    },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenRouter Chat Completions API 错误: ${response.status} - ${errorData}`);
  }
  
  const data = await response.json();
  console.log('Chat Completions API Response:', JSON.stringify(data, null, 2).substring(0, 2000));
  
  return parseChatCompletionOutput(data);
}
async function generateImage(prompt: string, apiKey: string, aspectRatio = '1:1') {
  const requestBody: any = {
    model: IMAGE_MODEL,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ],
    modalities: ['image', 'text'],
    image_config: {
      aspect_ratio: aspectRatio
    }
  };

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://aisitebuilder.app',
      'X-Title': 'AI Site Builder'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`图片生成API错误: ${response.status} - ${errorData}`);
  }

  const data = await response.json();
  const message = data.choices[0].message;
  
  if (message.images && message.images.length > 0) {
    const imageUrl = message.images[0].image_url.url;
    return imageUrl;
  }
  
  throw new Error('未能生成图片');
}

async function saveImageToStorage(supabase, projectId: string, versionId: string, imageDataUrl: string, fileName: string) {
  const base64Data = imageDataUrl.split(',')[1];
  const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  
  const bucket = 'project-files';
  const path = `${projectId}/${versionId}/${fileName}`;
  
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType: 'image/png',
      upsert: true
    });
  
  if (error) {
    throw new Error(`保存图片失败: ${error.message}`);
  }
  
  const { error: dbError } = await supabase
    .from('project_files')
    .insert({
      project_id: projectId,
      version_id: versionId,
      file_name: fileName,
      file_path: path,
      file_size: buffer.length,
      mime_type: 'image/png',
      file_category: 'asset',
      source_type: 'ai_generated',
      is_public: false
    })
    .select()
    .maybeSingle();
  
  if (dbError) {
    console.error('保存文件记录失败:', dbError);
  }
  
  return path;
}

// --- AI Agent 工具处理函数 ---

interface ToolContext {
  supabase: ReturnType<typeof createClient>;
  projectId: string;
  versionId: string;
  bucket: string;
  basePath: string;
}

function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'ts': 'application/typescript',
    'tsx': 'application/typescript',
    'jsx': 'application/javascript',
    'json': 'application/json',
    'md': 'text/markdown',
    'txt': 'text/plain',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

function getFileCategory(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const codeExtensions = ['html', 'css', 'js', 'ts', 'tsx', 'jsx', 'json'];
  const assetExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'];
  const documentExtensions = ['md', 'txt', 'pdf'];
  
  if (codeExtensions.includes(ext)) return 'code';
  if (assetExtensions.includes(ext)) return 'asset';
  if (documentExtensions.includes(ext)) return 'document';
  return 'code';
}

async function handleListFiles(ctx: ToolContext, args: { path?: string }): Promise<{ success: boolean; files?: Array<{ name: string; type: string; size?: number }>; error?: string }> {
  try {
    const relativePath = args.path || '';
    const fullPath = relativePath ? `${ctx.basePath}/${relativePath}`.replace(/\/+/g, '/') : ctx.basePath;
    
    const { data: fileList, error } = await ctx.supabase.storage
      .from(ctx.bucket)
      .list(fullPath, {
        limit: 100,
        sortBy: { column: 'name', order: 'asc' }
      });
    
    if (error) {
      return { success: false, error: `列出文件失败: ${error.message}` };
    }
    
    const files = (fileList || []).map(f => ({
      name: f.name,
      type: f.id ? 'file' : 'directory',
      size: f.metadata?.size
    }));
    
    return { success: true, files };
  } catch (e) {
    return { success: false, error: `列出文件异常: ${e.message}` };
  }
}

async function handleReadFile(ctx: ToolContext, args: { path: string }): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const fullPath = `${ctx.basePath}/${args.path}`.replace(/\/+/g, '/');
    
    const { data, error } = await ctx.supabase.storage
      .from(ctx.bucket)
      .download(fullPath);
    
    if (error) {
      return { success: false, error: `读取文件失败: ${error.message}` };
    }
    
    const content = await data.text();
    return { success: true, content };
  } catch (e) {
    return { success: false, error: `读取文件异常: ${e.message}` };
  }
}

async function handleWriteFile(ctx: ToolContext, args: { path: string; content: string }): Promise<{ success: boolean; file_path?: string; error?: string }> {
  try {
    const fullPath = `${ctx.basePath}/${args.path}`.replace(/\/+/g, '/');
    const fileName = args.path.split('/').pop() || 'unnamed';
    const mimeType = getMimeType(fileName);
    const fileCategory = getFileCategory(fileName);
    
    const encoder = new TextEncoder();
    const buffer = encoder.encode(args.content);
    
    const { error: uploadError } = await ctx.supabase.storage
      .from(ctx.bucket)
      .upload(fullPath, buffer, {
        contentType: mimeType,
        upsert: true
      });
    
    if (uploadError) {
      return { success: false, error: `写入文件失败: ${uploadError.message}` };
    }
    
    const { data: existingFile } = await ctx.supabase
      .from('project_files')
      .select('id')
      .eq('project_id', ctx.projectId)
      .eq('file_path', fullPath)
      .maybeSingle();
    
    if (existingFile) {
      await ctx.supabase
        .from('project_files')
        .update({
          file_size: buffer.length,
          mime_type: mimeType,
          source_type: 'ai_generated'
        })
        .eq('id', existingFile.id);
    } else {
      await ctx.supabase
        .from('project_files')
        .insert({
          project_id: ctx.projectId,
          version_id: ctx.versionId,
          file_name: fileName,
          file_path: fullPath,
          file_size: buffer.length,
          mime_type: mimeType,
          file_category: fileCategory,
          source_type: 'ai_generated',
          is_public: false
        });
    }
    
    return { success: true, file_path: fullPath };
  } catch (e) {
    return { success: false, error: `写入文件异常: ${e.message}` };
  }
}

async function handleDeleteFile(ctx: ToolContext, args: { path: string }): Promise<{ success: boolean; error?: string }> {
  try {
    const fullPath = `${ctx.basePath}/${args.path}`.replace(/\/+/g, '/');
    
    const { error: deleteError } = await ctx.supabase.storage
      .from(ctx.bucket)
      .remove([fullPath]);
    
    if (deleteError) {
      return { success: false, error: `删除文件失败: ${deleteError.message}` };
    }
    
    await ctx.supabase
      .from('project_files')
      .delete()
      .eq('project_id', ctx.projectId)
      .eq('file_path', fullPath);
    
    return { success: true };
  } catch (e) {
    return { success: false, error: `删除文件异常: ${e.message}` };
  }
}

async function handleSearchFiles(ctx: ToolContext, args: { keyword: string; file_extension?: string }): Promise<{ success: boolean; results?: Array<{ file: string; matches: string[] }>; error?: string }> {
  try {
    const { data: fileList, error: listError } = await ctx.supabase.storage
      .from(ctx.bucket)
      .list(ctx.basePath, {
        limit: 50,
        sortBy: { column: 'name', order: 'asc' }
      });
    
    if (listError) {
      return { success: false, error: `搜索文件失败: ${listError.message}` };
    }
    
    const textExtensions = ['.html', '.css', '.js', '.ts', '.jsx', '.tsx', '.json', '.md', '.txt'];
    const filesToSearch = (fileList || []).filter(f => {
      if (!f.id) return false;
      const hasTextExt = textExtensions.some(ext => f.name.endsWith(ext));
      if (args.file_extension) {
        return f.name.endsWith(args.file_extension);
      }
      return hasTextExt;
    });
    
    const results: Array<{ file: string; matches: string[] }> = [];
    
    for (const file of filesToSearch) {
      const filePath = `${ctx.basePath}/${file.name}`.replace(/\/+/g, '/');
      const { data, error } = await ctx.supabase.storage
        .from(ctx.bucket)
        .download(filePath);
      
      if (error) continue;
      
      const content = await data.text();
      const lines = content.split('\n');
      const matchingLines: string[] = [];
      
      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(args.keyword.toLowerCase())) {
          matchingLines.push(`Line ${index + 1}: ${line.trim().substring(0, 100)}`);
        }
      });
      
      if (matchingLines.length > 0) {
        results.push({
          file: file.name,
          matches: matchingLines.slice(0, 5)
        });
      }
    }
    
    return { success: true, results };
  } catch (e) {
    return { success: false, error: `搜索文件异常: ${e.message}` };
  }
}

interface FileTreeNode {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileTreeNode[];
}

async function handleGetProjectStructure(ctx: ToolContext): Promise<{ success: boolean; structure?: FileTreeNode[]; error?: string }> {
  try {
    const { data: fileList, error } = await ctx.supabase.storage
      .from(ctx.bucket)
      .list(ctx.basePath, {
        limit: 200,
        sortBy: { column: 'name', order: 'asc' }
      });
    
    if (error) {
      return { success: false, error: `获取项目结构失败: ${error.message}` };
    }
    
    const structure: FileTreeNode[] = (fileList || []).map(f => ({
      name: f.name,
      type: f.id ? 'file' as const : 'directory' as const,
      size: f.metadata?.size
    }));
    
    return { success: true, structure };
  } catch (e) {
    return { success: false, error: `获取项目结构异常: ${e.message}` };
  }
}

async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<{ success: boolean; result: unknown }> {
  switch (toolName) {
    case 'list_files':
      return { success: true, result: await handleListFiles(ctx, args as { path?: string }) };
    case 'read_file':
      return { success: true, result: await handleReadFile(ctx, args as { path: string }) };
    case 'write_file':
      return { success: true, result: await handleWriteFile(ctx, args as { path: string; content: string }) };
    case 'delete_file':
      return { success: true, result: await handleDeleteFile(ctx, args as { path: string }) };
    case 'search_files':
      return { success: true, result: await handleSearchFiles(ctx, args as { keyword: string; file_extension?: string }) };
    case 'get_project_structure':
      return { success: true, result: await handleGetProjectStructure(ctx) };
    case 'generate_image':
      return { success: false, result: { error: 'generate_image handled separately' } };
    default:
      return { success: false, result: { error: `未知工具: ${toolName}` } };
  }
}

async function writeBuildLog(supabase, projectId, logType, message, metadata = {}) {
  const { error } = await supabase.from('build_logs').insert({
    project_id: projectId,
    log_type: logType,
    message: message,
    metadata
  });
  if (error) console.error('写入构建日志失败:', error);
}
async function writeAssistantMessage(supabase, projectId, content) {
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
async function updateTaskStatus(supabase, taskId, status, result, errorMsg) {
  const updateData = {
    status: status,
    finished_at: new Date().toISOString()
  };
  if (result) updateData.result = result;
  if (errorMsg) updateData.error = errorMsg;
  const { error } = await supabase.from('ai_tasks').update(updateData).eq('id', taskId);
  if (error) console.error('更新任务状态失败:', error);
}
async function processTask(task, supabase, apiKey, projectFilesContext) {
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
    
    const toolContext: ToolContext = {
      supabase,
      projectId: task.project_id,
      versionId,
      bucket,
      basePath
    };
    
    let messages = [];
    
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
      messages = [
        {
          role: 'system',
          content: agentSystemPrompt + contextPrompt
        },
        ...chatHistory.map((msg)=>({
            role: msg.role,
            content: msg.content
          }))
      ];
    } else if (task.type === 'build_site') {
      const requirement = task.payload?.requirement || "创建基础着陆页";
      const buildPrompt = `${agentSystemPrompt}

**当前任务：构建网站**
你的任务是根据用户需求生成网站代码。请按以下步骤执行：
1. 首先使用 get_project_structure 了解现有项目结构
2. 根据需求规划要创建或修改的文件
3. 使用 write_file 工具创建必要的文件（如 index.html, styles.css, script.js 等）
4. 如果需要图片，使用 generate_image 生成
5. 完成后给出构建总结

${fileContextStr ? `\n当前项目文件参考:\n${fileContextStr}` : ''}`;
      
      messages = [
        {
          role: 'system',
          content: buildPrompt
        },
        {
          role: 'user',
          content: `请帮我构建网站，需求如下：${requirement}`
        }
      ];
    } else if (task.type === 'refactor_code') {
      const code = task.payload?.code || "";
      const filePath = task.payload?.filePath || "";
      const refactorPrompt = `${agentSystemPrompt}

**当前任务：代码重构**
你的任务是重构代码，关注性能、可读性和最佳实践。请按以下步骤执行：
1. 如果提供了文件路径，使用 read_file 读取完整文件内容
2. 分析代码结构和问题
3. 使用 write_file 将重构后的代码写回文件
4. 给出重构说明和改进点

${fileContextStr ? `\n当前项目文件参考:\n${fileContextStr}` : ''}`;
      
      messages = [
        {
          role: 'system',
          content: refactorPrompt
        },
        {
          role: 'user',
          content: filePath 
            ? `请重构文件 ${filePath} 中的代码` 
            : `请重构以下代码：\n\`\`\`\n${code}\n\`\`\``
        }
      ];
    } else {
      throw new Error(`不支持的任务类型: ${task.type}`);
    }
    
    console.log(`调用 OpenRouter Chat Completions API, Model: ${model}, Msg Count: ${messages.length}`);
    
    let iteration = 0;
    let finalResponse = '';
    const generatedImages: string[] = [];
    const modifiedFiles: string[] = [];
    
    // 使用 ChatMessage 类型的消息数组
    const chatMessages: ChatMessage[] = messages.map(msg => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content
    }));
    
    while (true) {
      iteration++;
      console.log(`Agent 迭代 ${iteration}`);
      await writeBuildLog(supabase, task.project_id, 'info', `Agent 执行中 (迭代 ${iteration})...`);
      
      // 调用 Chat Completions API
      const assistantResponse = await callOpenRouterChatCompletionsApi(chatMessages, apiKey, model, { 
        tools: TOOLS,
        toolChoice: 'auto'
      });
      
      // 如果有函数调用
      if (assistantResponse.tool_calls && assistantResponse.tool_calls.length > 0) {
        // 将原始 assistant 消息添加到消息历史（保留 reasoning_details 和 thought_signature）
        // 这是 Gemini 模型正常工作所必需的
        chatMessages.push(assistantResponse.rawMessage);
        
        for (const toolCall of assistantResponse.tool_calls) {
          const toolName = toolCall.name;
          const args = JSON.parse(toolCall.arguments || '{}');
          
          console.log(`执行工具: ${toolName}`, args);
          await writeBuildLog(supabase, task.project_id, 'info', `调用工具: ${toolName}`);
          
          let toolOutput: string;
          
          if (toolName === 'generate_image') {
            try {
              const prompt = args.prompt;
              const aspectRatio = args.aspect_ratio || '1:1';
              
              await writeBuildLog(supabase, task.project_id, 'info', `正在生成图片: ${prompt}`);
              
              const imageDataUrl = await generateImage(prompt, apiKey, aspectRatio);
              
              const timestamp = Date.now();
              const fileName = `generated_image_${timestamp}.png`;
              
              const imagePath = await saveImageToStorage(
                supabase,
                task.project_id,
                versionId,
                imageDataUrl,
                fileName
              );
              
              generatedImages.push(imagePath);
              
              await writeBuildLog(supabase, task.project_id, 'success', `图片已生成并保存: ${imagePath}`);
              
              toolOutput = JSON.stringify({
                success: true,
                image_path: imagePath,
                file_name: fileName,
                message: '图片已成功生成并保存到项目文件夹'
              });
            } catch (error) {
              console.error('图片生成失败:', error);
              await writeBuildLog(supabase, task.project_id, 'error', `图片生成失败: ${error.message}`);
              
              toolOutput = JSON.stringify({
                success: false,
                error: error.message
              });
            }
          } else {
            const { result } = await executeToolCall(toolName, args, toolContext);
            
            if (toolName === 'write_file' && (result as { success: boolean; file_path?: string }).success) {
              const writeResult = result as { success: boolean; file_path?: string };
              if (writeResult.file_path) {
                modifiedFiles.push(writeResult.file_path);
                await writeBuildLog(supabase, task.project_id, 'success', `文件已写入: ${writeResult.file_path}`);
              }
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
          
          // 将工具结果添加到消息历史（使用 role: "tool" 格式）
          chatMessages.push({
            role: 'tool',
            content: toolOutput,
            tool_call_id: toolCall.id
          });
        }
      } else {
        // 没有函数调用，这是最终响应
        finalResponse = assistantResponse.content || '';
        break;
      }
    }
    
    const resultData: Record<string, unknown> = {
      text: finalResponse,
      model: model,
      processed_files: !!fileContextStr,
      generated_images: generatedImages,
      modified_files: modifiedFiles,
      iterations: iteration
    };
    
    const messageId = await writeAssistantMessage(supabase, task.project_id, finalResponse);
    if (!messageId) throw new Error('写入助手消息失败');
    resultData.messageId = messageId;
    
    await writeBuildLog(supabase, task.project_id, 'success', `AI 任务处理完成 (${iteration} 次迭代, ${modifiedFiles.length} 个文件修改)`);
    await updateTaskStatus(supabase, task.id, 'completed', resultData);
    
  } catch (error) {
    console.error(`处理任务 ${task.id} 失败:`, error);
    await writeBuildLog(supabase, task.project_id, 'error', `AI 任务处理失败: ${error.message}`);
    
    if (task.attempts >= task.max_attempts) {
      await updateTaskStatus(supabase, task.id, 'failed', undefined, error.message);
    } else {
      await supabase.from('ai_tasks').update({
        status: 'queued',
        error: `Attempt ${task.attempts} failed: ${error.message}`
      }).eq('id', task.id);
    }
    throw error;
  }
}
// --- 主服务入口 ---
Deno.serve(async (req)=>{
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }
  try {
    // 初始化环境
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
      const body = await req.json().catch(()=>null);
      // 允许通过 Body 传参，也允许 Webhook 触发时不带参数（自动扫描所有项目）
      // 但为了安全和隔离，当前逻辑主要针对特定 Project 处理
      const projectId = typeof body?.projectId === 'string' ? body.projectId.trim() : undefined;
      // 解析上下文参数
      const rawCtx = body?.projectFilesContext;
      const projectFilesContext = rawCtx ? {
        bucket: rawCtx.bucket,
        path: rawCtx.path,
        versionId: rawCtx.versionId
      } : undefined;
      // 1. 抢占任务
      const task = await claimTask(pgClient, projectId);
      if (!task) {
        return new Response(JSON.stringify({
          message: '没有待处理的任务'
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      console.log(`成功抢占任务: ${task.id}`);
      // 2. 处理任务
      await processTask(task, supabase, openrouterApiKey, projectFilesContext);
      return new Response(JSON.stringify({
        success: true,
        taskId: task.id,
        message: '任务处理完成'
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    } finally{
      await pgClient.end();
    }
  } catch (error) {
    console.error('处理请求失败:', error);
    return new Response(JSON.stringify({
      error: '服务器错误',
      details: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
