/**
 * Prompt Cache 模块
 * 负责提示词的缓存管理和版本检测
 * 
 * v3 架构：
 * - 新增 modeVersions：InteractionMode 到最新版本 key 的映射
 * - 新增 getLatestModeKey：获取模式的最新提示词 key
 * 
 * 包含：
 * - 版本缓存（自动检测最新版本）
 * - 提示词内容缓存
 * - 缓存刷新逻辑
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import type { PromptLayer, WorkflowMode, InteractionMode } from '../types.ts';
import { LAYER_TO_PROMPT_PREFIX, WORKFLOW_MODE_TO_PROMPT_PREFIX, MODE_TO_PROMPT_PREFIX } from './layers.ts';

// --- 版本检测缓存 ---
interface VersionCache {
  layerVersions: Map<string, string>;  // layer -> latest version key
  workflowVersions: Map<string, string>;  // workflow mode -> latest version key
  modeVersions: Map<string, string>;  // interaction mode -> latest version key (v3)
  timestamp: number;
}

let versionCache: VersionCache | null = null;
export const VERSION_CACHE_TTL = 60000; // 1 分钟缓存

// --- 提示词缓存 ---
export const promptCache: Map<string, { content: string; timestamp: number }> = new Map();

// --- 版本提取函数 ---

/**
 * 从提示词 key 中提取版本号
 * 例如: 'core.system.base.v2' -> 2, 'workflow.build.v1' -> 1
 */
export function extractVersion(key: string): number {
  const match = key.match(/\.v(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

// --- 版本检测函数 ---

/**
 * 从数据库获取所有活跃的提示词 key，并检测每个前缀的最新版本
 */
export async function detectLatestVersions(
  supabase: ReturnType<typeof createClient>
): Promise<VersionCache> {
  const layerVersions = new Map<string, string>();
  const workflowVersions = new Map<string, string>();
  const modeVersions = new Map<string, string>();

  try {
    console.log('[PromptCache] 开始检测最新提示词版本...');
    
    const { data, error } = await supabase
      .from('prompts')
      .select('key')
      .eq('is_active', true);

    if (error) {
      console.error('[PromptCache] 版本检测失败:', error);
      // 返回空缓存，后续会使用默认值
      return { layerVersions, workflowVersions, modeVersions, timestamp: Date.now() };
    }

    const keys = (data || []).map(item => item.key);
    console.log(`[PromptCache] 数据库中找到 ${keys.length} 个活跃提示词`);

    // 检测统一交互模式提示词的最新版本（v3 架构）
    for (const [mode, prefix] of Object.entries(MODE_TO_PROMPT_PREFIX)) {
      const matchingKeys = keys.filter(k => k.startsWith(prefix + '.v'));
      if (matchingKeys.length > 0) {
        const latestKey = matchingKeys.reduce((latest, current) => {
          return extractVersion(current) > extractVersion(latest) ? current : latest;
        });
        modeVersions.set(mode, latestKey);
        console.log(`[PromptCache] 交互模式 ${mode}: 最新版本 ${latestKey}`);
      }
    }

    // 检测层级提示词的最新版本（向后兼容）
    for (const [layer, prefix] of Object.entries(LAYER_TO_PROMPT_PREFIX)) {
      const matchingKeys = keys.filter(k => k.startsWith(prefix + '.v'));
      if (matchingKeys.length > 0) {
        // 找到版本号最大的 key
        const latestKey = matchingKeys.reduce((latest, current) => {
          return extractVersion(current) > extractVersion(latest) ? current : latest;
        });
        layerVersions.set(layer, latestKey);
        console.log(`[PromptCache] 层级 ${layer}: 最新版本 ${latestKey}`);
      }
    }

    // 检测工作流提示词的最新版本（向后兼容）
    for (const [mode, prefix] of Object.entries(WORKFLOW_MODE_TO_PROMPT_PREFIX)) {
      const matchingKeys = keys.filter(k => k.startsWith(prefix + '.v'));
      if (matchingKeys.length > 0) {
        const latestKey = matchingKeys.reduce((latest, current) => {
          return extractVersion(current) > extractVersion(latest) ? current : latest;
        });
        workflowVersions.set(mode, latestKey);
        console.log(`[PromptCache] 工作流 ${mode}: 最新版本 ${latestKey}`);
      }
    }

  } catch (e) {
    console.error('[PromptCache] 版本检测异常:', e);
  }

  return { layerVersions, workflowVersions, modeVersions, timestamp: Date.now() };
}

/**
 * 获取或刷新版本缓存
 */
export async function getVersionCache(
  supabase: ReturnType<typeof createClient>
): Promise<VersionCache> {
  if (versionCache && Date.now() - versionCache.timestamp < VERSION_CACHE_TTL) {
    return versionCache;
  }
  
  versionCache = await detectLatestVersions(supabase);
  return versionCache;
}

/**
 * 获取层级的最新提示词 key
 * 
 * 设计原则：找不到版本时直接抛出错误，不使用 .v1 默认值回退
 */
export async function getLatestLayerKey(
  supabase: ReturnType<typeof createClient>,
  layer: PromptLayer
): Promise<string> {
  const cache = await getVersionCache(supabase);
  const latestKey = cache.layerVersions.get(layer);
  
  if (latestKey) {
    return latestKey;
  }
  
  const prefix = LAYER_TO_PROMPT_PREFIX[layer];
  throw new Error(`提示词版本缺失: 层级 "${layer}" (前缀: ${prefix}) 在数据库中没有任何活跃版本。请确保已在 prompts 表中配置该层级的提示词。`);
}

/**
 * 获取工作流模式的最新提示词 key
 * 
 * @deprecated 使用 getLatestModeKey 替代
 * 设计原则：找不到版本时直接抛出错误，不使用 .v1 默认值回退
 */
export async function getLatestWorkflowKey(
  supabase: ReturnType<typeof createClient>,
  mode: WorkflowMode
): Promise<string> {
  const cache = await getVersionCache(supabase);
  const latestKey = cache.workflowVersions.get(mode);
  
  if (latestKey) {
    return latestKey;
  }
  
  const prefix = WORKFLOW_MODE_TO_PROMPT_PREFIX[mode];
  throw new Error(`提示词版本缺失: 工作流模式 "${mode}" (前缀: ${prefix}) 在数据库中没有任何活跃版本。请确保已在 prompts 表中配置该工作流的提示词。`);
}

/**
 * 获取交互模式的最新提示词 key（v3 架构）
 * 
 * 设计原则：找不到版本时直接抛出错误，不使用 .v1 默认值回退
 */
export async function getLatestModeKey(
  supabase: ReturnType<typeof createClient>,
  mode: InteractionMode
): Promise<string> {
  const cache = await getVersionCache(supabase);
  const latestKey = cache.modeVersions.get(mode);
  
  if (latestKey) {
    return latestKey;
  }
  
  const prefix = MODE_TO_PROMPT_PREFIX[mode];
  throw new Error(`提示词版本缺失: 交互模式 "${mode}" (前缀: ${prefix}) 在数据库中没有任何活跃版本。请确保已在 prompts 表中配置该模式的提示词。`);
}

/**
 * 清除版本缓存（用于强制刷新）
 */
export function clearVersionCache(): void {
  versionCache = null;
  console.log('[PromptCache] 版本缓存已清除');
}

/**
 * 清除提示词内容缓存（用于强制刷新）
 */
export function clearPromptCache(): void {
  promptCache.clear();
  console.log('[PromptCache] 提示词内容缓存已清除');
}

/**
 * 清除所有缓存
 */
export function clearAllCaches(): void {
  clearVersionCache();
  clearPromptCache();
}
