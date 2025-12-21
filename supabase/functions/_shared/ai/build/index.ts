/**
 * Build 模块统一导出入口
 * 
 * 提供 build 模式的任务处理能力
 */

export { handleBuildTask } from './buildTaskHandler.ts';
export type { BuildTaskInput, BuildTaskResult } from './types.ts';
export { BUILD_CONFIG } from './buildConfig.ts';
