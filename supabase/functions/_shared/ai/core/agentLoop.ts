/**
 * AgentLoop - 统一的 Agent 循环抽象
 * 
 * 职责：
 * - 调用 LLM（非流式）
 * - 如果有 tool_calls：逐个执行工具并把 tool 结果追加到 messages
 * - 如果没有：返回 finalResponse
 * - 达到 maxIterations 则返回错误/失败结果
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import type { 
  ChatMessage, 
  ToolDefinition, 
  ProjectFilesContext
} from '../types.ts';
import { callOpenRouterChatCompletionsApi } from '../llm/client.ts';
import { executeToolCall, type ToolExecutionContext, type ToolExecutionResult } from '../tools/executor.ts';
import { writeBuildLog } from '../logging/buildLog.ts';
import { logIterationStart, logToolStart, logToolComplete } from '../logging/agentEvents.ts';

// --- AgentLoop 类型定义 ---

/**
 * 工具重试跟踪
 */
interface ToolRetryTracker {
  toolName: string;
  argsHash: string;
  attempts: number;
  lastError: string;
}

/**
 * 结构化工具错误
 */
interface StructuredToolError {
  toolName: string;
  errorType: 'INVALID_ARGS' | 'EXECUTION_FAILED' | 'TIMEOUT' | 'PERMISSION_DENIED' | 'NOT_FOUND' | 'UNKNOWN';
  errorMessage: string;
  suggestion?: string;
  retryable: boolean;
}

/**
 * AgentLoop 配置
 */
export interface AgentLoopConfig {
  model: string;
  apiKey: string;
  tools: ToolDefinition[];
  toolChoice: 'auto' | 'required' | 'none';
  maxIterations: number;
  maxToolRetries?: number;
}

/**
 * AgentLoop 上下文
 * 包含执行工具所需的所有上下文信息
 */
export interface AgentLoopContext {
  supabase: ReturnType<typeof createClient>;
  projectId: string;
  taskId: string;
  versionId: string;
  bucket: string;
  basePath: string;
  nestingLevel?: number;
  parentTaskId?: string;
  projectFilesContext?: ProjectFilesContext;
}

/**
 * AgentLoop 进度回调
 */
export interface AgentLoopProgress {
  iteration: number;
  phase: 'llm_call' | 'tool_execution' | 'completed' | 'error';
  toolName?: string;
  message?: string;
}

/**
 * AgentLoop 结果
 */
export interface AgentLoopResult {
  success: boolean;
  finalResponse: string;
  iterations: number;
  generatedImages: string[];
  modifiedFiles: string[];
  error?: string;
  messages?: ChatMessage[];
  needsStreamingResponse?: boolean;
}

// --- 辅助函数 ---

/**
 * 生成参数哈希用于重试跟踪
 */
function hashArgs(args: Record<string, unknown>): string {
  return JSON.stringify(args);
}

/**
 * 分类工具错误
 */
function classifyToolError(toolName: string, error: string): StructuredToolError {
  const errorLower = error.toLowerCase();
  
  if (errorLower.includes('not found') || errorLower.includes('不存在')) {
    return {
      toolName,
      errorType: 'NOT_FOUND',
      errorMessage: error,
      suggestion: `文件或资源不存在。请先使用 list_files 或 get_project_structure 确认路径是否正确。`,
      retryable: false
    };
  }
  
  if (errorLower.includes('permission') || errorLower.includes('权限')) {
    return {
      toolName,
      errorType: 'PERMISSION_DENIED',
      errorMessage: error,
      suggestion: `权限不足。请检查是否有访问该资源的权限。`,
      retryable: false
    };
  }
  
  if (errorLower.includes('invalid') || errorLower.includes('参数错误') || errorLower.includes('无效')) {
    return {
      toolName,
      errorType: 'INVALID_ARGS',
      errorMessage: error,
      suggestion: `参数无效。请检查参数格式和值是否正确。`,
      retryable: true
    };
  }
  
  if (errorLower.includes('timeout') || errorLower.includes('超时')) {
    return {
      toolName,
      errorType: 'TIMEOUT',
      errorMessage: error,
      suggestion: `操作超时。可以尝试重试，或者减少操作的数据量。`,
      retryable: true
    };
  }
  
  return {
    toolName,
    errorType: 'EXECUTION_FAILED',
    errorMessage: error,
    suggestion: `工具执行失败。请检查参数是否正确，或尝试使用其他方法。`,
    retryable: true
  };
}

/**
 * 格式化结构化错误为 LLM 可理解的消息
 */
function formatStructuredError(error: StructuredToolError, retryInfo?: { attempts: number; maxRetries: number }): string {
  let message = `[工具错误] ${error.toolName}\n`;
  message += `错误类型: ${error.errorType}\n`;
  message += `错误信息: ${error.errorMessage}\n`;
  
  if (error.suggestion) {
    message += `建议: ${error.suggestion}\n`;
  }
  
  if (retryInfo) {
    if (error.retryable && retryInfo.attempts < retryInfo.maxRetries) {
      message += `状态: 可重试 (${retryInfo.attempts}/${retryInfo.maxRetries} 次尝试)\n`;
    } else if (!error.retryable) {
      message += `状态: 不可重试，请尝试其他方法\n`;
    } else {
      message += `状态: 已达到最大重试次数，请尝试其他方法\n`;
    }
  }
  
  return message;
}

/**
 * 检查是否应该重试工具调用
 */
function shouldRetryTool(
  tracker: ToolRetryTracker | undefined,
  error: StructuredToolError,
  maxRetries: number
): boolean {
  if (!error.retryable) return false;
  if (!tracker) return true;
  return tracker.attempts < maxRetries;
}

// --- AgentLoop 实现 ---

/**
 * 运行 Agent 循环
 * 
 * @param messages - 初始消息列表
 * @param config - 循环配置
 * @param context - 执行上下文
 * @param onProgress - 可选的进度回调
 * @returns AgentLoopResult
 */
export async function runAgentLoop(
  messages: ChatMessage[],
  config: AgentLoopConfig,
  context: AgentLoopContext,
  onProgress?: (progress: AgentLoopProgress) => void | Promise<void>
): Promise<AgentLoopResult> {
  const { model, apiKey, tools, toolChoice, maxIterations, maxToolRetries = 2 } = config;
  const { supabase, projectId, taskId, versionId, bucket, basePath, nestingLevel, projectFilesContext } = context;
  
  const chatMessages: ChatMessage[] = [...messages];
  const generatedImages: string[] = [];
  const modifiedFiles: string[] = [];
  const toolRetryTrackers: Map<string, ToolRetryTracker> = new Map();
  
  let iteration = 0;
  let finalResponse = '';
  
  console.log(`[AgentLoop] 开始循环, 模型: ${model}, 最大迭代: ${maxIterations}, 最大工具重试: ${maxToolRetries}`);
  
  // 构建工具执行上下文
  const toolExecutionContext: ToolExecutionContext = {
    supabase,
    projectId,
    taskId,
    versionId,
    bucket,
    basePath,
    apiKey,
    nestingLevel,
    projectFilesContext
  };
  
  while (iteration < maxIterations) {
    iteration++;
    console.log(`[AgentLoop] 迭代 ${iteration}/${maxIterations}`);
    
    // 记录迭代开始事件
    await logIterationStart(supabase, taskId, projectId, iteration, maxIterations);
    
    // 通知进度：LLM 调用
    if (onProgress) {
      await onProgress({
        iteration,
        phase: 'llm_call',
        message: `Agent 执行中 (迭代 ${iteration})...`
      });
    }
    
    await writeBuildLog(supabase, projectId, 'info', `Agent 执行中 (迭代 ${iteration})...`);
    
    try {
      // 调用 LLM
      const assistantResponse = await callOpenRouterChatCompletionsApi(
        chatMessages, 
        apiKey, 
        model, 
        { tools, toolChoice }
      );
      
      // 检查是否有工具调用
      if (assistantResponse.tool_calls && assistantResponse.tool_calls.length > 0) {
        // 将助手消息添加到历史
        chatMessages.push(assistantResponse.rawMessage);
        
        // 逐个执行工具
        for (const toolCall of assistantResponse.tool_calls) {
          const toolName = toolCall.name;
          let args: Record<string, unknown>;
          
          try {
            args = JSON.parse(toolCall.arguments || '{}');
          } catch {
            args = {};
            console.error(`[AgentLoop] 解析工具参数失败: ${toolCall.arguments}`);
          }
          
          console.log(`[AgentLoop] 执行工具: ${toolName}`, args);
          
          // 通知进度：工具执行
          if (onProgress) {
            await onProgress({
              iteration,
              phase: 'tool_execution',
              toolName,
              message: `调用工具: ${toolName}`
            });
          }
          
          await writeBuildLog(supabase, projectId, 'info', `调用工具: ${toolName}`);
          
          // 记录工具开始事件
          await logToolStart(supabase, taskId, projectId, toolName, args);
          
          // 执行工具
          const startTime = Date.now();
          const toolResult: ToolExecutionResult = await executeToolCall(
            toolName, 
            args, 
            toolExecutionContext
          );
          const duration = Date.now() - startTime;
          
          // 处理工具执行结果
          if (!toolResult.success) {
            const errorMsg = typeof toolResult.result === 'object' && toolResult.result !== null
              ? (toolResult.result as { error?: string }).error || '未知错误'
              : '未知错误';
            await writeBuildLog(supabase, projectId, 'error', `工具执行失败 [${toolName}]: ${errorMsg}`);
            
            // 结构化错误处理
            const argsHash = hashArgs(args);
            const trackerKey = `${toolName}:${argsHash}`;
            const existingTracker = toolRetryTrackers.get(trackerKey);
            const structuredError = classifyToolError(toolName, errorMsg);
            
            // 更新重试跟踪器
            if (existingTracker) {
              existingTracker.attempts++;
              existingTracker.lastError = errorMsg;
            } else {
              toolRetryTrackers.set(trackerKey, {
                toolName,
                argsHash,
                attempts: 1,
                lastError: errorMsg
              });
            }
            
            const tracker = toolRetryTrackers.get(trackerKey);
            const canRetry = shouldRetryTool(tracker, structuredError, maxToolRetries);
            
            // 格式化结构化错误消息
            const structuredErrorMessage = formatStructuredError(structuredError, {
              attempts: tracker?.attempts || 1,
              maxRetries: maxToolRetries
            });
            
            console.log(`[AgentLoop] 工具错误: ${structuredError.errorType}, 可重试: ${canRetry}`);
            
            // 将结构化错误信息作为工具结果返回给 LLM
            toolResult.result = {
              success: false,
              error: errorMsg,
              structuredError: structuredErrorMessage,
              canRetry
            };
          }
          
          // 记录工具完成事件（包含执行时间）
          await logToolComplete(supabase, taskId, projectId, toolName, toolResult.result, toolResult.success, duration);
          
          // 收集副作用
          if (toolResult.sideEffects) {
            if (toolResult.sideEffects.generatedImages) {
              generatedImages.push(...toolResult.sideEffects.generatedImages);
            }
            if (toolResult.sideEffects.modifiedFiles) {
              modifiedFiles.push(...toolResult.sideEffects.modifiedFiles);
            }
          }
          
          // 检查 write_file 的修改文件
          if (toolName === 'write_file' && toolResult.success) {
            const resultObj = toolResult.result as { file_path?: string };
            if (resultObj.file_path) {
              modifiedFiles.push(resultObj.file_path);
            }
          }
          
          // 将工具结果添加到消息历史
          const toolOutput = JSON.stringify(toolResult.result);
          chatMessages.push({ 
            role: 'tool', 
            content: toolOutput, 
            tool_call_id: toolCall.id 
          });
        }
      } else {
        // 没有工具调用，返回最终响应
        // 注意：这里返回消息历史，以便 TaskRunner 可以使用流式调用生成最终响应
        finalResponse = assistantResponse.content || '';
        
        // 通知进度：完成
        if (onProgress) {
          await onProgress({
            iteration,
            phase: 'completed',
            message: '循环完成'
          });
        }
        
        console.log(`[AgentLoop] 循环完成，共 ${iteration} 次迭代`);
        
        // 返回结果，包含消息历史以支持流式输出
        // 如果 finalResponse 为空，说明需要流式生成最终响应
        return {
          success: true,
          finalResponse,
          iterations: iteration,
          generatedImages,
          modifiedFiles,
          messages: chatMessages,
          needsStreamingResponse: false
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[AgentLoop] 迭代 ${iteration} 出错:`, error);
      
      // 通知进度：错误
      if (onProgress) {
        await onProgress({
          iteration,
          phase: 'error',
          message: errorMessage
        });
      }
      
      return {
        success: false,
        finalResponse: '',
        iterations: iteration,
        generatedImages,
        modifiedFiles,
        error: errorMessage
      };
    }
  }
  
  // 达到最大迭代次数
  const errorMessage = `达到最大迭代次数 (${maxIterations})，循环终止`;
  console.error(`[AgentLoop] ${errorMessage}`);
  
  // 通知进度：错误
  if (onProgress) {
    await onProgress({
      iteration,
      phase: 'error',
      message: errorMessage
    });
  }
  
  return {
    success: false,
    finalResponse: '',
    iterations: iteration,
    generatedImages,
    modifiedFiles,
    error: errorMessage
  };
}
