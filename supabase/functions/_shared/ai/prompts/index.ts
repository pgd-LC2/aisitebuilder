/**
 * Prompts 模块统一导出入口
 * 
 * v3 架构：
 * - 新增 MODE_TO_PROMPT_PREFIX：InteractionMode 到单一提示词的映射
 * - 新增 getLatestModeKey：获取模式的最新提示词 key
 * - 新增 routePromptByMode：根据模式路由提示词
 * - 新增 assembleSystemPromptByMode：根据模式组装提示词
 * 
 * 模块职责：
 * - layers.ts: 默认提示词定义和层级映射
 * - cache.ts: 缓存管理和版本检测
 * - router.ts: 路由逻辑
 * - assembler.ts: 提示词组装
 */

// --- 从 layers.ts 导出 ---
export {
  // v3 架构：统一交互模式映射
  MODE_TO_PROMPT_PREFIX,
  // 向后兼容
  LAYER_TO_PROMPT_PREFIX,
  WORKFLOW_MODE_TO_PROMPT_PREFIX
} from './layers.ts';

// --- 从 cache.ts 导出 ---
export {
  VERSION_CACHE_TTL,
  promptCache,
  extractVersion,
  detectLatestVersions,
  getVersionCache,
  // v3 架构：模式版本检测
  getLatestModeKey,
  // 向后兼容
  getLatestLayerKey,
  getLatestWorkflowKey,
  clearVersionCache,
  clearPromptCache,
  clearAllCaches
} from './cache.ts';

// --- 从 router.ts 导出 ---
export {
  // v3 架构：模式路由
  routePromptByMode,
  // 向后兼容
  PROMPT_ROUTING_TABLE,
  routePromptLayers,
  routePromptsAsync,
  cleanupOldPromptVersions
} from './router.ts';

// --- 从 assembler.ts 导出 ---
export {
  classifyPromptError,
  getMultiplePrompts,
  // v3 架构：模式组装
  assembleSystemPromptByMode,
  // 向后兼容
  assembleSystemPrompt
} from './assembler.ts';
