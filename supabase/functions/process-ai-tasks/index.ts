import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { Client } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface AITask {
  id: string;
  project_id: string;
  user_id: string;
  type: string;
  payload: Record<string, any>;
  status: string;
  attempts: number;
  max_attempts: number;
}

interface ChatMessage {
  id: string;
  project_id: string;
  role: string;
  content: string;
}

async function claimTask(pgClient: Client): Promise<AITask | null> {
  try {
    const result = await pgClient.queryObject<AITask>`
      UPDATE ai_tasks
      SET 
        status = 'running',
        attempts = attempts + 1,
        started_at = now()
      WHERE id = (
        SELECT id
        FROM ai_tasks
        WHERE status = 'queued'
          AND attempts < max_attempts
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *
    `;

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error('抢占任务失败:', error);
    throw error;
  }
}

async function fetchRecentChatMessages(
  supabase: any,
  projectId: string,
  limit: number = 10
): Promise<ChatMessage[]> {
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

async function callOpenRouter(
  messages: Array<{ role: string; content: string }>,
  apiKey: string
): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://aisitebuilder.app',
      'X-Title': 'AI Site Builder',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenRouter API 错误: ${response.status} - ${errorData}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function writeBuildLog(
  supabase: any,
  projectId: string,
  logType: string,
  message: string
): Promise<void> {
  const { error } = await supabase
    .from('build_logs')
    .insert({
      project_id: projectId,
      log_type: logType,
      message: message,
      metadata: {}
    });

  if (error) {
    console.error('写入构建日志失败:', error);
  }
}

async function writeAssistantMessage(
  supabase: any,
  projectId: string,
  content: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      project_id: projectId,
      role: 'assistant',
      content: content,
      metadata: {}
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error('写入助手消息失败:', error);
    return null;
  }

  return data?.id || null;
}

async function updateTaskStatus(
  supabase: any,
  taskId: string,
  status: string,
  result?: Record<string, any>,
  error?: string
): Promise<void> {
  const updateData: any = {
    status: status,
    finished_at: new Date().toISOString(),
  };

  if (result) {
    updateData.result = result;
  }

  if (error) {
    updateData.error = error;
  }

  const { error: updateError } = await supabase
    .from('ai_tasks')
    .update(updateData)
    .eq('id', taskId);

  if (updateError) {
    console.error('更新任务状态失败:', updateError);
  }
}

async function processTask(task: AITask, supabase: any, apiKey: string): Promise<void> {
  console.log(`开始处理任务: ${task.id}, 类型: ${task.type}`);

  try {
    await writeBuildLog(supabase, task.project_id, 'info', `开始处理 AI 任务: ${task.type}`);

    if (task.type === 'chat_reply') {
      const chatHistory = await fetchRecentChatMessages(supabase, task.project_id, 10);
      
      const messages = [
        {
          role: 'system',
          content: '你是一个专业的 AI 助手，帮助用户构建网站和解决技术问题。请用简体中文回复。'
        },
        ...chatHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ];

      console.log(`调用 OpenRouter API，消息数量: ${messages.length}`);
      const aiResponse = await callOpenRouter(messages, apiKey);
      console.log(`OpenRouter 响应长度: ${aiResponse.length} 字符`);

      const messageId = await writeAssistantMessage(supabase, task.project_id, aiResponse);
      
      if (messageId) {
        await writeBuildLog(supabase, task.project_id, 'success', 'AI 响应已生成并保存');
        
        await updateTaskStatus(supabase, task.id, 'completed', {
          messageId: messageId,
          text: aiResponse,
          model: 'openai/gpt-4o-mini'
        });

        console.log(`任务 ${task.id} 处理完成`);
      } else {
        throw new Error('写入助手消息失败');
      }
    } else {
      throw new Error(`不支持的任务类型: ${task.type}`);
    }
  } catch (error) {
    console.error(`处理任务 ${task.id} 失败:`, error);
    
    await writeBuildLog(
      supabase,
      task.project_id,
      'error',
      `AI 任务处理失败: ${error.message}`
    );

    if (task.attempts >= task.max_attempts) {
      await updateTaskStatus(
        supabase,
        task.id,
        'failed',
        undefined,
        error.message
      );
      console.log(`任务 ${task.id} 已达到最大重试次数，标记为失败`);
    } else {
      await updateTaskStatus(
        supabase,
        task.id,
        'queued',
        undefined,
        `尝试 ${task.attempts}/${task.max_attempts} 失败: ${error.message}`
      );
      console.log(`任务 ${task.id} 将重试，当前尝试次数: ${task.attempts}/${task.max_attempts}`);
    }

    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openrouterApiKey = Deno.env.get('OPENROUTER_KEY')!;
    const databaseUrl = Deno.env.get('SUPABASE_DB_URL')!;

    if (!openrouterApiKey) {
      throw new Error('OPENROUTER_KEY 环境变量未设置');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const pgClient = new Client(databaseUrl);
    await pgClient.connect();

    try {
      const task = await claimTask(pgClient);

      if (!task) {
        console.log('没有待处理的任务');
        return new Response(
          JSON.stringify({ message: '没有待处理的任务' }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      console.log(`成功抢占任务: ${task.id}`);

      await processTask(task, supabase, openrouterApiKey);

      return new Response(
        JSON.stringify({
          success: true,
          taskId: task.id,
          message: '任务处理完成'
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } finally {
      await pgClient.end();
    }
  } catch (error) {
    console.error('处理请求失败:', error);
    return new Response(
      JSON.stringify({
        error: '服务器错误',
        details: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
