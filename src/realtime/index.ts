/**
 * Realtime 模块入口
 * 
 * 统一导出所有 Realtime 相关功能。
 * 所有组件应通过此模块访问 Realtime 功能，禁止直接使用 supabase.channel()。
 */

// 类型导出
export type {
  AgentEventType,
  AgentEventPayload,
  AgentEvent,
  AgentState,
  AgentAction,
  FileEventType,
  FileEventPayload,
  FileEvent,
  FileState,
  FileAction,
  // Timeline 类型 (Bolt 风格)
  TimelineEventType,
  BaseTimelineEvent,
  AgentPhaseEvent,
  ToolCallEvent,
  FileUpdateEvent,
  SelfRepairEvent,
  LogEvent,
  ErrorEvent,
  TimelineEvent,
  TimelineState,
  TimelineAction,
  AgentPhase,
  FileUpdateOp,
  UseTimelineEventsOptions,
  UseTimelineEventsReturn,
  BuildLogEvent,
  BuildLogState,
  BuildLogAction,
  RealtimeEvent,
  RealtimeSubscription,
  RealtimeClientConfig,
  ConnectionStatus,
  SubscribeAgentEventsOptions,
  SubscribeFileEventsOptions,
  SubscribeBuildLogsOptions,
  UseAgentEventsOptions,
  UseAgentEventsReturn,
  UseFileEventsOptions,
  UseFileEventsReturn,
  UseBuildLogsOptions,
  UseBuildLogsReturn,
  // Generation 和 CloseReason 相关类型
  CloseReason,
  StatusChangeMeta,
  StatusChangeCallback,
  RealtimeContextState,
  RealtimeContextValue,
  RealtimeResourceConfig,
  RealtimeResourceReturn
} from './types';

// 客户端导出
export {
  getRealtimeClient,
  subscribeToTable,
  cleanupRealtime,
  isRealtimeConnected
} from './realtimeClient';

// 订阅函数导出
export { subscribeAgentEvents } from './subscribeAgentEvents';
export { subscribeBuildLogs } from './subscribeBuildLogs';
export { subscribeFileEvents } from './subscribeFileEvents';

// Hooks 导出
export { useAgentEvents } from './hooks/useAgentEvents';
export { useBuildLogs } from './hooks/useBuildLogs';
export { useFileEvents } from './hooks/useFileEvents';
export { useTimelineEvents } from './hooks/useTimelineEvents';
export { useRealtimeResource } from './hooks/useRealtimeResource';
