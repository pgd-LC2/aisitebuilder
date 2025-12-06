/**
 * Subagent 执行器
 * 负责执行 subagent 任务，包括嵌套层级检查和结果处理
 */

import type {
  SubagentContext, 
  SubagentTaskParams, 
  SubagentResult,
  SubagentType
} from './types.ts';
import { MAX_NESTING_LEVEL } from './types.ts';
import { getSubagent, hasSubagent, getRegisteredSubagentTypes } from './registry.ts';
import { writeBuildLog } from '../logging/buildLog.ts';
import { logAgentEvent } from '../logging/agentEvents.ts';

/**
 * 执行 subagent 任务
 * @param context subagent 执行上下文
 * @param params subagent 任务参数
 * @returns subagent 执行结果
 */
export async function executeSubagent(
  context: SubagentContext,
  params: SubagentTaskParams
): Promise<SubagentResult> {
  const startTime = Date.now();
  const { supabase, projectId, parentTaskId, nestingLevel } = context;
  
  console.log(`[SubagentExecutor] 开始执行 subagent: ${params.type}, 嵌套层级: ${nestingLevel}`);
  
  // 检查嵌套层级
  if (nestingLevel >= MAX_NESTING_LEVEL) {
    const errorMsg = `已达到最大嵌套层级 (${MAX_NESTING_LEVEL})，无法创建更多 subagent`;
    console.warn(`[SubagentExecutor] ${errorMsg}`);
    await writeBuildLog(supabase, projectId, 'warning', `[Subagent] ${errorMsg}`);
    
    return {
      success: false,
      type: params.type,
      output: '',
      modifiedFiles: [],
      error: errorMsg,
      executionTime: Date.now() - startTime
    };
  }
  
  // 检查 subagent 是否已注册
  if (!hasSubagent(params.type)) {
    const availableTypes = getRegisteredSubagentTypes();
    const errorMsg = `未知的 subagent 类型: ${params.type}。可用类型: ${availableTypes.join(', ')}`;
    console.error(`[SubagentExecutor] ${errorMsg}`);
    await writeBuildLog(supabase, projectId, 'error', `[Subagent] ${errorMsg}`);
    
    return {
      success: false,
      type: params.type,
      output: '',
      modifiedFiles: [],
      error: errorMsg,
      executionTime: Date.now() - startTime
    };
  }
  
  const entry = getSubagent(params.type)!;
  
  // 记录 subagent 启动事件
  await writeBuildLog(
    supabase, 
    projectId, 
    'info', 
    `[Subagent] 启动 ${entry.config.name} (类型: ${params.type}, 层级: ${nestingLevel + 1})`
  );
  
  await logAgentEvent(supabase, parentTaskId, projectId, 'agent_phase', {
    phase: 'subagent_started',
    subagentType: params.type,
    subagentName: entry.config.name,
    nestingLevel: nestingLevel + 1,
    instruction: params.instruction.substring(0, 200)
  });
  
  try {
    // 创建子上下文，增加嵌套层级
    const childContext: SubagentContext = {
      ...context,
      nestingLevel: nestingLevel + 1
    };
    
    // 执行 subagent handler
    const result = await entry.handler(childContext, params);
    
    // 记录 subagent 完成事件
    await writeBuildLog(
      supabase,
      projectId,
      result.success ? 'success' : 'error',
      `[Subagent] ${entry.config.name} ${result.success ? '执行成功' : '执行失败'}: ${result.output.substring(0, 200)}`
    );
    
    await logAgentEvent(supabase, parentTaskId, projectId, 'agent_phase', {
      phase: 'subagent_completed',
      subagentType: params.type,
      success: result.success,
      modifiedFilesCount: result.modifiedFiles.length,
      executionTime: result.executionTime,
      error: result.error
    });
    
    return result;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[SubagentExecutor] subagent 执行异常:`, error);
    
    await writeBuildLog(supabase, projectId, 'error', `[Subagent] ${entry.config.name} 执行异常: ${errorMessage}`);
    
    await logAgentEvent(supabase, parentTaskId, projectId, 'error', {
      errorType: 'subagent_execution_error',
      subagentType: params.type,
      errorMessage
    });
    
    return {
      success: false,
      type: params.type,
      output: '',
      modifiedFiles: [],
      error: errorMessage,
      executionTime: Date.now() - startTime
    };
  }
}

/**
 * 检查是否可以创建 subagent
 * @param nestingLevel 当前嵌套层级
 * @returns 是否可以创建
 */
export function canSpawnSubagent(nestingLevel: number): boolean {
  return nestingLevel < MAX_NESTING_LEVEL;
}

/**
 * 获取当前可用的 subagent 类型列表
 * @returns subagent 类型数组
 */
export function getAvailableSubagentTypes(): SubagentType[] {
  return getRegisteredSubagentTypes();
}
