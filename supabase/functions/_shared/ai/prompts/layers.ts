/**
 * Prompt Layers 模块
 * 负责定义层级到提示词前缀的映射
 * 
 * 注意：所有提示词内容必须从数据库获取，不再提供硬编码默认值
 * 如果数据库不可用，系统应该明确失败而不是使用回退值
 */

import type { PromptLayer, WorkflowMode } from '../types.ts';

// --- 层级到提示词前缀的映射（用于动态版本检测）---
export const LAYER_TO_PROMPT_PREFIX: Record<PromptLayer, string> = {
  'core': 'core.system.base',
  'planner': 'planner.web.structure',
  'coder': 'coder.web.implement',
  'reviewer': 'reviewer.quality.check',
  'debugger': 'debugger.error.diagnosis',
  // chat 层级专用于 chat_reply 任务，提供只读分析能力
  'chat': 'chat.assistant.readonly'
};

// --- 工作流模式到提示词前缀的映射（用于动态版本检测）---
export const WORKFLOW_MODE_TO_PROMPT_PREFIX: Record<WorkflowMode, string> = {
  'default': 'workflow.default',
  'planning': 'workflow.planning',
  'build': 'workflow.build'
};
