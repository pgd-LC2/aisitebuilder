/**
 * Subagent 模块统一导出入口
 * 提供 subagent 系统的所有公共接口
 */

// 类型导出
export type {
  SubagentType,
  SubagentConfig,
  SubagentContext,
  SubagentTaskParams,
  SubagentResult,
  SubagentHandler,
  SubagentRegistryEntry
} from './types.ts';

export { MAX_NESTING_LEVEL } from './types.ts';

// 注册表
export {
  registerSubagent,
  getSubagent,
  hasSubagent,
  getRegisteredSubagentTypes,
  getAllSubagentConfigs,
  generateSubagentTypeDescription
} from './registry.ts';

// 执行器
export {
  executeSubagent,
  canSpawnSubagent,
  getAvailableSubagentTypes
} from './executor.ts';

// Handlers
export { registerRefactorCodeSubagent, REFACTOR_CODE_CONFIG } from './handlers/refactorCode.ts';

// 导入 handler 注册函数
import { registerRefactorCodeSubagent } from './handlers/refactorCode.ts';

/**
 * 初始化所有内置 subagent
 * 在 Edge Function 启动时调用此函数
 */
export function initializeBuiltinSubagents(): void {
  // 注册所有内置 subagent handlers
  registerRefactorCodeSubagent();
  
  console.log('[Subagent] 内置 subagent 初始化完成');
}
