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
import { logAgentEvent } from '../logging/agentEvents.ts';

// --- AgentLoop 类型定义 ---

/**
 * AgentLoop 配置
 */
export interface AgentLoopConfig {
  model: string;
  apiKey: string;
  tools: ToolDefinition[];
  toolChoice: 'auto' | 'required' | 'none';
  maxIterations: number;
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
  const { model, apiKey, tools, toolChoice, maxIterations } = config;
  const { supabase, projectId, taskId, versionId, bucket, basePath, nestingLevel, projectFilesContext } = context;
  
  const chatMessages: ChatMessage[] = [...messages];
  const generatedImages: string[] = [];
  const modifiedFiles: string[] = [];
  
  let iteration = 0;
  let finalResponse = '';
  
  console.log(`[AgentLoop] 开始循环, 模型: ${model}, 最大迭代: ${maxIterations}`);
  
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
          await logAgentEvent(supabase, taskId, projectId, 'tool_call', { 
            toolName, 
            toolArgs: args, 
            status: 'started' 
          });
          
          // 执行工具
          const toolResult: ToolExecutionResult = await executeToolCall(
            toolName, 
            args, 
            toolExecutionContext
          );
          
          // 处理工具执行结果
          if (!toolResult.success) {
            const errorMsg = typeof toolResult.result === 'object' && toolResult.result !== null
              ? (toolResult.result as { error?: string }).error || '未知错误'
              : '未知错误';
            await writeBuildLog(supabase, projectId, 'error', `工具执行失败 [${toolName}]: ${errorMsg}`);
            await logAgentEvent(supabase, taskId, projectId, 'tool_call', { 
              toolName, 
              toolArgs: args, 
              status: 'failed', 
              error: errorMsg 
            });
          }
          
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
        
        return {
          success: true,
          finalResponse,
          iterations: iteration,
          generatedImages,
          modifiedFiles
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
