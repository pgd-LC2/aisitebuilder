/**
 * Edge Function: generate-project-title
 * 使用 AI 模型生成项目标题
 * 
 * 模型: xiaomi/mimo-v2-flash:free
 * 启用 reasoning tokens（思考能力）
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

// --- CORS 配置 ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// --- 常量配置 ---
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_REFERER = 'https://aisitebuilder.app';
const OPENROUTER_TITLE = 'AI Site Builder';
const MODEL = 'xiaomi/mimo-v2-flash:free';
const MAX_PROMPT_LENGTH = 100000;

// --- 类型定义 ---
interface GenerateTitleRequest {
  prompt: string;
}

interface GenerateTitleResponse {
  title: string;
  reasoning?: string;
}

// --- 系统提示词 ---
const SYSTEM_PROMPT = `你是一个项目命名专家。根据用户的项目描述，生成一个简洁、专业的项目名称。

要求：
- 长度：5-15个字符
- 风格：简洁专业，突出项目核心功能
- 格式：直接输出项目名，不要加引号、标点或其他多余内容
- 语言：尽量使用中文，但可以包含英文

示例：
- 用户描述："我想做一个在线购物网站" → 智能购物商城平台
- 用户描述："帮我做一个任务管理工具" → 高效任务管理系统
- 用户描述："做一个博客网站" → 个人博客创作空间
- 用户描述："Build a todo app" → Todo任务管理`;

// --- 验证标题 ---
function validateTitle(title: string): boolean {
  // 去除首尾空白
  const trimmed = title.trim();
  
  // 检查长度（5-20个字符，允许一定弹性）
  if (trimmed.length < 5 || trimmed.length > 20) {
    return false;
  }
  
  return true;
}

// --- 清理标题 ---
function cleanTitle(title: string): string {
  // 去除首尾空白
  let cleaned = title.trim();
  
  // 去除可能的引号
  cleaned = cleaned.replace(/^["'「」『』""'']+|["'「」『』""'']+$/g, '');
  
  // 去除可能的标点符号结尾
  cleaned = cleaned.replace(/[。，！？；：、]+$/g, '');
  
  return cleaned.trim();
}

// --- 主处理函数 ---
Deno.serve(async (req: Request) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // 获取 OpenRouter API Key
    const openrouterKey = Deno.env.get('OPENROUTER_KEY');
    if (!openrouterKey) {
      console.error('OPENROUTER_KEY 未配置');
      return new Response(
        JSON.stringify({ error: 'API 配置错误' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 初始化 Supabase 客户端
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 验证授权
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: '未授权' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 获取用户信息
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: '无效的授权令牌' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 解析请求体
    const { prompt } = await req.json() as GenerateTitleRequest;

    if (!prompt || typeof prompt !== 'string') {
      return new Response(
        JSON.stringify({ error: '缺少必要参数: prompt' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 检查 prompt 长度
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return new Response(
        JSON.stringify({ error: `prompt 长度超过限制（最大 ${MAX_PROMPT_LENGTH} 字符）` }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`[generate-project-title] 用户 ${user.id} 请求生成标题，prompt 长度: ${prompt.length}`);

    // 调用 OpenRouter API
    const requestBody = {
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      max_tokens: 100000,
      reasoning: {
        enabled: true,
        exclude: false
      }
    };

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openrouterKey}`,
        'HTTP-Referer': OPENROUTER_REFERER,
        'X-Title': OPENROUTER_TITLE
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`OpenRouter API 错误: ${response.status} - ${errorData}`);
      return new Response(
        JSON.stringify({ error: 'AI 服务暂时不可用，请稍后重试' }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const data = await response.json();
    
    // 解析响应
    const choices = data.choices as Array<{
      message: {
        content?: string;
        reasoning?: string;
      };
    }> || [];
    
    const message = choices[0]?.message;
    if (!message || !message.content) {
      console.error('OpenRouter API 返回空内容');
      return new Response(
        JSON.stringify({ error: 'AI 生成失败，请重试' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 清理和验证标题
    let title = cleanTitle(message.content);
    
    // 如果标题不符合要求，尝试截取或使用默认值
    if (!validateTitle(title)) {
      console.warn(`生成的标题不符合要求: "${title}"，尝试截取`);
      // 尝试截取前15个字符
      if (title.length > 15) {
        title = title.slice(0, 15);
      }
      // 如果仍然不符合要求，使用默认标题
      if (!validateTitle(title)) {
        title = '智能创意项目';
      }
    }

    console.log(`[generate-project-title] 生成标题成功: "${title}"`);

    const result: GenerateTitleResponse = {
      title,
      reasoning: message.reasoning
    };

    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('生成标题出错:', error);
    return new Response(
      JSON.stringify({ 
        error: '服务器错误', 
        details: error instanceof Error ? error.message : String(error) 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
