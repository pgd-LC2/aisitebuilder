/**
 * Refactor Code Subagent Handler
 * 负责执行代码重构任务
 */

import type { 
  SubagentContext, 
  SubagentTaskParams, 
  SubagentResult,
  SubagentConfig
} from '../types.ts';
import { registerSubagent } from '../registry.ts';
import { assembleSystemPrompt } from '../../prompts/assembler.ts';
import { callOpenRouterChatCompletionsApi } from '../../llm/client.ts';
import { executeToolCall } from '../../tools/executor.ts';
import { TOOLS } from '../../tools/definitions.ts';
import { writeBuildLog } from '../../logging/buildLog.ts';
import { handleReadFile } from '../../tools/fileOperations.ts';
import type { ChatMessage, PromptRouterContext } from '../../types.ts';
import { MODEL_CONFIG } from '../../config.ts';

// Refactor Code Subagent 配置
const REFACTOR_CODE_CONFIG: SubagentConfig = {
  type: 'refactor_code',
  name: '代码重构助手',
  description: '对指定文件或代码进行重构优化，提升代码质量和可维护性',
  maxNestingLevel: 1,
  promptLayers: ['core', 'coder', 'reviewer']
};

/**
 * Refactor Code Handler
 * 执行代码重构任务
 */
async function refactorCodeHandler(
  context: SubagentContext,
  params: SubagentTaskParams
): Promise<SubagentResult> {
  const startTime = Date.now();
  const { supabase, apiKey, projectId, toolContext } = context;
  const modifiedFiles: string[] = [];
  
  console.log(`[RefactorCodeSubagent] 开始执行代码重构任务`);
  await writeBuildLog(supabase, projectId, 'info', `[Subagent:RefactorCode] 开始重构任务: ${params.instruction.substring(0, 100)}`);
  
  try {
    // 构建 Prompt Router 上下文
    const routerContext: PromptRouterContext = {
      taskType: 'refactor_code',
      hasError: false,
      isNewProject: false
    };
    
    // 读取目标文件内容（如果指定了目标文件）
    let fileContextSection = '';
    if (params.targetFiles && params.targetFiles.length > 0) {
      const fileContents: string[] = [];
      for (const filePath of params.targetFiles) {
        const result = await handleReadFile(toolContext, { path: filePath });
        if (result.success && result.content) {
          fileContents.push(`### ${filePath}\n\`\`\`\n${result.content}\n\`\`\``);
        }
      }
      if (fileContents.length > 0) {
        fileContextSection = `\n\n## 需要重构的文件\n${fileContents.join('\n\n')}`;
      }
    }
    
    // 组装系统提示词
    const systemPrompt = await assembleSystemPrompt(supabase, routerContext, fileContextSection);
    
    // 构建用户消息
    const userMessage = params.targetFiles && params.targetFiles.length > 0
      ? `请重构以下文件: ${params.targetFiles.join(', ')}\n\n重构要求: ${params.instruction}`
      : `请执行以下代码重构任务: ${params.instruction}`;
    
    // 初始化对话消息
    const chatMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];
    
    // 获取模型配置
    const model = MODEL_CONFIG['refactor_code'] || MODEL_CONFIG.default;
    
    // 执行 Agent 循环
    let iteration = 0;
    const maxIterations = 10;
    let finalResponse = '';
    
    while (iteration < maxIterations) {
      iteration++;
      console.log(`[RefactorCodeSubagent] 迭代 ${iteration}`);
      await writeBuildLog(supabase, projectId, 'info', `[Subagent:RefactorCode] 执行中 (迭代 ${iteration})...`);
      
      const assistantResponse = await callOpenRouterChatCompletionsApi(
        chatMessages,
        apiKey,
        model,
        { tools: TOOLS, toolChoice: 'auto' }
      );
      
      if (assistantResponse.tool_calls && assistantResponse.tool_calls.length > 0) {
        chatMessages.push(assistantResponse.rawMessage);
        
        for (const toolCall of assistantResponse.tool_calls) {
          const toolName = toolCall.name;
          const args = JSON.parse(toolCall.arguments || '{}');
          
          console.log(`[RefactorCodeSubagent] 执行工具: ${toolName}`, args);
          await writeBuildLog(supabase, projectId, 'info', `[Subagent:RefactorCode] 调用工具: ${toolName}`);
          
          const { result } = await executeToolCall(toolName, args, toolContext);
          const toolResult = result as { success: boolean; file_path?: string; error?: string };
          
          // 记录修改的文件
          if (toolName === 'write_file' && toolResult.success && toolResult.file_path) {
            modifiedFiles.push(toolResult.file_path);
          }
          
          chatMessages.push({
            role: 'tool',
            content: JSON.stringify(result),
            tool_call_id: toolCall.id
          });
        }
      } else {
        finalResponse = assistantResponse.content || '';
        break;
      }
    }
    
    await writeBuildLog(
      supabase,
      projectId,
      'success',
      `[Subagent:RefactorCode] 重构完成 (${iteration} 次迭代, ${modifiedFiles.length} 个文件修改)`
    );
    
    return {
      success: true,
      type: 'refactor_code',
      output: finalResponse,
      modifiedFiles,
      executionTime: Date.now() - startTime
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[RefactorCodeSubagent] 执行失败:`, error);
    await writeBuildLog(supabase, projectId, 'error', `[Subagent:RefactorCode] 执行失败: ${errorMessage}`);
    
    return {
      success: false,
      type: 'refactor_code',
      output: '',
      modifiedFiles,
      error: errorMessage,
      executionTime: Date.now() - startTime
    };
  }
}

// 注册 Refactor Code Subagent
export function registerRefactorCodeSubagent(): void {
  registerSubagent(REFACTOR_CODE_CONFIG, refactorCodeHandler);
}

// 导出配置供外部使用
export { REFACTOR_CODE_CONFIG };
