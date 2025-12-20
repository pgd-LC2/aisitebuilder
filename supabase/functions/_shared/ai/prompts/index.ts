/**
 * Prompts 模块统一导出入口
 * 
 * 模块职责：
 * - layers.ts: 默认提示词定义和层级映射
 * - cache.ts: 缓存管理和版本检测
 * - router.ts: 路由逻辑
 * - assembler.ts: 提示词组装
 */

// --- 从 layers.ts 导出 ---
export {
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
  getLatestLayerKey,
  getLatestWorkflowKey,
  clearVersionCache,
  clearPromptCache,
  clearAllCaches
} from './cache.ts';

// --- 从 router.ts 导出 ---
export {
  PROMPT_ROUTING_TABLE,
  routePromptLayers,
  routePromptsAsync,
  cleanupOldPromptVersions
} from './router.ts';

// --- 从 assembler.ts 导出 ---
export {
  classifyPromptError,
  getMultiplePrompts,
  assembleSystemPrompt
} from './assembler.ts';
