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

/**
 * 关闭原因枚举
 * 用于区分「预期关闭」和「异常关闭」
 */
export type CloseReason =
  | 'CLEANUP'      // 由 cleanup() 主动触发的关闭
  | 'UNSUBSCRIBE'  // 由 unsubscribe() 主动触发的关闭
  | 'ERROR'        // 由网络错误、RLS 拒绝等异常触发的关闭
  | 'AUTH_CHANGE'  // 由认证状态变化触发的关闭
  | 'UNKNOWN';     // 未知原因

/**
 * 状态变化元数据
 * 包含 generation 和 closeReason 信息
 */
export interface StatusChangeMeta {
  /** 订阅创建时的会话世代 */
  generation: number;
  /** 关闭原因（仅在 CLOSED 状态时有值） */
  closeReason?: CloseReason;
  /** 频道名称 */
  channelName?: string;
  /** 是否是预期关闭 */
  isExpectedClose?: boolean;
}

/**
 * 扩展的状态变化回调类型
 */
export type StatusChangeCallback = (
  status: RealtimeSubscribeStatus | undefined,
  error: Error | null,
  meta?: StatusChangeMeta
) => void;

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

// Progress 事件 kind 类型（与后端 ProgressEventKind 对应）
export type ProgressEventKind =
  | 'stage_enter'      // 阶段进入
  | 'stage_exit'       // 阶段退出
  | 'iteration_start'  // 迭代开始
  | 'tool_start'       // 工具调用开始
  | 'tool_complete'    // 工具调用完成
  | 'thinking'         // AI 思考中
  | 'stream_delta'     // 流式输出增量
  | 'stream_complete'; // 流式输出完成

// 数据库 agent_events 表记录类型
export interface DbAgentEvent {
  id: string;
  task_id: string | null;
  project_id: string;
  type: 'agent_phase' | 'tool_call' | 'file_update' | 'self_repair' | 'log' | 'error' | 'progress';
  payload: DbAgentEventPayload;
  created_at: string;
}

// agent_events payload 类型
export interface DbAgentEventPayload {
  kind?: ProgressEventKind;
  stage?: string;
  iteration?: number;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  success?: boolean;
  duration?: number;
  delta?: string;
  content?: string;
  messageId?: string;
  totalLength?: number;
  [key: string]: unknown;
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
  onStatusChange?: StatusChangeCallback;
}

export interface SubscribeFileEventsOptions {
  projectId: string;
  versionId?: string;
  onFileCreated?: (file: ProjectFile) => void;
  onFileUpdated?: (file: ProjectFile) => void;
  onFileDeleted?: (fileId: string) => void;
  onFileEvent?: (event: DbFileEvent) => void;
  onError?: (error: Error) => void;
  onStatusChange?: StatusChangeCallback;
}

export interface SubscribeBuildLogsOptions {
  projectId: string;
  onLogCreated?: (log: BuildLog) => void;
  onError?: (error: Error) => void;
  onStatusChange?: StatusChangeCallback;
}

// ============================================
// Hook 返回类型
// ============================================

export interface UseAgentEventsOptions {
  projectId: string | undefined;
  onTaskCompleted?: (task: AITask) => void;
  onMessageReceived?: (message: ChatMessage) => void;
  /** 流式输出增量回调 */
  onStreamDelta?: (delta: string, messageId: string) => void;
  /** 流式输出完成回调 */
  onStreamComplete?: (content: string, messageId: string) => void;
}

/** 流式消息状态 */
export interface StreamingMessage {
  messageId: string;
  content: string;
  isComplete: boolean;
  startedAt: number;
  updatedAt: number;
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
  /** 当前流式消息（用于实时显示 token 级输出） */
  streamingMessage: StreamingMessage | null;
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

// ============================================
// RealtimeContext 类型
// ============================================

/**
 * Realtime 上下文状态
 */
export interface RealtimeContextState {
  /** 当前会话世代，每次 cleanup/reset 时递增 */
  sessionGeneration: number;
  /** 全局连接状态 */
  connectionStatus: ConnectionStatus;
  /** 认证是否就绪 */
  authReady: boolean;
  /** 认证版本号 */
  authVersion: number;
  /** 是否正在进行预期关闭（cleanup/auth change） */
  isExpectedClose: boolean;
}

/**
 * Realtime 上下文值
 */
export interface RealtimeContextValue extends RealtimeContextState {
  /** 递增会话世代 */
  incrementGeneration: () => number;
  /** 标记开始预期关闭 */
  markExpectedClose: () => void;
  /** 清除预期关闭标记 */
  clearExpectedClose: () => void;
  /** 检查给定 generation 是否仍然有效 */
  isGenerationValid: (generation: number) => boolean;
  /** 获取当前 generation */
  getCurrentGeneration: () => number;
}

// ============================================
// useRealtimeResource 通用 Hook 类型
// ============================================

/**
 * Realtime 资源配置
 */
export interface RealtimeResourceConfig<T> {
  /** 资源唯一标识，用于日志和调试 */
  resourceKey: string;
  /** 项目 ID */
  projectId: string | undefined;
  /** 获取初始快照 */
  fetchSnapshot: () => Promise<T[]>;
  /** 建立增量订阅，返回取消订阅函数 */
  subscribeIncrements: (handlers: {
    onInsert?: (item: T) => void;
    onUpdate?: (item: T) => void;
    onDelete?: (id: string) => void;
    onStatusChange?: StatusChangeCallback;
  }) => () => void;
  /** 获取项目的唯一标识 */
  getItemId: (item: T) => string;
  /** 是否启用（默认 true） */
  enabled?: boolean;
  /** 刷新节流时间（毫秒，默认 1000） */
  refreshThrottleMs?: number;
  /** 依赖项，变化时重新订阅 */
  deps?: unknown[];
}

/**
 * Realtime 资源状态
 */
export interface RealtimeResourceState<T> {
  /** 数据列表 */
  data: T[];
  /** 是否正在加载 */
  isLoading: boolean;
  /** 是否已连接 */
  isConnected: boolean;
  /** 错误信息 */
  error: string | null;
  /** 当前订阅的 generation */
  generation: number;
}

/**
 * Realtime 资源返回值
 */
export interface RealtimeResourceReturn<T> extends RealtimeResourceState<T> {
  /** 刷新数据 */
  refresh: (options?: { priority?: 'normal' | 'high' }) => Promise<void>;
  /** 追加单个项目 */
  appendItem: (item: T) => void;
  /** 更新单个项目 */
  updateItem: (item: T) => void;
  /** 删除单个项目 */
  removeItem: (id: string) => void;
  /** 设置完整数据 */
  setData: (data: T[]) => void;
}
