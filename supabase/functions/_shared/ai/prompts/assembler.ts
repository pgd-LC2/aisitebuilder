/**
 * Prompt Assembler 模块
 * 负责组装完整的 system prompt
 * 
 * 包含：
 * - 批量获取提示词
 * - 组装完整的 system prompt
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { CACHE_TTL } from '../config.ts';
import type { PromptRouterContext, PromptFetchErrorType } from '../types.ts';
import { DEFAULT_PROMPTS } from './layers.ts';
import { promptCache, getLatestWorkflowKey } from './cache.ts';
import { routePromptsAsync } from './router.ts';

// --- 错误分类函数 ---

/**
 * 分类提示词获取错误类型
 */
export function classifyPromptError(error: { code?: string; message?: string; details?: string }): PromptFetchErrorType {
  const errorCode = error?.code || '';
  const errorMessage = error?.message?.toLowerCase() || '';
  
  if (errorCode === '42501' || errorMessage.includes('permission') || errorMessage.includes('rls') || errorMessage.includes('policy')) {
    return 'PERMISSION';
  }
  if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('connection') || errorMessage.includes('fetch')) {
    return 'NETWORK_ERROR';
  }
  return 'QUERY_ERROR';
}

// --- 批量获取提示词 ---

/**
 * 批量获取多个提示词
 * 优先从缓存获取，缓存未命中则从数据库获取
 * 数据库获取失败则使用默认值
 */
export async function getMultiplePrompts(
  supabase: ReturnType<typeof createClient>,
  keys: string[]
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const keysToFetch: string[] = [];

  for (const key of keys) {
    const cached = promptCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      result[key] = cached.content;
      console.log(`[PromptAssembler] 缓存命中: ${key}`);
    } else {
      keysToFetch.push(key);
    }
  }

  if (keysToFetch.length > 0) {
    console.log(`[PromptAssembler] 从数据库获取提示词: ${keysToFetch.join(', ')}`);
    try {
      const { data, error } = await supabase
        .from('prompts')
        .select('key, content')
        .in('key', keysToFetch)
        .eq('is_active', true);

      if (error) {
        const errorType = classifyPromptError(error);
        console.error(`[PromptAssembler] ${errorType} 批量获取提示词失败:`, {
          errorType,
          code: error.code,
          message: error.message,
          details: error.details,
          keys: keysToFetch
        });
        for (const key of keysToFetch) {
          console.log(`[PromptAssembler] Fallback (${errorType}): ${key} 使用默认值`);
          result[key] = DEFAULT_PROMPTS[key] || '';
        }
      } else {
        const fetchedKeys = new Set<string>();
        for (const item of data || []) {
          result[item.key] = item.content;
          promptCache.set(item.key, { content: item.content, timestamp: Date.now() });
          fetchedKeys.add(item.key);
          console.log(`[PromptAssembler] 成功加载: ${item.key} (len=${item.content.length}) source=supabase`);
        }
        for (const key of keysToFetch) {
          if (!fetchedKeys.has(key)) {
            console.log(`[PromptAssembler] Fallback (NOT_FOUND): ${key} 数据库中不存在，使用默认值`);
            result[key] = DEFAULT_PROMPTS[key] || '';
          }
        }
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`[PromptAssembler] NETWORK_ERROR 批量获取提示词异常:`, {
        errorType: 'NETWORK_ERROR',
        message: errorMessage,
        keys: keysToFetch
      });
      for (const key of keysToFetch) {
        console.log(`[PromptAssembler] Fallback (NETWORK_ERROR): ${key} 使用默认值`);
        result[key] = DEFAULT_PROMPTS[key] || '';
      }
    }
  }

  return result;
}

// --- 组装完整的 system prompt ---

/**
 * 组装完整的 system prompt
 * 
 * 组装顺序：
 * 1. 工作流提示词（如果有）- 作为全局行为约束
 * 2. 基础层级提示词（根据任务类型路由）
 * 3. 文件上下文（如果有）
 */
export async function assembleSystemPrompt(
  supabase: ReturnType<typeof createClient>,
  context: PromptRouterContext,
  fileContext?: string
): Promise<string> {
  // 使用动态版本检测获取最新的提示词 key
  const basePromptKeys = await routePromptsAsync(supabase, context);
  
  // 根据工作流模式动态获取最新版本的工作流提示词
  const workflowKey = context.workflowMode 
    ? await getLatestWorkflowKey(supabase, context.workflowMode)
    : undefined;
  
  // 工作流提示词放在最前面，作为全局行为约束
  const promptKeys = workflowKey 
    ? [workflowKey, ...basePromptKeys] 
    : basePromptKeys;
  
  console.log(`[PromptAssembler] 任务类型: ${context.taskType}, 工作流模式: ${context.workflowMode || 'none'}, 组装层: ${promptKeys.join(' → ')}`);
  
  const prompts = await getMultiplePrompts(supabase, promptKeys);
  
  let loadedFromDb = 0;
  let fallbackCount = 0;
  for (const key of promptKeys) {
    if (prompts[key] && prompts[key] !== DEFAULT_PROMPTS[key]) {
      loadedFromDb++;
    } else {
      fallbackCount++;
    }
  }
  console.log(`[PromptAssembler] 加载统计: ${loadedFromDb}/${promptKeys.length} 从数据库加载, ${fallbackCount} 使用默认值`);
  
  const assembledPrompt = promptKeys
    .map(key => prompts[key] || DEFAULT_PROMPTS[key] || '')
    .filter(p => p.length > 0)
    .join('\n\n---\n\n');
  
  if (fileContext) {
    return assembledPrompt + '\n\n---\n\n' + fileContext;
  }
  
  return assembledPrompt;
}
