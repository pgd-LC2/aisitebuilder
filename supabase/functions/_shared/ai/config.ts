/**
 * AI 模块配置与常量
 * 包含 CORS 配置、模型配置等
 */

// CORS 配置
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey'
};

// 根据任务类型配置模型 - 统一使用 Google Gemini 3 Pro Preview
export const MODEL_CONFIG: Record<string, string> = {
  chat_reply: 'google/gemini-3-pro-preview',
  build_site: 'google/gemini-3-pro-preview',
  refactor_code: 'google/gemini-3-pro-preview',
  default: 'google/gemini-3-pro-preview'
};

// 图片生成模型
export const IMAGE_MODEL = 'google/gemini-3-pro-image-preview';

// 提示词缓存 TTL
export const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

// OpenRouter API 配置
export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENROUTER_REFERER = 'https://aisitebuilder.app';
export const OPENROUTER_TITLE = 'AI Site Builder';

// LLM 调试日志开关（仅在 DEBUG_LLM=true 时输出详细的 request/response 日志）
export const DEBUG_LLM = Deno.env.get('DEBUG_LLM') === 'true';
