/**
 * useTimelineEvents Hook
 * 
 * 提供 Activity Timeline 事件的实时订阅和状态管理功能。
 * 支持 Bolt 风格的 Agent 行为流展示。
 * 
 * Step 3: 新增 agent_events 表订阅，支持实时 Activity Timeline 更新。
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { BuildLog } from '../../types/project';
import { subscribeBuildLogs } from '../subscribeBuildLogs';
import { subscribeAgentEvents } from '../subscribeAgentEvents';
import type {
  TimelineEvent,
  TimelineState,
  TimelineAction,
  AgentPhaseEvent,
  ToolCallEvent,
  FileUpdateEvent,
  SelfRepairEvent,
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
  repairs: [],
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
        case 'self_repair':
          newState.repairs = [...state.repairs, event as SelfRepairEvent].slice(-MAX_EVENTS_DEFAULT);
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
        repairs: events.filter((e): e is SelfRepairEvent => e.type === 'self_repair'),
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

function parseBuildLogToTimelineEvent(log: BuildLog, projectId: string): TimelineEvent | null {
  const message = log.message;
  const timestamp = log.created_at;
  const id = log.id;
  const taskId = (log.metadata?.taskId as string) || '';

  if (message.includes('[SelfRepairLoop]')) {
    const attemptMatch = message.match(/Attempt (\d+)\/(\d+)/);
    const attemptNumber = attemptMatch ? parseInt(attemptMatch[1], 10) : 1;
    const maxAttempts = attemptMatch ? parseInt(attemptMatch[2], 10) : 3;
    
    let result: 'pending' | 'success' | 'failed' = 'pending';
    if (message.includes('成功') || message.includes('success')) {
      result = 'success';
    } else if (message.includes('失败') || message.includes('failed')) {
      result = 'failed';
    }

    return {
      id,
      type: 'self_repair',
      timestamp,
      taskId,
      projectId,
      payload: {
        attemptNumber,
        maxAttempts,
        trigger: message,
        result,
      },
    };
  }

  if (message.includes('[move]') || message.includes('[rename]') || message.includes('移动文件')) {
    const pathMatch = message.match(/(?:from\s+)?([^\s→]+)\s*(?:→|to)\s*([^\s]+)/i);
    const fromPath = pathMatch ? pathMatch[1] : '';
    const toPath = pathMatch ? pathMatch[2] : '';

    return {
      id,
      type: 'file_update',
      timestamp,
      taskId,
      projectId,
      payload: {
        path: toPath,
        op: 'move',
        fromPath,
        toPath,
        summary: message,
      },
    };
  }

  if (message.includes('write_file') || message.includes('写入文件') || message.includes('创建文件')) {
    const pathMatch = message.match(/(?:path|文件)[:\s]*([^\s,]+)/i);
    const path = pathMatch ? pathMatch[1] : '';
    const isCreate = message.includes('创建') || message.includes('create');

    return {
      id,
      type: 'file_update',
      timestamp,
      taskId,
      projectId,
      payload: {
        path,
        op: isCreate ? 'create' : 'update',
        summary: message,
      },
    };
  }

  if (message.includes('delete_file') || message.includes('删除文件')) {
    const pathMatch = message.match(/(?:path|文件)[:\s]*([^\s,]+)/i);
    const path = pathMatch ? pathMatch[1] : '';

    return {
      id,
      type: 'file_update',
      timestamp,
      taskId,
      projectId,
      payload: {
        path,
        op: 'delete',
        summary: message,
      },
    };
  }

  if (message.includes('move_file')) {
    const fromMatch = message.match(/fromPath[:\s]*([^\s,]+)/i);
    const toMatch = message.match(/toPath[:\s]*([^\s,]+)/i);
    const fromPath = fromMatch ? fromMatch[1] : '';
    const toPath = toMatch ? toMatch[1] : '';
    const success = !message.includes('失败') && !message.includes('error');

    return {
      id,
      type: 'tool_call',
      timestamp,
      taskId,
      projectId,
      payload: {
        toolName: 'move_file',
        argsSummary: `${fromPath} → ${toPath}`,
        success,
        fromPath,
        toPath,
      },
    };
  }

  const toolMatch = message.match(/(?:调用|call|tool)[:\s]*(list_files|read_file|write_file|delete_file|search_files|get_project_structure|generate_image)/i);
  if (toolMatch) {
    const toolName = toolMatch[1];
    const success = !message.includes('失败') && !message.includes('error');

    return {
      id,
      type: 'tool_call',
      timestamp,
      taskId,
      projectId,
      payload: {
        toolName,
        argsSummary: message,
        success,
      },
    };
  }

  const phaseMatch = message.match(/(?:进入|enter|phase)[:\s]*(planner|coder|reviewer|debugger)/i);
  if (phaseMatch) {
    const phase = phaseMatch[1].toLowerCase() as AgentPhase;

    return {
      id,
      type: 'agent_phase',
      timestamp,
      taskId,
      projectId,
      payload: {
        phase,
        action: 'enter',
        summary: message,
      },
    };
  }

  const level = log.log_type === 'error' ? 'error' : log.log_type === 'success' ? 'info' : 'info';

  return {
    id,
    type: 'log',
    timestamp,
    taskId,
    projectId,
    payload: {
      level,
      message,
      metadata: log.metadata,
    },
  };
}

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

    case 'self_repair': {
      const attemptNumber = (payload.attemptNumber as number) || 1;
      const maxAttempts = (payload.maxAttempts as number) || 3;
      const status = payload.status as string;
      
      let result: 'pending' | 'success' | 'failed' = 'pending';
      if (status === 'success' || status === 'completed') {
        result = 'success';
      } else if (status === 'failed' || status === 'error') {
        result = 'failed';
      }
      
      return {
        id,
        type: 'self_repair',
        timestamp,
        taskId,
        projectId: project_id,
        payload: {
          attemptNumber,
          maxAttempts,
          trigger: payload.errorType as string || '',
          errorType: payload.errorType as string,
          errorMessage: payload.errorMessage as string,
          suggestion: payload.rootCause as string,
          result,
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

    // 订阅 build_logs 表（兼容旧的日志解析方式）
    const unsubscribeBuildLogs = subscribeBuildLogs({
      projectId,
      onLogCreated: (log: BuildLog) => {
        if (processedLogIdsRef.current.has(log.id)) {
          return;
        }
        processedLogIdsRef.current.add(log.id);

        const event = parseBuildLogToTimelineEvent(log, projectId);
        if (event) {
          dispatch({ type: 'ADD_EVENT', payload: event });
        }
      },
      onError: (error) => {
        console.error('[useTimelineEvents] build_logs 订阅错误:', error);
      },
    });

    // Step 3: 订阅 agent_events 表（新的结构化事件）
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
      unsubscribeBuildLogs();
      unsubscribeAgentEvents();
      setIsConnected(false);
    };
  }, [projectId]);

  const limitedEvents = state.events.slice(-maxEvents);
  const limitedPhases = state.phases.slice(-maxEvents);
  const limitedTools = state.tools.slice(-maxEvents);
  const limitedFiles = state.files.slice(-maxEvents);
  const limitedRepairs = state.repairs.slice(-maxEvents);
  const limitedLogs = state.logs.slice(-maxEvents);
  const limitedErrors = state.errors.slice(-maxEvents);

  return {
    events: limitedEvents,
    phases: limitedPhases,
    tools: limitedTools,
    files: limitedFiles,
    repairs: limitedRepairs,
    logs: limitedLogs,
    errors: limitedErrors,
    currentPhase: state.currentPhase,
    isConnected,
    addEvent,
    clearEvents,
  };
}

export default useTimelineEvents;
