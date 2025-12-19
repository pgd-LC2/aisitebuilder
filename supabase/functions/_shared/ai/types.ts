/**
 * AI 模块类型定义
 * 包含所有共享的接口和类型
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

// --- 自我修复循环类型定义 ---

export interface ErrorContext {
  errorType: string;
  errorMessage: string;
  errorStack?: string;
  failedCommand?: string;
  failedOutput?: string;
  recentFileChanges: string[];
  projectStructure?: string;
}

export interface FileModification {
  path: string;
  action: 'create' | 'modify' | 'delete';
  content?: string;
}

export interface DebuggerSuggestion {
  rootCause: string;
  errorCategory: string;
  fileModifications: FileModification[];
  verificationCommands: string[];
}

export interface VerificationResult {
  command: string;
  success: boolean;
  output: string;
}

export interface RepairAttempt {
  attemptNumber: number;
  errorContext: ErrorContext;
  debuggerResponse?: DebuggerSuggestion;
  repairApplied: boolean;
  verificationResult?: VerificationResult;
  timestamp: string;
}

export interface SelfRepairLoopResult {
  status: 'completed' | 'recovered' | 'failed_after_repair' | 'failed';
  totalAttempts: number;
  repairHistory: RepairAttempt[];
  finalError?: string;
}

// --- 工具上下文类型 ---

export interface ToolContext {
  supabase: ReturnType<typeof createClient>;
  projectId: string;
  versionId: string;
  bucket: string;
  basePath: string;
}

// --- Chat Completions API 类型 ---

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
    [key: string]: unknown;
  }>;
  tool_call_id?: string;
  reasoning?: string;
  reasoning_details?: unknown;
  refusal?: unknown;
  [key: string]: unknown;
}

export interface CallOpenRouterOptions {
  tools?: ToolDefinition[] | null;
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

export interface ParsedChatCompletionOutput {
  content: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  rawMessage: ChatMessage;
}

// --- Prompt Router 类型 ---

/**
 * @deprecated 使用 InteractionMode 替代 TaskType × WorkflowMode 双维度
 * 保留用于向后兼容，将在未来版本移除
 */
export type TaskType = 'chat_reply' | 'build_site' | 'refactor_code' | 'debug';

// 'chat' 层级专用于 chat_reply 任务，提供只读分析能力，不包含文件修改工具
export type PromptLayer = 'core' | 'planner' | 'coder' | 'reviewer' | 'debugger' | 'chat';

/**
 * @deprecated 使用 InteractionMode 替代 TaskType × WorkflowMode 双维度
 * 保留用于向后兼容，将在未来版本移除
 */
export type WorkflowMode = 'default' | 'planning' | 'build';

/**
 * 统一交互模式 - 替代 TaskType × WorkflowMode 双维度
 * 
 * | 模式   | 工具权限     | 用途                           |
 * |--------|-------------|--------------------------------|
 * | chat   | 只读工具     | 对话、问答、代码分析            |
 * | plan   | 只读工具     | 需求澄清、方案规划              |
 * | build  | 完整工具集   | 代码生成、文件修改、构建        |
 */
export type InteractionMode = 'chat' | 'plan' | 'build';

export interface PromptRouterContext {
  taskType: TaskType;
  hasError?: boolean;
  errorInfo?: string;
  isNewProject?: boolean;
  workflowMode?: WorkflowMode;
}

// --- 工具定义类型 ---

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
      required: string[];
    };
  };
}

// --- 文件操作结果类型 ---

export interface FileOperationResult {
  success: boolean;
  error?: string;
}

export interface ListFilesResult extends FileOperationResult {
  files?: Array<{ name: string; type: string; size?: number }>;
}

export interface ReadFileResult extends FileOperationResult {
  content?: string;
}

export interface WriteFileResult extends FileOperationResult {
  file_path?: string;
}

export interface SearchFilesResult extends FileOperationResult {
  results?: Array<{ file: string; matches: string[] }>;
}

export interface FileTreeNode {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileTreeNode[];
}

export interface GetProjectStructureResult extends FileOperationResult {
  structure?: FileTreeNode[];
}

export interface MoveFileResult {
  success: boolean;
  message?: string;
}

// --- Agent 事件类型 ---

export type AgentEventType = 'agent_phase' | 'tool_call' | 'file_update' | 'self_repair' | 'log' | 'error';

export interface AgentEventPayload {
  phase?: string;
  status?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  filePath?: string;
  operation?: string;
  attemptNumber?: number;
  errorType?: string;
  errorMessage?: string;
  debuggerResponse?: unknown;
  message?: string;
  level?: string;
  [key: string]: unknown;
}

// --- 文件事件类型 ---

export type FileEventOp = 'create' | 'update' | 'delete' | 'move';

// --- 任务类型 ---

export interface AITask {
  id: string;
  type: string;
  project_id: string;
  payload?: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

// --- 项目文件上下文类型 ---

export interface ProjectFilesContext {
  bucket: string;
  path: string;
  versionId?: string;
}

// --- Prompt 错误类型 ---

export type PromptFetchErrorType = 'NOT_FOUND' | 'PERMISSION' | 'NETWORK_ERROR' | 'QUERY_ERROR';

// --- TaskRunner 类型定义 ---

/**
 * TaskRunner 执行阶段
 * 阶段按顺序执行：claim → load_context → assemble_prompt → agent_loop → final_response → write_result → cleanup
 */
export type TaskPhase = 
  | 'claim'           // 抢占任务
  | 'load_context'    // 加载上下文（聊天历史、文件内容等）
  | 'assemble_prompt' // 组装系统提示词
  | 'agent_loop'      // 执行 Agent 循环（调用 runAgentLoop）
  | 'final_response'  // 生成最终响应（非流式）
  | 'write_result'    // 写入结果（消息、任务状态）
  | 'cleanup';        // 清理资源

/**
 * TaskRunner 配置
 */
export interface TaskRunnerConfig {
  apiKey: string;
  maxIterations?: number;
}

/**
 * TaskRunner 上下文 - 贯穿整个任务执行过程
 */
export interface TaskRunnerContext {
  taskId: string;
  projectId: string;
  mode: InteractionMode;
  versionId: string;
  bucket: string;
  basePath: string;
  payload?: Record<string, unknown>;
}

/**
 * TaskRunner 阶段结果
 */
export interface TaskPhaseResult {
  phase: TaskPhase;
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

/**
 * TaskRunner 最终结果
 */
export interface TaskRunnerResult {
  success: boolean;
  taskId: string;
  phases: TaskPhaseResult[];
  finalResponse?: string;
  modifiedFiles?: string[];
  generatedImages?: string[];
  error?: string;
}

/**
 * 从旧的 TaskType + WorkflowMode 映射到新的 InteractionMode
 * 
 * 映射规则：
 * - chat_reply + default → 'chat'
 * - chat_reply + planning → 'plan'
 * - chat_reply + build → 'build'
 * - build_site + * → 'build'
 * - refactor_code + * → 'build'
 * - debug + * → 'build'
 */
export function mapToInteractionMode(
  taskType?: TaskType,
  workflowMode?: WorkflowMode
): InteractionMode {
  // 如果没有任务类型，默认为 chat
  if (!taskType) return 'chat';
  
  // build_site、refactor_code、debug 始终是 build 模式
  if (taskType === 'build_site' || taskType === 'refactor_code' || taskType === 'debug') {
    return 'build';
  }
  
  // chat_reply 根据 workflowMode 决定
  if (taskType === 'chat_reply') {
    if (workflowMode === 'build') return 'build';
    if (workflowMode === 'planning') return 'plan';
    return 'chat';
  }
  
  // 默认返回 chat
  return 'chat';
}
