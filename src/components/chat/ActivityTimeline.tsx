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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

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
  coder: { label: '编码中', color: 'text-primary' },
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
        <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-medium">{config.label}</span>
        {filePath && (
          <button
            onClick={() => onFileSelect?.(filePath)}
            className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-mono rounded hover:bg-muted/80 transition-colors truncate max-w-[200px]"
            title={filePath}
          >
            {filePath}
          </button>
        )}
        {!event.payload.success && (
          <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
        )}
      </div>
    );
  }
  
  if (event.type === 'file_update') {
    const config = boltFileOpConfig[event.payload.op] || boltFileOpConfig.update;
    const Icon = config.icon;
    
    return (
      <div className="flex items-center gap-2 py-1.5">
        <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-medium">{config.label}</span>
        <button
          onClick={() => onFileSelect?.(event.payload.path)}
          className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-mono rounded hover:bg-muted/80 transition-colors truncate max-w-[200px]"
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
  const statusColor = isCompleted ? 'text-success' : isActive ? 'text-primary' : 'text-muted-foreground/50';
  
  return (
    <div className="flex items-start gap-2 py-1">
      <StatusIcon className={cn("w-4 h-4 flex-shrink-0 mt-0.5", statusColor, isActive && 'animate-spin')} />
      <div className="flex-1">
        <span className={cn(
          "text-sm",
          isCompleted ? 'text-foreground' : isActive ? 'font-medium' : 'text-muted-foreground'
        )}>
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
    <Alert variant="destructive" className="py-2">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="text-sm">{event.payload.errorType}</AlertTitle>
      <AlertDescription className="text-xs">{event.payload.message}</AlertDescription>
    </Alert>
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
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded} className="bg-card rounded-lg border overflow-hidden my-2 flex flex-col max-h-[400px]">
      {/* Bolt 风格的 Actions Taken 头部 - 使用 sticky 定位保持在顶部 */}
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted transition-colors sticky top-0 bg-card z-10 flex-shrink-0 h-auto rounded-none"
        >
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">
              {actionCount > 0 ? `${actionCount} actions taken` : 'Processing...'}
            </span>
            {currentPhase && (
              <Badge variant="secondary" className="text-xs">
                {phaseConfig[currentPhase]?.label || currentPhase}
              </Badge>
            )}
            {!isConnected && (
              <Badge variant="outline" className="text-xs text-warning border-warning">离线</Badge>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <ScrollArea className="border-t px-4 py-3 space-y-3 flex-1 max-h-[300px]">
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
                    <div className="ml-6 pl-2 border-l">
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
            <div className="space-y-2 pt-2 border-t">
              {errors.map((error) => (
                <BoltErrorItem key={error.id} event={error} />
              ))}
            </div>
          )}
          
          <div ref={timelineEndRef} />
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  );
}
