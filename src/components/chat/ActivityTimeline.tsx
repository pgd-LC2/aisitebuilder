/**
 * ActivityTimeline 组件
 * 
 * Bolt 风格的 Activity Timeline，实时展示 Agent 行为流。
 * 支持显示阶段变化、工具调用、文件操作、自修复尝试等事件。
 * 
 * UI 设计参考 Bolt.new:
 * - 可折叠的 "X actions taken" 面板
 * - 带状态指示器的任务计划列表
 * - 详细操作日志（Searched、Read、Edited 等）
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Circle,
  Search,
  Eye,
  Pencil,
  Trash2,
  FolderPlus,
  Move,
  Image,
  Loader2,
  MessageCircle,
  AlertTriangle,
} from 'lucide-react';
import { useTimelineEvents } from '../../realtime';
import type {
  AgentPhaseEvent,
  ToolCallEvent,
  FileUpdateEvent,
  ErrorEvent,
  AgentPhase,
} from '../../realtime/types';

interface ActivityTimelineProps {
  projectId: string;
  taskId?: string;
  maxEvents?: number;
  onFileSelect?: (filePath: string) => void;
}

// Bolt 风格的工具调用配置
const boltToolConfig: Record<string, { label: string; icon: React.ElementType }> = {
  list_files: { label: 'Listed', icon: FolderPlus },
  read_file: { label: 'Read', icon: Eye },
  write_file: { label: 'Edited', icon: Pencil },
  delete_file: { label: 'Deleted', icon: Trash2 },
  move_file: { label: 'Moved', icon: Move },
  search_files: { label: 'Searched', icon: Search },
  get_project_structure: { label: 'Listed', icon: FolderPlus },
  generate_image: { label: 'Generated', icon: Image },
};

// Bolt 风格的文件操作配置
const boltFileOpConfig: Record<string, { label: string; icon: React.ElementType }> = {
  create: { label: 'Created', icon: FolderPlus },
  update: { label: 'Edited', icon: Pencil },
  delete: { label: 'Deleted', icon: Trash2 },
  move: { label: 'Moved', icon: Move },
};

// 阶段配置
const phaseConfig: Record<AgentPhase, { label: string; color: string }> = {
  planner: { label: '规划中', color: 'text-purple-600' },
  coder: { label: '编码中', color: 'text-blue-600' },
  reviewer: { label: '审查中', color: 'text-green-600' },
  debugger: { label: '调试中', color: 'text-orange-600' },
};

// Bolt 风格的单个操作项
function BoltActionItem({ 
  event, 
  onFileSelect 
}: { 
  event: ToolCallEvent | FileUpdateEvent; 
  onFileSelect?: (path: string) => void;
}) {
  if (event.type === 'tool_call') {
    const config = boltToolConfig[event.payload.toolName] || { label: event.payload.toolName, icon: Search };
    const Icon = config.icon;
    const filePath = event.payload.argsSummary || '';
    
    return (
      <div className="flex items-center gap-2 py-1.5">
        <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <span className="text-sm text-gray-700 font-medium">{config.label}</span>
        {filePath && (
          <button
            onClick={() => onFileSelect?.(filePath)}
            className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-mono rounded hover:bg-gray-200 transition-colors truncate max-w-[200px]"
            title={filePath}
          >
            {filePath}
          </button>
        )}
        {!event.payload.success && (
          <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
        )}
      </div>
    );
  }
  
  if (event.type === 'file_update') {
    const config = boltFileOpConfig[event.payload.op] || boltFileOpConfig.update;
    const Icon = config.icon;
    
    return (
      <div className="flex items-center gap-2 py-1.5">
        <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <span className="text-sm text-gray-700 font-medium">{config.label}</span>
        <button
          onClick={() => onFileSelect?.(event.payload.path)}
          className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-mono rounded hover:bg-gray-200 transition-colors truncate max-w-[200px]"
          title={event.payload.path}
        >
          {event.payload.path}
        </button>
      </div>
    );
  }
  
  return null;
}

// Bolt 风格的计划项（带状态指示器）
function BoltPlanItem({ 
  event,
  isActive,
  isCompleted,
  children
}: { 
  event: AgentPhaseEvent;
  isActive: boolean;
  isCompleted: boolean;
  children?: React.ReactNode;
}) {
  const StatusIcon = isCompleted ? CheckCircle : isActive ? Loader2 : Circle;
  const statusColor = isCompleted ? 'text-green-500' : isActive ? 'text-blue-500' : 'text-gray-300';
  
  return (
    <div className="flex items-start gap-2 py-1">
      <StatusIcon className={`w-4 h-4 ${statusColor} flex-shrink-0 mt-0.5 ${isActive ? 'animate-spin' : ''}`} />
      <div className="flex-1">
        <span className={`text-sm ${isCompleted ? 'text-gray-700' : isActive ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
          {event.payload.summary || phaseConfig[event.payload.phase]?.label || event.payload.phase}
        </span>
        {children}
      </div>
    </div>
  );
}

// Bolt 风格的错误项
function BoltErrorItem({ event }: { event: ErrorEvent }) {
  return (
    <div className="flex items-start gap-2 py-2 px-3 rounded-lg bg-red-50 border-l-2 border-red-500">
      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-red-700">{event.payload.errorType}</span>
        <p className="text-xs text-red-600 mt-0.5">{event.payload.message}</p>
      </div>
    </div>
  );
}

export default function ActivityTimeline({ projectId, taskId, maxEvents = 100, onFileSelect }: ActivityTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const timelineEndRef = useRef<HTMLDivElement>(null);

  const { events, phases, tools, files, errors, currentPhase, isConnected } = useTimelineEvents({
    projectId,
    taskId,
    maxEvents,
  });

  // 计算操作数量（工具调用 + 文件操作）
  const actionCount = tools.length + files.length;
  
  // 合并工具调用和文件操作，按时间排序
  const actions = useMemo(() => {
    return [...tools, ...files].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [tools, files]);

  // 处理阶段事件，构建计划列表
  const planItems = useMemo(() => {
    const items: { event: AgentPhaseEvent; isActive: boolean; isCompleted: boolean; actions: (ToolCallEvent | FileUpdateEvent)[] }[] = [];
    
    // 按时间排序阶段事件
    const sortedPhases = [...phases].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    // 只保留 enter 事件，并标记状态
    const enterPhases = sortedPhases.filter(p => p.payload.action === 'enter');
    const exitPhases = sortedPhases.filter(p => p.payload.action === 'exit');
    
    enterPhases.forEach((enterEvent, index) => {
      const hasExit = exitPhases.some(e => 
        e.payload.phase === enterEvent.payload.phase && 
        new Date(e.timestamp).getTime() > new Date(enterEvent.timestamp).getTime()
      );
      
      const isLast = index === enterPhases.length - 1;
      const isActive = isLast && !hasExit && currentPhase === enterEvent.payload.phase;
      const isCompleted = hasExit || (!isLast);
      
      // 找到该阶段期间的操作
      const phaseStartTime = new Date(enterEvent.timestamp).getTime();
      const nextPhaseStartTime = index < enterPhases.length - 1 
        ? new Date(enterPhases[index + 1].timestamp).getTime() 
        : Date.now();
      
      const phaseActions = actions.filter(a => {
        const actionTime = new Date(a.timestamp).getTime();
        return actionTime >= phaseStartTime && actionTime < nextPhaseStartTime;
      });
      
      items.push({
        event: enterEvent,
        isActive,
        isCompleted,
        actions: phaseActions
      });
    });
    
    return items;
  }, [phases, actions, currentPhase]);

  useEffect(() => {
    if (isExpanded && timelineEndRef.current) {
      timelineEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, isExpanded]);

  // 如果没有事件，不显示组件
  if (events.length === 0 && !currentPhase) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden my-2 flex flex-col max-h-[400px]">
      {/* Bolt 风格的 Actions Taken 头部 - 使用 sticky 定位保持在顶部 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors sticky top-0 bg-white z-10 flex-shrink-0"
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-700">
            {actionCount > 0 ? `${actionCount} actions taken` : 'Processing...'}
          </span>
          {currentPhase && (
            <span className={`text-xs ${phaseConfig[currentPhase]?.color || 'text-gray-500'}`}>
              ({phaseConfig[currentPhase]?.label || currentPhase})
            </span>
          )}
          {!isConnected && (
            <span className="text-xs text-yellow-600">(离线)</span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3 overflow-y-auto flex-1">
          {/* 计划列表（带状态指示器） */}
          {planItems.length > 0 && (
            <div className="space-y-1">
              {planItems.map((item) => (
                <div key={item.event.id}>
                  <BoltPlanItem
                    event={item.event}
                    isActive={item.isActive}
                    isCompleted={item.isCompleted}
                  />
                  {/* 显示该阶段的操作 */}
                  {item.actions.length > 0 && (
                    <div className="ml-6 pl-2 border-l border-gray-200">
                      {item.actions.map((action) => (
                        <BoltActionItem
                          key={action.id}
                          event={action}
                          onFileSelect={onFileSelect}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {/* 如果没有计划项但有操作，直接显示操作列表 */}
          {planItems.length === 0 && actions.length > 0 && (
            <div className="space-y-1">
              {actions.map((action) => (
                <BoltActionItem
                  key={action.id}
                  event={action}
                  onFileSelect={onFileSelect}
                />
              ))}
            </div>
          )}
          
          {/* 错误事件 */}
          {errors.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              {errors.map((error) => (
                <BoltErrorItem key={error.id} event={error} />
              ))}
            </div>
          )}
          
          <div ref={timelineEndRef} />
        </div>
      )}
    </div>
  );
}
