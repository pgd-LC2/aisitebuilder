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
  UseBuildLogsReturn
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
