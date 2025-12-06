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

export type TaskType = 'chat_reply' | 'build_site' | 'refactor_code' | 'debug';
export type PromptLayer = 'core' | 'planner' | 'coder' | 'reviewer' | 'debugger';
export type WorkflowMode = 'default' | 'planning' | 'build';

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
