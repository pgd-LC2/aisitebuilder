import { Send } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { buildLogService } from '../services/buildLogService';
import { messageService } from '../services/messageService';
import { aiTaskService } from '../services/aiTaskService';
import { ChatMessage, AITask, ProjectFilesContext } from '../types/project';
import { supabase } from '../lib/supabase';
import BuildLogPanel from './BuildLogPanel';

interface ChatPanelProps {
  projectFilesContext?: ProjectFilesContext;
}

export default function ChatPanel({ projectFilesContext }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const { currentProject } = useProject();
  const projectId = currentProject?.id;

  const appendMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => {
      if (prev.some(m => m.id === message.id)) {
        console.log('消息已存在，跳过');
        return prev;
      }
      console.log('添加消息到界面');
      return [...prev, message];
    });
  }, []);

  const loadMessages = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    const { data, error } = await messageService.getMessagesByProjectId(projectId);
    if (!error && data) {
      setMessages(data);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;

    loadMessages();

    const channelName = `chat-messages-${projectId}`;

    supabase.getChannels().forEach(channel => {
      if (channel.topic === channelName) {
        console.log('移除旧的聊天订阅');
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
          table: 'chat_messages',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          console.log('🔔 收到新消息 Realtime 推送:', payload);
          const newMessage = payload.new as ChatMessage;
          console.log('newMessage:', newMessage);
          appendMessage(newMessage);
        }
      )
      .subscribe((status, err) => {
        console.log('聊天订阅状态:', status);
        if (err) console.error('订阅错误:', err);
        if (status === 'SUBSCRIBED') {
          console.log('✅ 聊天 Realtime 订阅成功');
        }
      });

    return () => {
      console.log('清理聊天订阅');
      supabase.removeChannel(channel);
    };
  }, [projectId, loadMessages, appendMessage]);

  useEffect(() => {
    if (!projectId) return;

    const tasksChannelName = `ai-tasks-${projectId}-updates`;

    supabase.getChannels().forEach(channel => {
      if (channel.topic === tasksChannelName) {
        console.log('移除旧的任务订阅');
        supabase.removeChannel(channel);
      }
    });

    const tasksChannel = supabase
      .channel(tasksChannelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ai_tasks',
          filter: `project_id=eq.${projectId}`
        },
        async (payload) => {
          const updatedTask = payload.new as AITask;
          if (updatedTask.type !== 'chat_reply') {
            return;
          }

          if (updatedTask.status === 'completed') {
            const messageId = updatedTask.result?.messageId as string | undefined;
            if (messageId) {
              const { data } = await messageService.getMessageById(messageId);
              if (data) {
                appendMessage(data);
                return;
              }
            }
            await loadMessages();
          } else if (updatedTask.status === 'failed') {
            await buildLogService.addBuildLog(
              projectId,
              'error',
              'AI 任务处理失败，请查看最新日志'
            );
          }
        }
      )
      .subscribe((status, err) => {
        console.log('任务订阅状态:', status);
        if (err) console.error('任务订阅错误:', err);
      });

    return () => {
      console.log('清理任务订阅');
      supabase.removeChannel(tasksChannel);
    };
  }, [projectId, appendMessage, loadMessages]);

  const handleSend = async () => {
    if (!input.trim() || !projectId) return;

    const messageContent = input;
    setInput('');

    console.log('发送消息:', messageContent);
    const { data: userMsg, error } = await messageService.addMessage(
      projectId,
      'user',
      messageContent
    );

    console.log('消息保存结果:', { userMsg, error });

    if (userMsg) {
      appendMessage(userMsg);
    }

    const logResult = await buildLogService.addBuildLog(
      projectId,
      'info',
      `用户输入: ${messageContent}`
    );

    if (logResult.data) {
      console.log('触发构建日志事件:', logResult.data);
      window.dispatchEvent(new CustomEvent('buildlog-added', { detail: logResult.data }));
    } else {
      console.log('构建日志数据为空，无法触发事件');
    }

    if (userMsg) {
      const { data: task, error: taskError } = await aiTaskService.addTask(
        projectId,
        'chat_reply',
        {
          messageId: userMsg.id,
          content: messageContent
        }
      );

      if (taskError) {
        console.error('创建 AI 任务失败:', taskError);
      } else {
        console.log('AI 任务已创建:', task);
        const { error: triggerError } = await aiTaskService.triggerProcessor(
          projectId,
          projectFilesContext
        );
        if (triggerError) {
          console.error('触发 AI 任务处理失败:', triggerError);
          await buildLogService.addBuildLog(
            projectId,
            'error',
            '触发 AI 任务处理失败，请稍后重试'
          );
        } else {
          console.log('已触发 Edge Function 处理任务');
        }
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-500 text-sm">加载中...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-gray-500 text-sm">暂无对话</p>
              <p className="text-gray-400 text-xs">输入你的指令开始编辑</p>
            </div>
          </div>
        ) : (
          messages.map(message => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-900 border border-gray-200'
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {message.content}
                </p>
                <span className="text-[10px] opacity-60 mt-1 block">
                  {new Date(message.created_at).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {currentProject && <BuildLogPanel projectId={currentProject.id} />}

      <div className="px-4 py-2 bg-gray-50">
        <div className="flex items-center gap-1 bg-white rounded-full pl-3 py-1 pr-1 border border-gray-300 focus-within:border-blue-500 transition-colors">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="输入指令..."
            className="flex-1 bg-transparent text-gray-900 placeholder-gray-400 text-sm outline-none resize-none leading-tight py-1.5 overflow-hidden"
            rows={1}
            style={{ height: '28px', maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
          >
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
