/**
 * Realtime 事件类型定义
 */

import type { AITask, AITaskStatus, ChatMessage, ProjectFile, BuildLog } from '../types/project';

// ============================================
// Agent 事件流类型
// ============================================

export type AgentEventType =
  | 'task_created'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'message_created';

export interface AgentEventPayload {
  taskId?: string;
  messageId?: string;
  projectId: string;
  status?: AITaskStatus;
  result?: Record<string, unknown>;
  error?: string;
}

export interface AgentEvent {
  type: AgentEventType;
  timestamp: string;
  payload: AgentEventPayload;
}

export interface AgentState {
  currentTask: AITask | null;
  messages: ChatMessage[];
  isProcessing: boolean;
  lastError: string | null;
}

export type AgentAction =
  | { type: 'SET_MESSAGES'; payload: ChatMessage[] }
  | { type: 'APPEND_MESSAGE'; payload: ChatMessage }
  | { type: 'SET_CURRENT_TASK'; payload: AITask | null }
  | { type: 'TASK_UPDATED'; payload: AITask }
  | { type: 'TASK_COMPLETED'; payload: AITask }
  | { type: 'TASK_FAILED'; payload: { taskId: string; error: string } }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

// ============================================
// 文件事件流类型
// ============================================

export type FileEventType =
  | 'file_created'
  | 'file_updated'
  | 'file_deleted';

export interface FileEventPayload {
  fileId: string;
  projectId: string;
  filePath: string;
  fileName: string;
}

export interface FileEvent {
  type: FileEventType;
  timestamp: string;
  payload: FileEventPayload;
}

export interface FileState {
  files: ProjectFile[];
  lastUpdated: string | null;
}

export type FileAction =
  | { type: 'SET_FILES'; payload: ProjectFile[] }
  | { type: 'ADD_FILE'; payload: ProjectFile }
  | { type: 'UPDATE_FILE'; payload: ProjectFile }
  | { type: 'REMOVE_FILE'; payload: string };

// ============================================
// Activity Timeline 事件类型 (Bolt 风格)
// ============================================

export type TimelineEventType =
  | 'agent_phase'      // Agent 阶段变化（Planner/Coder/Reviewer/Debugger）
  | 'tool_call'        // 工具调用
  | 'file_update'      // 文件操作（create/update/delete/move）
  | 'self_repair'      // 自修复尝试
  | 'log'              // 通用日志
  | 'error';           // 错误事件

export type AgentPhase = 'planner' | 'coder' | 'reviewer' | 'debugger';

export type FileUpdateOp = 'create' | 'update' | 'delete' | 'move';

export interface BaseTimelineEvent {
  id: string;
  type: TimelineEventType;
  timestamp: string;
  taskId: string;
  projectId: string;
}

export interface AgentPhaseEvent extends BaseTimelineEvent {
  type: 'agent_phase';
  payload: {
    phase: AgentPhase;
    action: 'enter' | 'exit';
    summary?: string;
  };
}

export interface ToolCallEvent extends BaseTimelineEvent {
  type: 'tool_call';
  payload: {
    toolName: string;
    argsSummary?: string;
    resultSummary?: string;
    success: boolean;
    duration?: number;
    fromPath?: string;
    toPath?: string;
  };
}

export interface FileUpdateEvent extends BaseTimelineEvent {
  type: 'file_update';
  payload: {
    path: string;
    op: FileUpdateOp;
    summary?: string;
    fromPath?: string;
    toPath?: string;
    fileSize?: number;
    mimeType?: string;
  };
}

export interface SelfRepairEvent extends BaseTimelineEvent {
  type: 'self_repair';
  payload: {
    attemptNumber: number;
    maxAttempts: number;
    trigger: string;
    errorType?: string;
    errorMessage?: string;
    suggestion?: string;
    result: 'pending' | 'success' | 'failed';
  };
}

export interface LogEvent extends BaseTimelineEvent {
  type: 'log';
  payload: {
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    metadata?: Record<string, unknown>;
  };
}

export interface ErrorEvent extends BaseTimelineEvent {
  type: 'error';
  payload: {
    errorType: string;
    message: string;
    stack?: string;
    recoverable: boolean;
  };
}

export type TimelineEvent =
  | AgentPhaseEvent
  | ToolCallEvent
  | FileUpdateEvent
  | SelfRepairEvent
  | LogEvent
  | ErrorEvent;

// Timeline 状态
export interface TimelineState {
  events: TimelineEvent[];
  phases: AgentPhaseEvent[];
  tools: ToolCallEvent[];
  files: FileUpdateEvent[];
  repairs: SelfRepairEvent[];
  logs: LogEvent[];
  errors: ErrorEvent[];
  currentPhase: AgentPhase | null;
}

export type TimelineAction =
  | { type: 'ADD_EVENT'; payload: TimelineEvent }
  | { type: 'SET_EVENTS'; payload: TimelineEvent[] }
  | { type: 'CLEAR_EVENTS' }
  | { type: 'SET_CURRENT_PHASE'; payload: AgentPhase | null };

// Timeline Hook 选项和返回类型
export interface UseTimelineEventsOptions {
  projectId: string | undefined;
  taskId?: string;
  maxEvents?: number;
}

export interface UseTimelineEventsReturn {
  events: TimelineEvent[];
  phases: AgentPhaseEvent[];
  tools: ToolCallEvent[];
  files: FileUpdateEvent[];
  repairs: SelfRepairEvent[];
  logs: LogEvent[];
  errors: ErrorEvent[];
  currentPhase: AgentPhase | null;
  isConnected: boolean;
  addEvent: (event: TimelineEvent) => void;
  clearEvents: () => void;
}

// ============================================
// 构建日志事件流类型
// ============================================

export interface BuildLogEvent {
  type: 'log_created';
  timestamp: string;
  payload: BuildLog;
}

export interface BuildLogState {
  logs: BuildLog[];
}

export type BuildLogAction =
  | { type: 'SET_LOGS'; payload: BuildLog[] }
  | { type: 'APPEND_LOG'; payload: BuildLog }
  | { type: 'CLEAR_LOGS' };

// ============================================
// Realtime 客户端类型
// ============================================

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

export interface RealtimeSubscription {
  channelName: string;
  table: string;
  event: RealtimeEvent;
  filter?: string;
  unsubscribe: () => void;
}

export interface RealtimeClientConfig {
  onConnectionChange?: (connected: boolean) => void;
  onError?: (error: Error) => void;
  onChannelFailure?: (params: {
    channelName: string;
    table: string;
    event: RealtimeEvent;
    filter?: string;
    error: Error;
  }) => void;
}

export type RealtimeSubscribeStatus = 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR' | 'RETRYING' | 'TIMED_OUT' | string;

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ============================================
// 订阅选项类型
// ============================================

// 数据库 agent_events 表记录类型
export interface DbAgentEvent {
  id: string;
  task_id: string | null;
  project_id: string;
  type: 'agent_phase' | 'tool_call' | 'file_update' | 'self_repair' | 'log' | 'error';
  payload: Record<string, unknown>;
  created_at: string;
}

// 数据库 file_events 表记录类型
export interface DbFileEvent {
  id: string;
  project_id: string;
  path: string;
  op: 'create' | 'update' | 'delete' | 'move';
  summary: string | null;
  content_ref: string | null;
  version: string | null;
  from_path: string | null;
  created_at: string;
}

export interface SubscribeAgentEventsOptions {
  projectId: string;
  onTaskUpdate?: (task: AITask) => void;
  onMessageCreated?: (message: ChatMessage) => void;
  onAgentEvent?: (event: DbAgentEvent) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: RealtimeSubscribeStatus | undefined, error?: Error | null) => void;
}

export interface SubscribeFileEventsOptions {
  projectId: string;
  versionId?: string;
  onFileCreated?: (file: ProjectFile) => void;
  onFileUpdated?: (file: ProjectFile) => void;
  onFileDeleted?: (fileId: string) => void;
  onFileEvent?: (event: DbFileEvent) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: RealtimeSubscribeStatus | undefined, error?: Error | null) => void;
}

export interface SubscribeBuildLogsOptions {
  projectId: string;
  onLogCreated?: (log: BuildLog) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: RealtimeSubscribeStatus | undefined, error?: Error | null) => void;
}

// ============================================
// Hook 返回类型
// ============================================

export interface UseAgentEventsOptions {
  projectId: string | undefined;
  onTaskCompleted?: (task: AITask) => void;
  onMessageReceived?: (message: ChatMessage) => void;
}

export interface UseAgentEventsReturn {
  messages: ChatMessage[];
  currentTask: AITask | null;
  isProcessing: boolean;
  isConnected: boolean;
  lastError: string | null;
  appendMessage: (message: ChatMessage) => void;
  refreshMessages: () => Promise<void>;
  messageImages: Record<string, string[]>;
  imageBlobUrls: Record<string, string>;
}

export interface UseFileEventsOptions {
  projectId: string | undefined;
  versionId?: string;
}

export interface UseFileEventsReturn {
  files: ProjectFile[];
  isLoading: boolean;
  isConnected: boolean;
  refreshFiles: () => Promise<void>;
}

export interface UseBuildLogsOptions {
  projectId: string | undefined;
  onLogAdded?: (log: BuildLog) => void;
}

export interface UseBuildLogsReturn {
  logs: BuildLog[];
  isLoading: boolean;
  isConnected: boolean;
  appendLog: (log: BuildLog) => void;
  refreshLogs: () => Promise<void>;
}
