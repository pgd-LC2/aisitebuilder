/**
 * Prompt Layers 模块
 * 负责定义层级到提示词前缀的映射
 * 
 * v3 架构：
 * - 新增 MODE_TO_PROMPT_PREFIX：InteractionMode 到单一提示词的映射
 * - 每种模式只加载一个提示词，不再使用多层拼装
 * 
 * 注意：所有提示词内容必须从数据库获取，不再提供硬编码默认值
 * 如果数据库不可用，系统应该明确失败而不是使用回退值
 */

import type { PromptLayer, WorkflowMode, InteractionMode } from '../types.ts';

// --- 统一交互模式到提示词前缀的映射（v3 架构）---
// 每种模式只加载一个提示词，不再使用多层拼装
export const MODE_TO_PROMPT_PREFIX: Record<InteractionMode, string> = {
  'chat': 'chat.prompt',
  'plan': 'plan.prompt',
  'build': 'build.prompt'
};

// --- 层级到提示词前缀的映射（用于动态版本检测）---
// @deprecated 保留用于向后兼容，新代码应使用 MODE_TO_PROMPT_PREFIX
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
// @deprecated 保留用于向后兼容，新代码应使用 MODE_TO_PROMPT_PREFIX
export const WORKFLOW_MODE_TO_PROMPT_PREFIX: Record<WorkflowMode, string> = {
  'default': 'workflow.default',
  'planning': 'workflow.planning',
  'build': 'workflow.build'
};
