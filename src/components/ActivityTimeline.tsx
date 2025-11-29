/**
 * ActivityTimeline 组件
 * 
 * Bolt 风格的 Activity Timeline，实时展示 Agent 行为流。
 * 支持显示阶段变化、工具调用、文件操作、自修复尝试等事件。
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  FolderOpen,
  ArrowRight,
  RefreshCw,
  Code,
  Search,
  Image,
  Trash2,
  Move,
  Loader2,
  Terminal,
  Zap,
  Clock,
} from 'lucide-react';
import { useTimelineEvents } from '../realtime';
import type {
  TimelineEvent,
  AgentPhaseEvent,
  ToolCallEvent,
  FileUpdateEvent,
  SelfRepairEvent,
  LogEvent,
  ErrorEvent,
  AgentPhase,
} from '../realtime/types';

interface ActivityTimelineProps {
  projectId: string;
  taskId?: string;
  maxEvents?: number;
  onFileSelect?: (filePath: string) => void;
}

const phaseConfig: Record<AgentPhase, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  planner: { label: '规划器', color: 'text-purple-600', bgColor: 'bg-purple-100', icon: Zap },
  coder: { label: '编码器', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: Code },
  reviewer: { label: '审查器', color: 'text-green-600', bgColor: 'bg-green-100', icon: CheckCircle },
  debugger: { label: '调试器', color: 'text-orange-600', bgColor: 'bg-orange-100', icon: RefreshCw },
};

const toolConfig: Record<string, { label: string; icon: React.ElementType }> = {
  list_files: { label: '列出文件', icon: FolderOpen },
  read_file: { label: '读取文件', icon: FileText },
  write_file: { label: '写入文件', icon: FileText },
  delete_file: { label: '删除文件', icon: Trash2 },
  move_file: { label: '移动文件', icon: Move },
  search_files: { label: '搜索文件', icon: Search },
  get_project_structure: { label: '获取结构', icon: FolderOpen },
  generate_image: { label: '生成图片', icon: Image },
};

const fileOpConfig: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  create: { label: '创建', color: 'text-green-600', bgColor: 'bg-green-100', icon: FileText },
  update: { label: '更新', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: FileText },
  delete: { label: '删除', color: 'text-red-600', bgColor: 'bg-red-100', icon: Trash2 },
  move: { label: '移动', color: 'text-purple-600', bgColor: 'bg-purple-100', icon: Move },
};

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function AgentPhaseItem({ event }: { event: AgentPhaseEvent }) {
  const config = phaseConfig[event.payload.phase];
  const Icon = config.icon;
  const isEnter = event.payload.action === 'enter';

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg ${config.bgColor} border-l-4 ${config.color.replace('text-', 'border-')}`}>
      <div className={`p-2 rounded-full ${config.bgColor}`}>
        <Icon className={`w-4 h-4 ${config.color}`} />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={`font-medium ${config.color}`}>{config.label}</span>
          <span className="text-xs text-gray-500">
            {isEnter ? '开始' : '结束'}
          </span>
        </div>
        {event.payload.summary && (
          <p className="text-sm text-gray-600 mt-1">{event.payload.summary}</p>
        )}
      </div>
      <span className="text-xs text-gray-400">{formatTime(event.timestamp)}</span>
    </div>
  );
}

function ToolCallItem({ event, onFileSelect }: { event: ToolCallEvent; onFileSelect?: (path: string) => void }) {
  const config = toolConfig[event.payload.toolName] || { label: event.payload.toolName, icon: Terminal };
  const Icon = config.icon;
  const isMoveFile = event.payload.toolName === 'move_file';

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg ${event.payload.success ? 'bg-gray-50' : 'bg-red-50'} hover:bg-gray-100 transition-colors`}>
      <div className={`p-2 rounded-full ${event.payload.success ? 'bg-blue-100' : 'bg-red-100'}`}>
        <Icon className={`w-4 h-4 ${event.payload.success ? 'text-blue-600' : 'text-red-600'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-800">{config.label}</span>
          {event.payload.success ? (
            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <XCircle className="w-3.5 h-3.5 text-red-500" />
          )}
          {event.payload.duration && (
            <span className="text-xs text-gray-400">{formatDuration(event.payload.duration)}</span>
          )}
        </div>
        
        {isMoveFile && event.payload.fromPath && event.payload.toPath ? (
          <div className="flex items-center gap-2 mt-1 text-sm">
            <button
              onClick={() => onFileSelect?.(event.payload.fromPath!)}
              className="text-purple-600 hover:underline truncate max-w-[120px]"
              title={event.payload.fromPath}
            >
              {event.payload.fromPath.split('/').pop()}
            </button>
            <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
            <button
              onClick={() => onFileSelect?.(event.payload.toPath!)}
              className="text-purple-600 hover:underline truncate max-w-[120px]"
              title={event.payload.toPath}
            >
              {event.payload.toPath.split('/').pop()}
            </button>
          </div>
        ) : event.payload.argsSummary ? (
          <p className="text-sm text-gray-600 mt-1 truncate">{event.payload.argsSummary}</p>
        ) : null}
        
        {event.payload.resultSummary && (
          <p className="text-xs text-gray-500 mt-1 truncate">{event.payload.resultSummary}</p>
        )}
      </div>
      <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(event.timestamp)}</span>
    </div>
  );
}

function FileUpdateItem({ event, onFileSelect }: { event: FileUpdateEvent; onFileSelect?: (path: string) => void }) {
  const config = fileOpConfig[event.payload.op] || fileOpConfig.update;
  const Icon = config.icon;
  const isMove = event.payload.op === 'move';

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg ${config.bgColor} hover:opacity-90 transition-opacity`}>
      <div className={`p-2 rounded-full bg-white`}>
        <Icon className={`w-4 h-4 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-medium ${config.color}`}>{config.label}文件</span>
        </div>
        
        {isMove && event.payload.fromPath && event.payload.toPath ? (
          <div className="flex items-center gap-2 mt-1 text-sm">
            <button
              onClick={() => onFileSelect?.(event.payload.fromPath!)}
              className="text-gray-700 hover:underline truncate max-w-[120px]"
              title={event.payload.fromPath}
            >
              {event.payload.fromPath.split('/').pop()}
            </button>
            <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
            <button
              onClick={() => onFileSelect?.(event.payload.toPath!)}
              className="text-gray-700 hover:underline truncate max-w-[120px]"
              title={event.payload.toPath}
            >
              {event.payload.toPath.split('/').pop()}
            </button>
          </div>
        ) : (
          <button
            onClick={() => onFileSelect?.(event.payload.path)}
            className="text-sm text-gray-700 hover:underline mt-1 truncate block max-w-full"
            title={event.payload.path}
          >
            {event.payload.path}
          </button>
        )}
        
        {event.payload.summary && (
          <p className="text-xs text-gray-500 mt-1">{event.payload.summary}</p>
        )}
      </div>
      <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(event.timestamp)}</span>
    </div>
  );
}

function SelfRepairItem({ event }: { event: SelfRepairEvent }) {
  const resultConfig = {
    pending: { color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: Loader2 },
    success: { color: 'text-green-600', bgColor: 'bg-green-100', icon: CheckCircle },
    failed: { color: 'text-red-600', bgColor: 'bg-red-100', icon: XCircle },
  };
  
  const config = resultConfig[event.payload.result];
  const Icon = config.icon;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg ${config.bgColor} border-l-4 ${config.color.replace('text-', 'border-')}`}>
      <div className={`p-2 rounded-full bg-white`}>
        <Icon className={`w-4 h-4 ${config.color} ${event.payload.result === 'pending' ? 'animate-spin' : ''}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-medium ${config.color}`}>自修复尝试</span>
          <span className="text-xs text-gray-500">
            {event.payload.attemptNumber}/{event.payload.maxAttempts}
          </span>
        </div>
        
        <p className="text-sm text-gray-600 mt-1">{event.payload.trigger}</p>
        
        {event.payload.errorMessage && (
          <p className="text-xs text-red-600 mt-1 truncate">{event.payload.errorMessage}</p>
        )}
        
        {event.payload.suggestion && (
          <p className="text-xs text-gray-500 mt-1 truncate">{event.payload.suggestion}</p>
        )}
      </div>
      <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(event.timestamp)}</span>
    </div>
  );
}

function LogItem({ event }: { event: LogEvent }) {
  const levelConfig = {
    info: { color: 'text-blue-600', bgColor: 'bg-blue-50', icon: Terminal },
    warn: { color: 'text-yellow-600', bgColor: 'bg-yellow-50', icon: AlertTriangle },
    error: { color: 'text-red-600', bgColor: 'bg-red-50', icon: XCircle },
    debug: { color: 'text-gray-600', bgColor: 'bg-gray-50', icon: Code },
  };
  
  const config = levelConfig[event.payload.level];
  const Icon = config.icon;

  return (
    <div className={`flex items-start gap-3 p-2 rounded-lg ${config.bgColor}`}>
      <Icon className={`w-4 h-4 ${config.color} flex-shrink-0 mt-0.5`} />
      <p className={`text-sm ${config.color} flex-1 break-words`}>{event.payload.message}</p>
      <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(event.timestamp)}</span>
    </div>
  );
}

function ErrorItem({ event }: { event: ErrorEvent }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-red-100 border-l-4 border-red-500">
      <div className="p-2 rounded-full bg-white">
        <XCircle className="w-4 h-4 text-red-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-red-600">错误</span>
          <span className="text-xs text-gray-500">{event.payload.errorType}</span>
          {event.payload.recoverable && (
            <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">可恢复</span>
          )}
        </div>
        <p className="text-sm text-red-700 mt-1">{event.payload.message}</p>
      </div>
      <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(event.timestamp)}</span>
    </div>
  );
}

function TimelineEventItem({ event, onFileSelect }: { event: TimelineEvent; onFileSelect?: (path: string) => void }) {
  switch (event.type) {
    case 'agent_phase':
      return <AgentPhaseItem event={event} />;
    case 'tool_call':
      return <ToolCallItem event={event} onFileSelect={onFileSelect} />;
    case 'file_update':
      return <FileUpdateItem event={event} onFileSelect={onFileSelect} />;
    case 'self_repair':
      return <SelfRepairItem event={event} />;
    case 'log':
      return <LogItem event={event} />;
    case 'error':
      return <ErrorItem event={event} />;
    default:
      return null;
  }
}

export default function ActivityTimeline({ projectId, taskId, maxEvents = 100, onFileSelect }: ActivityTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [filter, setFilter] = useState<'all' | 'phases' | 'tools' | 'files' | 'repairs'>('all');
  const timelineEndRef = useRef<HTMLDivElement>(null);

  const { events, phases, tools, files, repairs, currentPhase, isConnected } = useTimelineEvents({
    projectId,
    taskId,
    maxEvents,
  });

  const filteredEvents = useMemo(() => {
    switch (filter) {
      case 'phases':
        return phases;
      case 'tools':
        return tools;
      case 'files':
        return files;
      case 'repairs':
        return repairs;
      default:
        return events;
    }
  }, [filter, events, phases, tools, files, repairs]);

  useEffect(() => {
    if (isExpanded && timelineEndRef.current) {
      timelineEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredEvents, isExpanded]);

  const stats = useMemo(() => ({
    total: events.length,
    phases: phases.length,
    tools: tools.length,
    files: files.length,
    repairs: repairs.length,
  }), [events, phases, tools, files, repairs]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white hover:from-gray-100 hover:to-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4 text-blue-600" />
            <span className="font-medium text-gray-800">AI Activity</span>
          </div>
          
          {currentPhase && (
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${phaseConfig[currentPhase].bgColor}`}>
              <Loader2 className={`w-3 h-3 ${phaseConfig[currentPhase].color} animate-spin`} />
              <span className={`text-xs font-medium ${phaseConfig[currentPhase].color}`}>
                {phaseConfig[currentPhase].label}
              </span>
            </div>
          )}
          
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
            <span className="text-xs text-gray-500">{isConnected ? '已连接' : '未连接'}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {stats.total > 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="px-1.5 py-0.5 bg-gray-100 rounded">{stats.total} 事件</span>
            </div>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-100">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2 overflow-x-auto">
            {(['all', 'phases', 'tools', 'files', 'repairs'] as const).map((f) => {
              const labels = {
                all: '全部',
                phases: '阶段',
                tools: '工具',
                files: '文件',
                repairs: '修复',
              };
              const counts = {
                all: stats.total,
                phases: stats.phases,
                tools: stats.tools,
                files: stats.files,
                repairs: stats.repairs,
              };
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 text-xs rounded-full transition-colors flex items-center gap-1 ${
                    filter === f
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {labels[f]}
                  {counts[f] > 0 && (
                    <span className={`${filter === f ? 'text-blue-200' : 'text-gray-400'}`}>
                      ({counts[f]})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {filteredEvents.length === 0 ? (
              <div className="p-8 text-center">
                <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400">等待 AI 活动...</p>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {filteredEvents.map((event) => (
                  <TimelineEventItem key={event.id} event={event} onFileSelect={onFileSelect} />
                ))}
                <div ref={timelineEndRef} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
