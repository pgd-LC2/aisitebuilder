/**
 * useTimelineEvents Hook
 * 
 * 提供 Activity Timeline 事件的实时订阅和状态管理功能。
 * 支持 Bolt 风格的 Agent 行为流展示。
 * 
 * Step 3: 新增 agent_events 表订阅，支持实时 Activity Timeline 更新。
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { subscribeAgentEvents } from '../subscribeAgentEvents';
import type {
  TimelineEvent,
  TimelineState,
  TimelineAction,
  AgentPhaseEvent,
  ToolCallEvent,
  FileUpdateEvent,
  LogEvent,
  ErrorEvent,
  AgentPhase,
  UseTimelineEventsOptions,
  UseTimelineEventsReturn,
  DbAgentEvent,
} from '../types';

const MAX_EVENTS_DEFAULT = 100;

const initialState: TimelineState = {
  events: [],
  phases: [],
  tools: [],
  files: [],
  logs: [],
  errors: [],
  currentPhase: null,
};

function timelineReducer(state: TimelineState, action: TimelineAction): TimelineState {
  switch (action.type) {
    case 'ADD_EVENT': {
      const event = action.payload;
      const newEvents = [...state.events, event].slice(-MAX_EVENTS_DEFAULT);
      
      const newState: TimelineState = {
        ...state,
        events: newEvents,
      };

      switch (event.type) {
        case 'agent_phase':
          newState.phases = [...state.phases, event as AgentPhaseEvent].slice(-MAX_EVENTS_DEFAULT);
          if ((event as AgentPhaseEvent).payload.action === 'enter') {
            newState.currentPhase = (event as AgentPhaseEvent).payload.phase;
          } else if ((event as AgentPhaseEvent).payload.action === 'exit') {
            newState.currentPhase = null;
          }
          break;
        case 'tool_call':
          newState.tools = [...state.tools, event as ToolCallEvent].slice(-MAX_EVENTS_DEFAULT);
          break;
        case 'file_update':
          newState.files = [...state.files, event as FileUpdateEvent].slice(-MAX_EVENTS_DEFAULT);
          break;
        case 'log':
          newState.logs = [...state.logs, event as LogEvent].slice(-MAX_EVENTS_DEFAULT);
          break;
        case 'error':
          newState.errors = [...state.errors, event as ErrorEvent].slice(-MAX_EVENTS_DEFAULT);
          break;
      }

      return newState;
    }

    case 'SET_EVENTS': {
      const events = action.payload.slice(-MAX_EVENTS_DEFAULT);
      return {
        events,
        phases: events.filter((e): e is AgentPhaseEvent => e.type === 'agent_phase'),
        tools: events.filter((e): e is ToolCallEvent => e.type === 'tool_call'),
        files: events.filter((e): e is FileUpdateEvent => e.type === 'file_update'),
        logs: events.filter((e): e is LogEvent => e.type === 'log'),
        errors: events.filter((e): e is ErrorEvent => e.type === 'error'),
        currentPhase: findCurrentPhase(events),
      };
    }

    case 'CLEAR_EVENTS':
      return initialState;

    case 'SET_CURRENT_PHASE':
      return { ...state, currentPhase: action.payload };

    default:
      return state;
  }
}

function findCurrentPhase(events: TimelineEvent[]): AgentPhase | null {
  const phaseEvents = events.filter((e): e is AgentPhaseEvent => e.type === 'agent_phase');
  for (let i = phaseEvents.length - 1; i >= 0; i--) {
    if (phaseEvents[i].payload.action === 'enter') {
      return phaseEvents[i].payload.phase;
    }
  }
  return null;
}

// parseBuildLogToTimelineEvent 函数已移除
// build_logs 订阅现在由 useBuildLogs hook 独立处理，避免重复订阅
// Timeline 组件现在只依赖 agent_events 表的结构化事件

/**
 * Step 3: 将 DbAgentEvent 转换为 TimelineEvent
 * 
 * 从 agent_events 表接收的事件转换为前端 Timeline 组件使用的格式
 */
function parseDbAgentEventToTimelineEvent(dbEvent: DbAgentEvent): TimelineEvent {
  const { id, task_id, project_id, type, payload, created_at } = dbEvent;
  const taskId = task_id || '';
  const timestamp = created_at;

  switch (type) {
    case 'agent_phase': {
      const phase = (payload.phase as string)?.toLowerCase() as AgentPhase || 'coder';
      const status = payload.status as string;
      const action = status === 'running' || status === 'started' ? 'enter' : 'exit';
      
      return {
        id,
        type: 'agent_phase',
        timestamp,
        taskId,
        projectId: project_id,
        payload: {
          phase,
          action,
          summary: payload.taskType as string || '',
        },
      };
    }

    case 'tool_call': {
      const toolName = payload.toolName as string || 'unknown';
      const status = payload.status as string;
      const success = status !== 'failed' && status !== 'error';
      
      return {
        id,
        type: 'tool_call',
        timestamp,
        taskId,
        projectId: project_id,
        payload: {
          toolName,
          argsSummary: JSON.stringify(payload.toolArgs || {}),
          resultSummary: payload.result as string,
          success,
        },
      };
    }

    case 'file_update': {
      const path = payload.path as string || '';
      const op = (payload.op as string || 'update') as 'create' | 'update' | 'delete' | 'move';
      
      return {
        id,
        type: 'file_update',
        timestamp,
        taskId,
        projectId: project_id,
        payload: {
          path,
          op,
          summary: payload.summary as string,
          fromPath: payload.fromPath as string,
        },
      };
    }

    case 'error': {
      return {
        id,
        type: 'error',
        timestamp,
        taskId,
        projectId: project_id,
        payload: {
          errorType: payload.errorType as string || 'unknown',
          message: payload.errorMessage as string || 'Unknown error',
          stack: payload.stack as string,
          recoverable: (payload.recoverable as boolean) ?? true,
        },
      };
    }

    case 'log':
    default: {
      return {
        id,
        type: 'log',
        timestamp,
        taskId,
        projectId: project_id,
        payload: {
          level: (payload.level as 'info' | 'warn' | 'error' | 'debug') || 'info',
          message: payload.message as string || JSON.stringify(payload),
          metadata: payload,
        },
      };
    }
  }
}

export function useTimelineEvents(options: UseTimelineEventsOptions): UseTimelineEventsReturn {
  const { projectId, maxEvents = MAX_EVENTS_DEFAULT } = options;
  
  const [state, dispatch] = useReducer(timelineReducer, initialState);
  const [isConnected, setIsConnected] = useState(false);
  
  const processedLogIdsRef = useRef<Set<string>>(new Set());

  const addEvent = useCallback((event: TimelineEvent) => {
    dispatch({ type: 'ADD_EVENT', payload: event });
  }, []);

  const clearEvents = useCallback(() => {
    dispatch({ type: 'CLEAR_EVENTS' });
    processedLogIdsRef.current.clear();
  }, []);

  useEffect(() => {
    if (!projectId) {
      dispatch({ type: 'CLEAR_EVENTS' });
      setIsConnected(false);
      return;
    }

    console.log('[useTimelineEvents] 设置订阅, projectId:', projectId);

    // Step 3: 只订阅 agent_events 表（新的结构化事件）
    // 注意：build_logs 订阅已移至 useBuildLogs hook，避免重复订阅导致频道冲突
    const unsubscribeAgentEvents = subscribeAgentEvents({
      projectId,
      onAgentEvent: (dbEvent: DbAgentEvent) => {
        // 避免重复处理
        if (processedLogIdsRef.current.has(dbEvent.id)) {
          return;
        }
        processedLogIdsRef.current.add(dbEvent.id);

        const event = parseDbAgentEventToTimelineEvent(dbEvent);
        dispatch({ type: 'ADD_EVENT', payload: event });
      },
      onError: (error) => {
        console.error('[useTimelineEvents] agent_events 订阅错误:', error);
      },
    });

    setIsConnected(true);

    return () => {
      console.log('[useTimelineEvents] 清理订阅, projectId:', projectId);
      unsubscribeAgentEvents();
      setIsConnected(false);
    };
  }, [projectId]);

  const limitedEvents = state.events.slice(-maxEvents);
  const limitedPhases = state.phases.slice(-maxEvents);
  const limitedTools = state.tools.slice(-maxEvents);
  const limitedFiles = state.files.slice(-maxEvents);
  const limitedLogs = state.logs.slice(-maxEvents);
  const limitedErrors = state.errors.slice(-maxEvents);

  return {
    events: limitedEvents,
    phases: limitedPhases,
    tools: limitedTools,
    files: limitedFiles,
    logs: limitedLogs,
    errors: limitedErrors,
    currentPhase: state.currentPhase,
    isConnected,
    addEvent,
    clearEvents,
  };
}

export default useTimelineEvents;
