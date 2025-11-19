import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, ChevronUp, Download, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { BuildLog } from '../types/project';
import { buildLogService } from '../services/buildLogService';
import { supabase } from '../lib/supabase';

interface BuildLogPanelProps {
  projectId: string;
  onLogAdded?: (log: BuildLog) => void;
}

const logTypeIcons = {
  info: Info,
  success: CheckCircle,
  error: AlertCircle
};

const logTypeColors = {
  info: 'text-blue-500 bg-blue-50',
  success: 'text-green-500 bg-green-50',
  error: 'text-red-500 bg-red-50'
};

export default function BuildLogPanel({ projectId, onLogAdded }: BuildLogPanelProps) {
  const [logs, setLogs] = useState<BuildLog[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const appendLog = useCallback((log: BuildLog) => {
    setLogs(prev => {
      if (prev.some(item => item.id === log.id)) {
        console.log('日志已存在，跳过');
        return prev;
      }
      console.log('添加日志到界面');
      return [...prev, log];
    });
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await buildLogService.getBuildLogsByProjectId(projectId);
    if (!error && data) {
      setLogs(data);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadLogs();

    const channelName = `build-logs-${projectId}`;

    supabase.getChannels().forEach(channel => {
      if (channel.topic === channelName) {
        console.log('移除旧的日志订阅');
        supabase.removeChannel(channel);
      }
    });

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'build_logs',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          console.log('🔔 收到新日志 Realtime 推送', payload);
          console.log('payload.new:', payload.new);
          appendLog(payload.new as BuildLog);
        }
      )
      .subscribe((status, err) => {
        console.log('日志订阅状态', status);
        if (err) console.error('订阅错误:', err);
        if (status === 'SUBSCRIBED') {
          console.log('✅ 日志 Realtime 订阅成功');
        }
      });

    const handleBuildLogAdded = ((e: CustomEvent) => {
      const log = e.detail as BuildLog;
      console.log('📢 通过 CustomEvent 接收日志:', log);
      appendLog(log);
      if (onLogAdded) {
        onLogAdded(log);
      }
    }) as EventListener;

    window.addEventListener('buildlog-added', handleBuildLogAdded);
    console.log('✅ CustomEvent 监听器已注册');

    return () => {
      console.log('清理日志订阅');
      supabase.removeChannel(channel);
      window.removeEventListener('buildlog-added', handleBuildLogAdded);
    };
  }, [projectId, onLogAdded, appendLog, loadLogs]);

  useEffect(() => {
    if (isExpanded && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isExpanded]);

  const handleExportLogs = () => {
    const logText = logs
      .map(log => {
        const timestamp = new Date(log.created_at).toLocaleString('zh-CN');
        return `[${timestamp}] [${log.log_type.toUpperCase()}] ${log.message}`;
      })
      .join('\n');

    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `build-logs-${projectId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">构建日志</span>
          {logs.length > 0 && (
            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
              {logs.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {logs.length > 0 && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                handleExportLogs();
              }}
              className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
              title="导出日志"
            >
              <Download className="w-4 h-4 text-gray-500" />
            </div>
          )}
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="bg-white">
          {loading ? (
            <div className="p-4 text-center text-gray-500">加载中...</div>
          ) : logs.length === 0 ? (
            <div className="p-4 text-center text-gray-400">暂无日志</div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {logs.map((log) => {
                const Icon = logTypeIcons[log.log_type];
                return (
                  <div
                    key={log.id}
                    className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-1 rounded-lg ${logTypeColors[log.log_type]}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-gray-500">
                            {formatTime(log.created_at)}
                          </span>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              log.log_type === 'info'
                                ? 'bg-blue-100 text-blue-700'
                                : log.log_type === 'success'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {log.log_type.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 break-words">{log.message}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
