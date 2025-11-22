import { Send } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [taskType, setTaskType] = useState<'chat_reply' | 'build_site' | 'refactor_code'>('chat_reply');
  const { currentProject } = useProject();
  const projectId = currentProject?.id;

  const chatSubscribedRef = useRef(false);
  const tasksSubscribedRef = useRef(false);
  const [isSubscribedReady, setIsSubscribedReady] = useState(false);
  
  const watchdogTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const pendingReplyRef = useRef<{ messageId: string; startedAt: number } | null>(null);
  
  const lastFetchAtRef = useRef<number>(0);
  const loadMessagesVersionRef = useRef<number>(0);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

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

    loadMessagesVersionRef.current += 1;
    const currentVersion = loadMessagesVersionRef.current;
    console.log(`loadMessages 开始 (版本 ${currentVersion})`);

    setLoading(true);
    const { data, error } = await messageService.getMessagesByProjectId(projectId);
    
    if (currentVersion < loadMessagesVersionRef.current) {
      console.log(`loadMessages 版本 ${currentVersion} 已过期，忽略结果 (当前版本: ${loadMessagesVersionRef.current})`);
      setLoading(false);
      return;
    }
    
    if (!error && data) {
      console.log(`loadMessages 版本 ${currentVersion} 更新状态，消息数: ${data.length}`);
      setMessages(data);
    }
    setLoading(false);
    lastFetchAtRef.current = Date.now();
  }, [projectId]);

  const startPollingForReply = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }
    const startedAt = Date.now();
    console.log('开始轮询 AI 回复');
    pollTimerRef.current = window.setInterval(() => {
      if (!pendingReplyRef.current || Date.now() - startedAt > 60000) {
        console.log('AI 回复轮询超时或已完成，停止轮询');
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        pendingReplyRef.current = null;
        return;
      }
      console.log('轮询 AI 回复：调用 loadMessages()');
      loadMessages();
    }, 2500);
  }, [loadMessages]);

  useEffect(() => {
    if (!projectId) return;

    chatSubscribedRef.current = false;
    setIsSubscribedReady(false);

    loadMessages();

    const channelName = `chat-messages-${projectId}`;

    supabase.getChannels().forEach(channel => {
      if (channel.topic === channelName) {
        console.log('移除旧的聊天订阅');
        supabase.removeChannel(channel);
      }
    });

    const subscribeTimestamp = Date.now();

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
          
          if (watchdogTimerRef.current) {
            clearTimeout(watchdogTimerRef.current);
            watchdogTimerRef.current = null;
          }
        }
      )
      .subscribe((status, err) => {
        console.log('聊天订阅状态:', status, '时间:', new Date().toISOString());
        if (err) console.error('订阅错误:', err);
        if (status === 'SUBSCRIBED') {
          console.log('✅ 聊天 Realtime 订阅成功');
          chatSubscribedRef.current = true;
          setIsSubscribedReady(chatSubscribedRef.current && tasksSubscribedRef.current);
          
          if (subscribeTimestamp > lastFetchAtRef.current) {
            console.log('执行 catch-up 刷新消息');
            loadMessages();
          }
        }
      });

    return () => {
      console.log('清理聊天订阅');
      chatSubscribedRef.current = false;
      setIsSubscribedReady(false);
      supabase.removeChannel(channel);
    };
  }, [projectId, loadMessages, appendMessage]);

  useEffect(() => {
    if (!projectId) return;

    tasksSubscribedRef.current = false;
    setIsSubscribedReady(false);

    const tasksChannelName = `ai-tasks-${projectId}-updates`;

    supabase.getChannels().forEach(channel => {
      if (channel.topic === tasksChannelName) {
        console.log('移除旧的任务订阅');
        supabase.removeChannel(channel);
      }
    });

    const subscribeTimestamp = Date.now();

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
          console.log('🔔 收到 ai_tasks UPDATE 推送:', payload);
          const updatedTask = payload.new as AITask;
          console.log('updatedTask:', { id: updatedTask.id, type: updatedTask.type, status: updatedTask.status, result: updatedTask.result });
          
          if (updatedTask.type !== 'chat_reply') {
            console.log('任务类型不是 chat_reply，跳过');
            return;
          }

          if (updatedTask.status === 'completed') {
            console.log('AI 任务已完成，准备获取消息');
            const messageId = updatedTask.result?.messageId as string | undefined;
            if (messageId) {
              console.log('从 result 中获取 messageId:', messageId);
              const { data } = await messageService.getMessageById(messageId);
              if (data) {
                console.log('成功获取消息，添加到界面');
                appendMessage(data);
                
                if (watchdogTimerRef.current) {
                  clearTimeout(watchdogTimerRef.current);
                  watchdogTimerRef.current = null;
                }
                return;
              } else {
                console.log('getMessageById 未获取到消息，500ms 后重试');
                setTimeout(() => {
                  loadMessages();
                }, 500);
                return;
              }
            }
            console.log('result 中没有 messageId，调用 loadMessages');
            await loadMessages();
          } else if (updatedTask.status === 'failed') {
            console.log('AI 任务失败');
            await buildLogService.addBuildLog(
              projectId,
              'error',
              'AI 任务处理失败，请查看最新日志'
            );
          }
        }
      )
      .subscribe((status, err) => {
        console.log('任务订阅状态:', status, '时间:', new Date().toISOString());
        if (err) console.error('任务订阅错误:', err);
        if (status === 'SUBSCRIBED') {
          console.log('✅ 任务 Realtime 订阅成功');
          tasksSubscribedRef.current = true;
          setIsSubscribedReady(chatSubscribedRef.current && tasksSubscribedRef.current);
          
          if (subscribeTimestamp > lastFetchAtRef.current) {
            console.log('执行 catch-up 刷新消息');
            loadMessages();
          }
        }
      });

    return () => {
      console.log('清理任务订阅');
      tasksSubscribedRef.current = false;
      setIsSubscribedReady(false);
      supabase.removeChannel(tasksChannel);
    };
  }, [projectId, appendMessage, loadMessages]);

  const handleSend = async () => {
    if (!input.trim() || !projectId) return;

    const messageContent = input;
    setInput('');

    console.log('发送消息:', messageContent, '时间:', new Date().toISOString());
    
    const { data: userMsg, error } = await messageService.addMessage(
      projectId,
      'user',
      messageContent
    );

    console.log('消息保存结果:', { userMsg, error });

    if (userMsg) {
      appendMessage(userMsg);
      setTimeout(() => {
        scrollToBottom();
      }, 100);
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
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
      }
      
      watchdogTimerRef.current = setTimeout(() => {
        console.log('watchdog 触发：5秒内未收到 AI 回复，执行刷新');
        loadMessages();
        
        watchdogTimerRef.current = setTimeout(() => {
          console.log('watchdog 二次触发：15秒内仍未收到 AI 回复，再次刷新');
          loadMessages();
          watchdogTimerRef.current = null;
        }, 10000);
      }, 5000);

      const { data: task, error: taskError } = await aiTaskService.addTask(
        projectId,
        taskType,
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
          pendingReplyRef.current = { messageId: userMsg.id, startedAt: Date.now() };
          startPollingForReply();
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

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const pending = pendingReplyRef.current;
    if (!pending) return;
    
    const hasAssistant = messages.some(m =>
      m.role === 'assistant' &&
      new Date(m.created_at).getTime() >= pending.startedAt - 1000
    );
    
    if (hasAssistant) {
      console.log('检测到 AI 回复已到达，停止轮询');
      pendingReplyRef.current = null;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      pendingReplyRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (pollTimerRef.current) {
      console.log('项目切换，清理轮询定时器');
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pendingReplyRef.current = null;
  }, [projectId]);

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
          <>
            {messages.map(message => (
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
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {currentProject && (
        <BuildLogPanel
          projectId={currentProject.id}
          onLogAdded={(log) => {
            if (log.message === 'AI 任务处理完成' || log.message.includes('AI 任务处理完成')) {
              console.log('检测到 AI 任务处理完成日志，强制刷新消息');
              loadMessages();
            }
          }}
        />
      )}

      <div className="px-4 py-2 bg-gray-50">
        {!isSubscribedReady && projectId && (
          <div className="mb-2 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs text-yellow-700">连接中，请稍候...</p>
          </div>
        )}
        <div className="mb-2">
          <label className="text-xs text-gray-600 mb-1 block">AI 任务类型</label>
          <select
            value={taskType}
            onChange={(e) => setTaskType(e.target.value as 'chat_reply' | 'build_site' | 'refactor_code')}
            className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
          >
            <option value="chat_reply">💬 聊天回复 (Chat Reply)</option>
            <option value="build_site">🏗️ 构建网站 (Build Site)</option>
            <option value="refactor_code">🔧 重构代码 (Refactor Code)</option>
          </select>
        </div>
        <div className="flex items-center gap-1 bg-white rounded-full pl-3 py-1 pr-1 border border-gray-300 focus-within:border-blue-500 transition-colors">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={isSubscribedReady ? "输入指令..." : "连接中..."}
            disabled={!isSubscribedReady}
            className="flex-1 bg-transparent text-gray-900 placeholder-gray-400 text-sm outline-none resize-none leading-tight py-1.5 overflow-hidden disabled:cursor-not-allowed"
            rows={1}
            style={{ height: '28px', maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !isSubscribedReady}
            className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
          >
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
