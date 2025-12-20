/**
 * Prompt Assembler 模块
 * 负责组装完整的 system prompt
 * 
 * 设计原则：
 * - 数据库不可用 = 系统不可用（立即失败）
 * - 不提供硬编码默认值回退
 * - 所有提示词必须从数据库获取
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { CACHE_TTL } from '../config.ts';
import type { PromptRouterContext, PromptFetchErrorType } from '../types.ts';
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
 * 
 * 设计原则：数据库不可用时直接抛出错误，不使用默认值回退
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
      throw new Error(`提示词获取失败 (${errorType}): ${error.message}. 请检查数据库连接和 prompts 表配置。`);
    }
    
    const fetchedKeys = new Set<string>();
    for (const item of data || []) {
      result[item.key] = item.content;
      promptCache.set(item.key, { content: item.content, timestamp: Date.now() });
      fetchedKeys.add(item.key);
      console.log(`[PromptAssembler] 成功加载: ${item.key} (len=${item.content.length}) source=supabase`);
    }
    
    const missingKeys = keysToFetch.filter(key => !fetchedKeys.has(key));
    if (missingKeys.length > 0) {
      console.error(`[PromptAssembler] 提示词缺失:`, { missingKeys });
      throw new Error(`提示词缺失: ${missingKeys.join(', ')}. 请确保这些提示词已在数据库中配置并激活。`);
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
  
  console.log(`[PromptAssembler] 加载统计: ${promptKeys.length}/${promptKeys.length} 从数据库加载`);
  
  const assembledPrompt = promptKeys
    .map(key => prompts[key])
    .filter(p => p && p.length > 0)
    .join('\n\n---\n\n');
  
  if (fileContext) {
    return assembledPrompt + '\n\n---\n\n' + fileContext;
  }
  
  return assembledPrompt;
}
