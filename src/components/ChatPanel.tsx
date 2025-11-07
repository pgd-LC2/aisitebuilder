import { Send } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { buildLogService } from '../services/buildLogService';
import { messageService } from '../services/messageService';
import { ChatMessage } from '../types/project';
import { supabase } from '../lib/supabase';
import BuildLogPanel from './BuildLogPanel';

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const { currentProject } = useProject();

  useEffect(() => {
    if (!currentProject) return;

    loadMessages();

    const channelName = `chat-messages-${currentProject.id}`;

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
          filter: `project_id=eq.${currentProject.id}`
        },
        (payload) => {
          console.log('🔔 收到新消息 Realtime 推送:', payload);
          const newMessage = payload.new as ChatMessage;
          console.log('newMessage:', newMessage);
          setMessages(prev => {
            if (prev.some(m => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
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
  }, [currentProject]);

  const loadMessages = async () => {
    if (!currentProject) return;

    setLoading(true);
    const { data, error } = await messageService.getMessagesByProjectId(currentProject.id);
    if (!error && data) {
      setMessages(data);
    }
    setLoading(false);
  };

  const handleSend = async () => {
    if (!input.trim() || !currentProject) return;

    const messageContent = input;
    setInput('');

    console.log('发送消息:', messageContent);
    const { data: userMsg, error } = await messageService.addMessage(
      currentProject.id,
      'user',
      messageContent
    );

    console.log('消息保存结果:', { userMsg, error });

    if (userMsg) {
      console.log('添加用户消息到界面');
      setMessages(prev => {
        if (prev.some(m => m.id === userMsg.id)) return prev;
        return [...prev, userMsg];
      });
    }

    const logResult = await buildLogService.addBuildLog(
      currentProject.id,
      'info',
      `用户输入: ${messageContent}`
    );

    if (logResult.data) {
      console.log('触发构建日志事件:', logResult.data);
      window.dispatchEvent(new CustomEvent('buildlog-added', { detail: logResult.data }));
    } else {
      console.log('构建日志数据为空，无法触发事件');
    }

    setTimeout(async () => {
      const { data: aiMsg } = await messageService.addMessage(
        currentProject.id,
        'assistant',
        '收到！我正在处理你的请求...'
      );

      if (aiMsg) {
        console.log('添加AI消息到界面');
        setMessages(prev => {
          if (prev.some(m => m.id === aiMsg.id)) return prev;
          return [...prev, aiMsg];
        });
      }

      const aiLogResult = await buildLogService.addBuildLog(
        currentProject.id,
        'success',
        'AI 响应已生成'
      );

      if (aiLogResult.data) {
        console.log('触发AI日志事件:', aiLogResult.data);
        window.dispatchEvent(new CustomEvent('buildlog-added', { detail: aiLogResult.data }));
      } else {
        console.log('AI日志数据为空，无法触发事件');
      }
    }, 1000);
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
