/**
 * Subagent 注册表
 * 提供可扩展的 subagent 注册和查询机制
 */

import type { 
  SubagentType, 
  SubagentConfig, 
  SubagentHandler, 
  SubagentRegistryEntry 
} from './types.ts';

// 内部注册表存储
const registry: Map<SubagentType, SubagentRegistryEntry> = new Map();

/**
 * 注册一个新的 subagent
 * @param config subagent 配置
 * @param handler subagent 处理器函数
 */
export function registerSubagent(
  config: SubagentConfig,
  handler: SubagentHandler
): void {
  if (registry.has(config.type)) {
    console.warn(`[SubagentRegistry] 覆盖已存在的 subagent: ${config.type}`);
  }
  
  registry.set(config.type, { config, handler });
  console.log(`[SubagentRegistry] 已注册 subagent: ${config.type} (${config.name})`);
}

/**
 * 获取指定类型的 subagent
 * @param type subagent 类型
 * @returns subagent 注册表条目，如果不存在则返回 undefined
 */
export function getSubagent(type: SubagentType): SubagentRegistryEntry | undefined {
  return registry.get(type);
}

/**
 * 检查指定类型的 subagent 是否已注册
 * @param type subagent 类型
 * @returns 是否已注册
 */
export function hasSubagent(type: SubagentType): boolean {
  return registry.has(type);
}

/**
 * 获取所有已注册的 subagent 类型
 * @returns subagent 类型数组
 */
export function getRegisteredSubagentTypes(): SubagentType[] {
  return Array.from(registry.keys());
}

/**
 * 获取所有已注册的 subagent 配置
 * @returns subagent 配置数组
 */
export function getAllSubagentConfigs(): SubagentConfig[] {
  return Array.from(registry.values()).map(entry => entry.config);
}

/**
 * 生成 subagent 工具的描述信息
 * 用于动态生成 spawn_subagent 工具的参数描述
 * @returns 可用 subagent 类型的描述字符串
 */
export function generateSubagentTypeDescription(): string {
  const configs = getAllSubagentConfigs();
  if (configs.length === 0) {
    return '当前没有可用的 subagent 类型';
  }
  
  const descriptions = configs.map(config => 
    `- ${config.type}: ${config.description}`
  );
  
  return `可用的 subagent 类型:\n${descriptions.join('\n')}`;
}
