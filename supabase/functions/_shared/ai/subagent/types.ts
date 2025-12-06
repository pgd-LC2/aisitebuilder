/**
 * Subagent 类型定义
 * 定义 subagent 系统的所有接口和类型
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import type { ToolContext, ProjectFilesContext } from '../types.ts';

// Subagent 类型枚举
export type SubagentType = 'refactor_code' | 'debug' | 'review';

// Subagent 配置接口
export interface SubagentConfig {
  type: SubagentType;
  name: string;
  description: string;
  maxNestingLevel: number;
  promptLayers: string[];
}

// Subagent 执行上下文
export interface SubagentContext {
  supabase: ReturnType<typeof createClient>;
  apiKey: string;
  projectId: string;
  toolContext: ToolContext;
  projectFilesContext?: ProjectFilesContext;
  parentTaskId: string;
  nestingLevel: number;
}

// Subagent 任务参数
export interface SubagentTaskParams {
  type: SubagentType;
  instruction: string;
  targetFiles?: string[];
  additionalContext?: Record<string, unknown>;
}

// Subagent 执行结果
export interface SubagentResult {
  success: boolean;
  type: SubagentType;
  output: string;
  modifiedFiles: string[];
  error?: string;
  executionTime: number;
}

// Subagent 处理器函数类型
export type SubagentHandler = (
  context: SubagentContext,
  params: SubagentTaskParams
) => Promise<SubagentResult>;

// Subagent 注册表条目
export interface SubagentRegistryEntry {
  config: SubagentConfig;
  handler: SubagentHandler;
}

// 最大嵌套层级常量
export const MAX_NESTING_LEVEL = 1;
