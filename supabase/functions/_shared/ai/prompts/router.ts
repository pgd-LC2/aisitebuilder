/**
 * Prompt Router 模块 v2
 * 负责根据任务类型和上下文路由到正确的提示词层级
 * 
 * v2 改进：
 * - 智能版本检测：自动检测并使用最新版本的提示词
 * - 动态路由：不再硬编码提示词 key，而是从数据库动态获取
 * - 职责分离：路由逻辑与缓存、组装逻辑分离
 * 
 * 相关模块：
 * - layers.ts: 默认提示词定义
 * - cache.ts: 缓存管理
 * - assembler.ts: 提示词组装
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import type { TaskType, PromptLayer, PromptRouterContext } from '../types.ts';
import { getLatestLayerKey, extractVersion } from './cache.ts';

// --- 路由配置 ---

export const PROMPT_ROUTING_TABLE: Record<TaskType, PromptLayer[]> = {
  // chat_reply 使用专用的 'chat' 层级，提供只读分析能力，不包含文件修改工具
  'chat_reply': ['chat'],
  'build_site': ['core', 'planner', 'coder', 'reviewer'],
  'refactor_code': ['core', 'coder', 'reviewer'],
  'debug': ['core', 'debugger']
};

// --- Prompt Router 函数 ---

/**
 * 根据上下文确定需要的提示词层级（返回层级名称数组）
 */
export function routePromptLayers(context: PromptRouterContext): PromptLayer[] {
  let layers = [...PROMPT_ROUTING_TABLE[context.taskType] || PROMPT_ROUTING_TABLE['chat_reply']];
  
  // chat_reply 任务使用专用的 'chat' 层级，不应受 isNewProject 或 hasError 的影响
  // 这确保了聊天模式下 AI 只有只读分析能力，不会被添加 Planner/Reviewer/Debugger 层
  if (context.taskType === 'chat_reply') {
    console.log('[PromptRouter] chat_reply 任务使用专用 chat 层级，跳过动态层级调整');
    return layers;
  }
  
  if (context.hasError || context.errorInfo) {
    if (!layers.includes('debugger')) {
      layers.push('debugger');
      console.log('[PromptRouter] 检测到错误信息，自动插入 Debugger 层');
    }
  }
  
  if (context.isNewProject) {
    if (!layers.includes('planner')) {
      layers = ['core', 'planner', ...layers.filter(l => l !== 'core')];
      console.log('[PromptRouter] 新建项目，强制启用 Planner 层');
    }
    if (!layers.includes('reviewer')) {
      layers.push('reviewer');
      console.log('[PromptRouter] 新建项目，强制启用 Reviewer 层');
    }
  }
  
  return layers;
}

/**
 * 根据上下文动态获取最新版本的提示词 key 列表
 */
export async function routePromptsAsync(
  supabase: ReturnType<typeof createClient>,
  context: PromptRouterContext
): Promise<string[]> {
  const layers = routePromptLayers(context);
  const keys: string[] = [];
  
  for (const layer of layers) {
    const key = await getLatestLayerKey(supabase, layer);
    keys.push(key);
  }
  
  return keys;
}

/**
 * 删除旧版本提示词（保留最新版本）
 */
export async function cleanupOldPromptVersions(
  supabase: ReturnType<typeof createClient>
): Promise<{ deleted: string[]; errors: string[] }> {
  const deleted: string[] = [];
  const errors: string[] = [];

  try {
    console.log('[PromptRouter] 开始清理旧版本提示词...');
    
    const { data, error } = await supabase
      .from('prompts')
      .select('key')
      .eq('is_active', true);

    if (error) {
      errors.push(`查询失败: ${error.message}`);
      return { deleted, errors };
    }

    const keys = (data || []).map(item => item.key);
    
    // 按前缀分组
    const prefixGroups = new Map<string, string[]>();
    for (const key of keys) {
      const match = key.match(/^(.+)\.v\d+$/);
      if (match) {
        const prefix = match[1];
        if (!prefixGroups.has(prefix)) {
          prefixGroups.set(prefix, []);
        }
        prefixGroups.get(prefix)!.push(key);
      }
    }

    // 对每个前缀，删除非最新版本
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const [_prefix, groupKeys] of prefixGroups) {
      if (groupKeys.length <= 1) continue;
      
      // 找到最新版本
      const latestKey = groupKeys.reduce((latest, current) => {
        return extractVersion(current) > extractVersion(latest) ? current : latest;
      });
      
      // 删除其他版本
      for (const key of groupKeys) {
        if (key !== latestKey) {
          const { error: deleteError } = await supabase
            .from('prompts')
            .delete()
            .eq('key', key);
          
          if (deleteError) {
            errors.push(`删除 ${key} 失败: ${deleteError.message}`);
          } else {
            deleted.push(key);
            console.log(`[PromptRouter] 已删除旧版本: ${key}`);
          }
        }
      }
    }

    console.log(`[PromptRouter] 清理完成: 删除 ${deleted.length} 个旧版本`);
    
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    errors.push(`清理异常: ${errorMessage}`);
  }

  return { deleted, errors };
}
