/**
 * TaskRunner - 阶段化任务执行主干
 * 
 * 职责：
 * - 将任务执行流程收敛为可阅读的阶段管线
 * - 阶段：claim → load_context → assemble_prompt → agent_loop → final_response → write_result → cleanup
 * - agent_loop 阶段直接调用 runAgentLoop，不重复造轮子
 * 
 * 设计原则：
 * - 主干控制流只看 TaskRunner.run() 就能理解
 * - 职责清晰：每个阶段只做一件事
 * - 工具权限由 InteractionMode 决定
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import type {
  ChatMessage,
  InteractionMode,
  TaskPhase,
  TaskRunnerConfig,
  TaskRunnerContext,
  TaskPhaseResult,
  TaskRunnerResult,
  TaskType,
  WorkflowMode,
  PromptRouterContext
} from '../types.ts';
import { MODEL_CONFIG } from '../config.ts';
import { runAgentLoop, type AgentLoopConfig, type AgentLoopContext } from './agentLoop.ts';
import { getFilteredToolsByMode } from '../tools/definitions.ts';
import { assembleSystemPrompt } from '../prompts/assembler.ts';
import { writeBuildLog, writeAssistantMessage, updateTaskStatus } from '../logging/buildLog.ts';
import { logAgentEvent, logStageEnter, logStageExit } from '../logging/agentEvents.ts';
import { 
  callOpenRouterChatCompletionsApiStreaming,
  DEFAULT_STREAMING_CONFIG
} from '../llm/streamingClient.ts';

// --- TaskRunner 类 ---

export class TaskRunner {
  private supabase: ReturnType<typeof createClient>;
  private config: TaskRunnerConfig;
  private context: TaskRunnerContext;
  private phases: TaskPhaseResult[] = [];
  private currentPhase: TaskPhase = 'claim';
  
  // 阶段间共享的数据
  private chatMessages: ChatMessage[] = [];
  private systemPrompt: string = '';
  private fileContextStr: string = '';
  private loopResult: {
    success: boolean;
    finalResponse: string;
    iterations: number;
    generatedImages: string[];
    modifiedFiles: string[];
    error?: string;
    messages?: ChatMessage[];
    needsStreamingResponse?: boolean;
  } | null = null;
  
  // 流式输出相关
  private streamingMessageId: string | null = null;
  private useStreaming: boolean = true;
  private streamedResponse: string = '';

  constructor(
    supabase: ReturnType<typeof createClient>,
    config: TaskRunnerConfig,
    context: TaskRunnerContext
  ) {
    this.supabase = supabase;
    this.config = config;
    this.context = context;
  }

  /**
   * 运行任务 - 主入口
   * 按顺序执行所有阶段
   */
  async run(): Promise<TaskRunnerResult> {
    console.log(`[TaskRunner] 开始执行任务: ${this.context.taskId}, 模式: ${this.context.mode}`);
    
    try {
      // 阶段 1: claim - 任务已被外部 claimTask 抢占，这里只记录
      await this.executePhase('claim', async () => {
        await writeBuildLog(
          this.supabase, 
          this.context.projectId, 
          'info', 
          `开始处理 AI 任务 (模式: ${this.context.mode})`
        );
        await logAgentEvent(
          this.supabase, 
          this.context.taskId, 
          this.context.projectId, 
          'agent_phase', 
          { phase: 'claim', status: 'running', mode: this.context.mode }
        );
        return { claimed: true };
      });

      // 阶段 2: load_context - 加载上下文
      await this.executePhase('load_context', async () => {
        return await this.loadContext();
      });

      // 阶段 3: assemble_prompt - 组装提示词
      await this.executePhase('assemble_prompt', async () => {
        return await this.assemblePrompt();
      });

      // 阶段 4: agent_loop - 执行 Agent 循环
      await this.executePhase('agent_loop', async () => {
        return await this.runAgentLoopPhase();
      });

      // 阶段 5: final_response - 处理最终响应（当前为非流式）
      await this.executePhase('final_response', async () => {
        return await this.processFinalResponse();
      });

      // 阶段 6: write_result - 写入结果
      await this.executePhase('write_result', async () => {
        return await this.writeResult();
      });

      // 阶段 7: cleanup - 清理资源
      await this.executePhase('cleanup', async () => {
        return await this.cleanup();
      });

      return this.buildSuccessResult();
    } catch (error) {
      return this.buildErrorResult(error);
    }
  }

  /**
   * 执行单个阶段
   */
  private async executePhase(
    phase: TaskPhase, 
    executor: () => Promise<Record<string, unknown>>
  ): Promise<void> {
    this.currentPhase = phase;
    console.log(`[TaskRunner] 进入阶段: ${phase}`);
    
    try {
      const data = await executor();
      this.phases.push({
        phase,
        success: true,
        data
      });
      console.log(`[TaskRunner] 阶段完成: ${phase}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[TaskRunner] 阶段失败: ${phase}`, error);
      this.phases.push({
        phase,
        success: false,
        error: errorMessage
      });
      throw error;
    }
  }

  /**
   * 阶段 2: 加载上下文
   */
  private async loadContext(): Promise<Record<string, unknown>> {
    const { projectId, mode, payload } = this.context;
    
    await writeBuildLog(this.supabase, projectId, 'info', '正在加载上下文...');
    
    // 加载聊天历史
    const chatHistory = await this.fetchRecentChatMessages(10);
    
    // 加载文件上下文（仅 build 模式需要）
    if (mode === 'build') {
      await writeBuildLog(this.supabase, projectId, 'info', '正在读取项目文件...');
      this.fileContextStr = await this.getProjectFileContext();
    }
    
    // 根据模式构建消息
    this.chatMessages = this.buildChatMessages(chatHistory, payload);
    
    return {
      chatHistoryCount: chatHistory.length,
      hasFileContext: !!this.fileContextStr,
      messageCount: this.chatMessages.length
    };
  }

  /**
   * 阶段 3: 组装提示词
   */
  private async assemblePrompt(): Promise<Record<string, unknown>> {
    const { projectId, mode, payload } = this.context;
    
    await writeBuildLog(this.supabase, projectId, 'info', '正在加载提示词 (PromptRouter)...');
    
    // 将 InteractionMode 映射回旧的 TaskType 和 WorkflowMode（兼容现有 PromptRouter）
    const { taskType, workflowMode } = this.mapModeToLegacy(mode, payload);
    
    const routerContext: PromptRouterContext = {
      taskType,
      hasError: !!payload?.errorInfo,
      errorInfo: payload?.errorInfo as string | undefined,
      isNewProject: !this.fileContextStr || this.fileContextStr.length < 100,
      workflowMode
    };
    
    const fileContextSection = this.fileContextStr 
      ? `\n\n## 当前项目文件参考\n${this.fileContextStr}` 
      : '';
    
    this.systemPrompt = await assembleSystemPrompt(
      this.supabase, 
      routerContext, 
      fileContextSection
    );
    
    // 将系统提示词插入到消息列表开头
    this.chatMessages = [
      { role: 'system', content: this.systemPrompt },
      ...this.chatMessages.filter(m => m.role !== 'system')
    ];
    
    return {
      promptLength: this.systemPrompt.length,
      taskType,
      workflowMode
    };
  }

  /**
   * 阶段 4: 执行 Agent 循环
   */
  private async runAgentLoopPhase(): Promise<Record<string, unknown>> {
    const { projectId, taskId, mode, versionId, bucket, basePath, payload } = this.context;
    const { apiKey, maxIterations = 50 } = this.config;
    
    // 获取模型配置
    const { taskType } = this.mapModeToLegacy(mode, payload);
    const model = MODEL_CONFIG[taskType] || MODEL_CONFIG.default;
    
    await writeBuildLog(this.supabase, projectId, 'info', `开始 Agent 循环 (模型: ${model})`);
    
    // 构建 AgentLoop 配置 - 使用新的 InteractionMode 获取工具
    const agentLoopConfig: AgentLoopConfig = {
      model,
      apiKey,
      tools: getFilteredToolsByMode(mode),
      toolChoice: mode === 'chat' || mode === 'plan' ? 'auto' : 'required',
      maxIterations
    };
    
    // 构建 AgentLoop 上下文
    const agentLoopContext: AgentLoopContext = {
      supabase: this.supabase,
      projectId,
      taskId,
      versionId,
      bucket,
      basePath,
      nestingLevel: (payload?.nestingLevel as number) || 0,
      projectFilesContext: { bucket, path: basePath, versionId }
    };
    
    // 调用统一的 Agent 循环
    this.loopResult = await runAgentLoop(
      this.chatMessages, 
      agentLoopConfig, 
      agentLoopContext
    );
    
    if (!this.loopResult.success) {
      throw new Error(this.loopResult.error || 'Agent 循环执行失败');
    }
    
    return {
      iterations: this.loopResult.iterations,
      modifiedFilesCount: this.loopResult.modifiedFiles.length,
      generatedImagesCount: this.loopResult.generatedImages.length
    };
  }

  /**
   * 阶段 5: 处理最终响应
   * 
   * 设计原则：
   * - 流式输出失败 = 任务失败（不做非流式回退）
   * - 如果 agent_loop 已经返回了 finalResponse，直接使用
   * - 如果启用流式输出且有消息历史，使用流式调用生成最终响应
   */
  private async processFinalResponse(): Promise<Record<string, unknown>> {
    if (!this.loopResult) {
      throw new Error('Agent 循环结果不存在');
    }
    
    const { projectId, taskId, mode, payload } = this.context;
    const { apiKey } = this.config;
    const { taskType } = this.mapModeToLegacy(mode, payload);
    const model = MODEL_CONFIG[taskType] || MODEL_CONFIG.default;
    
    // 如果已经有 finalResponse，直接使用（agent_loop 已经生成了响应）
    if (this.loopResult.finalResponse) {
      this.streamedResponse = this.loopResult.finalResponse;
      console.log('[TaskRunner] 使用 agent_loop 生成的响应');
      return {
        responseLength: this.streamedResponse.length,
        hasContent: this.streamedResponse.length > 0,
        streaming: false
      };
    }
    
    // 如果没有消息历史，无法生成流式响应
    if (!this.loopResult.messages || this.loopResult.messages.length === 0) {
      throw new Error('没有消息历史，无法生成最终响应');
    }
    
    // 生成流式消息 ID
    this.streamingMessageId = crypto.randomUUID();
    
    await logStageEnter(this.supabase, taskId, projectId, 'final_response', '开始流式生成最终响应');
    await writeBuildLog(this.supabase, projectId, 'info', '正在生成最终响应 (流式)...');
    
    // 使用流式调用生成最终响应（禁止 tool_calls）
    const streamResult = await callOpenRouterChatCompletionsApiStreaming(
      this.loopResult.messages,
      apiKey,
      model,
      this.supabase,
      taskId,
      projectId,
      this.streamingMessageId,
      {
        onDelta: (delta, seq) => {
          console.log(`[TaskRunner] 流式 delta #${seq}: ${delta.length} 字符`);
        },
        onComplete: (fullContent) => {
          console.log(`[TaskRunner] 流式完成: ${fullContent.length} 字符`);
        },
        onError: (error) => {
          console.error('[TaskRunner] 流式错误:', error.message);
        }
      },
      DEFAULT_STREAMING_CONFIG
    );
    
    // 流式输出失败 = 任务失败（不做非流式回退）
    if (streamResult.error) {
      throw new Error(`流式响应生成失败: ${streamResult.error.message}`);
    }
    
    this.streamedResponse = streamResult.content;
    
    await logStageExit(this.supabase, taskId, projectId, 'final_response', '流式响应生成完成');
    
    return {
      responseLength: this.streamedResponse.length,
      hasContent: this.streamedResponse.length > 0,
      streaming: true,
      messageId: this.streamingMessageId
    };
  }

  /**
   * 阶段 6: 写入结果
   * 
   * 使用 streamedResponse（流式输出的结果）或 loopResult.finalResponse（非流式回退）
   */
  private async writeResult(): Promise<Record<string, unknown>> {
    const { projectId, taskId, mode, payload } = this.context;
    
    if (!this.loopResult) {
      throw new Error('Agent 循环结果不存在');
    }
    
    // 使用流式输出的结果，如果没有则使用 loopResult.finalResponse
    const finalResponse = this.streamedResponse || this.loopResult.finalResponse;
    
    const { taskType } = this.mapModeToLegacy(mode, payload);
    const model = MODEL_CONFIG[taskType] || MODEL_CONFIG.default;
    
    // 构建结果数据
    const resultData: Record<string, unknown> = {
      text: finalResponse,
      model,
      mode,
      processed_files: !!this.fileContextStr,
      generated_images: this.loopResult.generatedImages,
      modified_files: this.loopResult.modifiedFiles,
      iterations: this.loopResult.iterations,
      streaming: !!this.streamedResponse && this.streamedResponse !== this.loopResult.finalResponse
    };
    
    // 写入助手消息
    const messageId = await writeAssistantMessage(
      this.supabase, 
      projectId, 
      finalResponse
    );
    
    if (!messageId) {
      throw new Error('写入助手消息失败');
    }
    
    resultData.messageId = messageId;
    
    // 如果使用了流式输出，记录流式消息 ID
    if (this.streamingMessageId) {
      resultData.streamingMessageId = this.streamingMessageId;
    }
    
    // 更新任务状态
    await updateTaskStatus(this.supabase, taskId, 'completed', resultData);
    
    await writeBuildLog(
      this.supabase, 
      projectId, 
      'success', 
      `AI 任务处理完成 (${this.loopResult.iterations} 次迭代, ${this.loopResult.modifiedFiles.length} 个文件修改)`
    );
    
    return {
      messageId,
      status: 'completed',
      streaming: resultData.streaming
    };
  }

  /**
   * 阶段 7: 清理资源
   */
  private async cleanup(): Promise<Record<string, unknown>> {
    const { projectId, taskId } = this.context;
    
    await logAgentEvent(
      this.supabase, 
      taskId, 
      projectId, 
      'agent_phase', 
      { 
        phase: 'completed', 
        status: 'completed', 
        iterations: this.loopResult?.iterations,
        modifiedFilesCount: this.loopResult?.modifiedFiles.length,
        generatedImagesCount: this.loopResult?.generatedImages.length
      }
    );
    
    return { cleaned: true };
  }

  // --- 辅助方法 ---

  /**
   * 获取最近的聊天消息
   */
  private async fetchRecentChatMessages(limit = 10): Promise<{ role: string; content: string }[]> {
    const { data, error } = await this.supabase
      .from('chat_messages')
      .select('role, content')
      .eq('project_id', this.context.projectId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      throw new Error(`获取聊天记录失败: ${error.message}`);
    }
    
    return (data || []).reverse();
  }

  /**
   * 获取项目文件上下文
   */
  private async getProjectFileContext(): Promise<string> {
    const { bucket, basePath } = this.context;
    
    const { data: fileList, error: listError } = await this.supabase.storage
      .from(bucket)
      .list(basePath, { limit: 20, sortBy: { column: 'name', order: 'asc' } });
    
    if (listError) {
      console.error('获取项目文件列表失败:', listError);
      return '';
    }
    
    const textExtensions = ['.html', '.css', '.js', '.ts', '.tsx', '.jsx', '.json', '.md'];
    const filesToRead = (fileList || [])
      .filter(f => f.id && textExtensions.some(ext => f.name.endsWith(ext)))
      .slice(0, 5);
    
    const fileContents: string[] = [];
    for (const file of filesToRead) {
      const filePath = `${basePath}/${file.name}`.replace(/\/+/g, '/');
      const { data, error } = await this.supabase.storage.from(bucket).download(filePath);
      if (!error && data) {
        const content = await data.text();
        fileContents.push(`### ${file.name}\n\`\`\`\n${content.substring(0, 2000)}\n\`\`\``);
      }
    }
    
    return fileContents.join('\n\n');
  }

  /**
   * 构建聊天消息
   */
  private buildChatMessages(
    chatHistory: { role: string; content: string }[],
    payload?: Record<string, unknown>
  ): ChatMessage[] {
    const { mode } = this.context;
    
    // chat 和 plan 模式：直接使用聊天历史
    if (mode === 'chat' || mode === 'plan') {
      return chatHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));
    }
    
    // build 模式：构建结构化消息
    const requirement = (payload?.requirement as string) 
      || (payload?.content as string) 
      || '创建基础着陆页';
    
    const planSummary = payload?.planSummary as {
      requirement?: string;
      technicalPlan?: string;
      implementationSteps?: string[];
    } | undefined;
    
    let userMessage: string;
    
    if (planSummary && planSummary.technicalPlan) {
      const stepsText = planSummary.implementationSteps?.length
        ? `\n\n实施步骤：\n${planSummary.implementationSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
        : '';
      userMessage = `请帮我构建网站。

## 需求
${planSummary.requirement || requirement}

## 技术方案
${planSummary.technicalPlan}${stepsText}

请严格按照上述计划执行。`;
    } else if (chatHistory.length > 0) {
      const historyContext = chatHistory
        .map(msg => `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}`)
        .join('\n\n');
      userMessage = `请帮我构建网站。

## 对话上下文
${historyContext}

## 当前需求
${requirement}

请根据上述对话上下文和当前需求进行构建。`;
    } else {
      userMessage = `请帮我构建网站，需求如下：${requirement}`;
    }
    
    return [{ role: 'user', content: userMessage }];
  }

  /**
   * 将 InteractionMode 映射回旧的 TaskType 和 WorkflowMode
   * 用于兼容现有的 PromptRouter 和 MODEL_CONFIG
   */
  private mapModeToLegacy(
    mode: InteractionMode, 
    payload?: Record<string, unknown>
  ): { taskType: TaskType; workflowMode: WorkflowMode } {
    // 优先使用 payload 中的旧字段（兼容旧任务）
    if (payload?.type && typeof payload.type === 'string') {
      const taskType = payload.type as TaskType;
      const workflowMode = (payload.workflowMode as WorkflowMode) || 'default';
      return { taskType, workflowMode };
    }
    
    // 根据 InteractionMode 推断
    switch (mode) {
      case 'chat':
        return { taskType: 'chat_reply', workflowMode: 'default' };
      case 'plan':
        return { taskType: 'chat_reply', workflowMode: 'planning' };
      case 'build':
        return { taskType: 'build_site', workflowMode: 'build' };
      default:
        return { taskType: 'chat_reply', workflowMode: 'default' };
    }
  }

  /**
   * 构建成功结果
   */
  private buildSuccessResult(): TaskRunnerResult {
    // 使用流式输出的结果，如果没有则使用 loopResult.finalResponse
    const finalResponse = this.streamedResponse || this.loopResult?.finalResponse;
    
    return {
      success: true,
      taskId: this.context.taskId,
      phases: this.phases,
      finalResponse,
      modifiedFiles: this.loopResult?.modifiedFiles,
      generatedImages: this.loopResult?.generatedImages
    };
  }

  /**
   * 构建错误结果
   */
  private buildErrorResult(error: unknown): TaskRunnerResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return {
      success: false,
      taskId: this.context.taskId,
      phases: this.phases,
      error: errorMessage
    };
  }
}

// --- 导出工厂函数 ---

/**
 * 创建 TaskRunner 实例
 */
export function createTaskRunner(
  supabase: ReturnType<typeof createClient>,
  config: TaskRunnerConfig,
  context: TaskRunnerContext
): TaskRunner {
  return new TaskRunner(supabase, config, context);
}
