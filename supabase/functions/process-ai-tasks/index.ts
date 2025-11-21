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
const TOOLS = [
  {
    type: 'function',
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
  }
];

// --- API 调用与日志 ---
async function callOpenRouter(messages, apiKey, model, tools = null) {
  const requestBody: any = {
    model: model,
    messages: messages,
    temperature: 0.7,
    max_tokens: 4000
  };
  
  if (tools) {
    requestBody.tools = tools;
  }
  
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
    throw new Error(`OpenRouter API 错误: ${response.status} - ${errorData}`);
  }
  const data = await response.json();
  return data.choices[0].message;
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
    
    let messages = [];
    const baseSystemPrompt = '你是一个专业的全栈开发 AI 助手。请用简体中文回复。你可以使用generate_image工具来生成图片。';
    
    if (task.type === 'chat_reply') {
      const chatHistory = await fetchRecentChatMessages(supabase, task.project_id, 10);
      const contextPrompt = fileContextStr ? `\n参考现有代码: ${fileContextStr}` : '';
      messages = [
        {
          role: 'system',
          content: baseSystemPrompt + contextPrompt
        },
        ...chatHistory.map((msg)=>({
            role: msg.role,
            content: msg.content
          }))
      ];
    } else if (task.type === 'build_site') {
      const requirement = task.payload?.requirement || "创建基础着陆页";
      messages = [
        {
          role: 'system',
          content: `${baseSystemPrompt}\n你的任务是根据用户需求生成网站代码。${fileContextStr}\n请输出 JSON 格式的构建计划，或直接输出代码块。`
        },
        {
          role: 'user',
          content: `构建需求：${requirement}`
        }
      ];
    } else if (task.type === 'refactor_code') {
      const code = task.payload?.code || "";
      messages = [
        {
          role: 'system',
          content: `${baseSystemPrompt}\n你的任务是重构代码，关注性能、可读性和最佳实践。${fileContextStr}`
        },
        {
          role: 'user',
          content: `请重构以下代码：\n${code}`
        }
      ];
    } else {
      throw new Error(`不支持的任务类型: ${task.type}`);
    }
    
    console.log(`调用 OpenRouter API, Model: ${model}, Msg Count: ${messages.length}`);
    
    const maxIterations = 10;
    let iteration = 0;
    let finalResponse = '';
    const generatedImages: string[] = [];
    
    while (iteration < maxIterations) {
      iteration++;
      console.log(`Agent 迭代 ${iteration}/${maxIterations}`);
      
      const assistantMessage = await callOpenRouter(messages, apiKey, model, TOOLS);
      messages.push(assistantMessage);
      
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCall.function.name === 'generate_image') {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              const prompt = args.prompt;
              const aspectRatio = args.aspect_ratio || '1:1';
              
              await writeBuildLog(supabase, task.project_id, 'info', `正在生成图片: ${prompt}`);
              
              const imageDataUrl = await generateImage(prompt, apiKey, aspectRatio);
              
              const timestamp = Date.now();
              const fileName = `generated_image_${timestamp}.png`;
              const versionId = projectFilesContext?.versionId || 'default';
              
              const imagePath = await saveImageToStorage(
                supabase,
                task.project_id,
                versionId,
                imageDataUrl,
                fileName
              );
              
              generatedImages.push(imagePath);
              
              await writeBuildLog(supabase, task.project_id, 'success', `图片已生成并保存: ${imagePath}`);
              
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  success: true,
                  image_path: imagePath,
                  file_name: fileName,
                  message: '图片已成功生成并保存到项目文件夹'
                })
              });
            } catch (error) {
              console.error('图片生成失败:', error);
              await writeBuildLog(supabase, task.project_id, 'error', `图片生成失败: ${error.message}`);
              
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  success: false,
                  error: error.message
                })
              });
            }
          }
        }
      } else {
        finalResponse = assistantMessage.content || '';
        break;
      }
    }
    
    if (iteration >= maxIterations) {
      finalResponse = '处理超时，已达到最大迭代次数';
    }
    
    const resultData = {
      text: finalResponse,
      model: model,
      processed_files: !!fileContextStr,
      generated_images: generatedImages,
      iterations: iteration
    };
    
    if (task.type === 'chat_reply') {
      const messageId = await writeAssistantMessage(supabase, task.project_id, finalResponse);
      if (!messageId) throw new Error('写入助手消息失败');
      resultData.messageId = messageId;
    }
    
    await writeBuildLog(supabase, task.project_id, 'success', 'AI 任务处理完成');
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
