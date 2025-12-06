import { Send } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { buildLogService } from '../services/buildLogService';
import { messageService } from '../services/messageService';
import { aiTaskService } from '../services/aiTaskService';
import { ProjectFilesContext, BuildLog } from '../types/project';
import { useAgentEvents } from '../realtime';
import BuildLogPanel from './BuildLogPanel';
import ActivityTimeline from './ActivityTimeline';

interface ChatPanelProps {
  projectFilesContext?: ProjectFilesContext;
}

export default function ChatPanel({ projectFilesContext }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [taskType, setTaskType] = useState<'chat_reply' | 'build_site' | 'refactor_code'>('chat_reply');
  const { currentProject } = useProject();
  const projectId = currentProject?.id;
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // 使用新的 useAgentEvents hook，统一管理消息和任务订阅
  const {
    messages,
    isConnected,
    messageImages,
    imageBlobUrls,
    appendMessage,
    refreshMessages
  } = useAgentEvents({
    projectId
  });

  // 判断是否正在加载（首次加载时消息为空且已连接）
  const loading = !isConnected && messages.length === 0;

  // 智能滚动：根据内容是否溢出和用户是否在底部来决定是否滚动
  const smartScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollHeight, clientHeight } = container;
    const noOverflow = scrollHeight <= clientHeight;

    if (noOverflow) {
      // 内容没有溢出（不需要滚动条）：保持第一条消息吸顶，不滚动
      container.scrollTop = 0;
      return;
    }

    // 内容已溢出：只有当用户本来就在底部附近时，才自动滚到最新消息
    if (isAtBottomRef.current) {
      container.scrollTop = scrollHeight;
    }
  }, []);

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
      // 发送消息后，标记用户在底部，然后触发智能滚动
      isAtBottomRef.current = true;
      setTimeout(() => {
        smartScroll();
      }, 100);
    }

    const logResult = await buildLogService.addBuildLog(
      projectId,
      'info',
      `用户输入: ${messageContent}`
    );

    if (logResult.data) {
      console.log('构建日志已添加:', logResult.data.id);
    }

    if (userMsg) {
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
        
        // 在触发 Edge Function 之前记录开始处理日志
        console.log('开始触发 Edge Function 处理任务...');
        
        const { error: triggerError } = await aiTaskService.triggerProcessor(
          projectId,
          projectFilesContext
        );
        
        // 根据结果记录完成或失败日志
        if (triggerError) {
          console.error('Edge Function 处理失败:', triggerError);
          await buildLogService.addBuildLog(
            projectId,
            'error',
            '触发 AI 任务处理失败，请稍后重试'
          );
        } else {
          console.log('Edge Function 处理完成');
          // Edge Function 完成后，延迟刷新消息列表作为 realtime 的备用方案
          // 这不是轮询，而是一次性的刷新，确保 AI 回复能够显示
          setTimeout(() => {
            console.log('Edge Function 完成后刷新消息列表');
            refreshMessages();
          }, 1000);
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

  // 监听滚动事件，跟踪用户是否在底部附近
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceToBottom = scrollHeight - clientHeight - scrollTop;
      // 允许16px的误差，认为用户在底部附近
      isAtBottomRef.current = distanceToBottom < 16;
    };

    container.addEventListener('scroll', handleScroll);
    handleScroll(); // 初始化一次

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // 消息变化时智能滚动
  useEffect(() => {
    smartScroll();
  }, [messages, smartScroll]);

  // 处理构建日志添加事件，当 AI 任务完成时刷新消息
  const handleBuildLogAdded = useCallback((log: BuildLog) => {
    if (log.message === 'AI 任务处理完成' || log.message.includes('AI 任务处理完成')) {
      console.log('检测到 AI 任务处理完成日志，刷新消息');
      refreshMessages();
    }
  }, [refreshMessages]);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 消息列表区域：使用 flex-col justify-start 确保消息从顶部开始显示（吸顶） */}
      <div
        ref={messagesContainerRef}
        className="flex-1 flex flex-col justify-start overflow-y-auto px-4 py-4"
      >
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-500 text-sm">加载中...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-gray-500 text-sm">暂无对话</p>
              <p className="text-gray-400 text-xs">输入你的指令开始编辑</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map(message => (
              <div
                key={message.id}
                className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
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
                {message.role === 'assistant' && messageImages[message.id] && messageImages[message.id].length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2 max-w-[85%]">
                    {messageImages[message.id].map((imagePath, index) => (
                      <div key={index} className="relative rounded-lg overflow-hidden border border-gray-200 bg-white">
                        {imageBlobUrls[imagePath] ? (
                          <img
                            src={imageBlobUrls[imagePath]}
                            alt={`生成的图片 ${index + 1}`}
                            className="max-w-full h-auto max-h-64 object-contain"
                            loading="lazy"
                            onError={(e) => {
                              console.error('图片加载失败:', imagePath);
                              e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f0f0f0" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%23999"%3E图片加载失败%3C/text%3E%3C/svg%3E';
                            }}
                          />
                        ) : (
                          <div className="w-48 h-48 flex items-center justify-center bg-gray-100">
                            <p className="text-xs text-gray-500">加载中...</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {currentProject && (
        <>
          <ActivityTimeline
            projectId={currentProject.id}
            maxEvents={50}
          />
          <BuildLogPanel
            projectId={currentProject.id}
            onLogAdded={handleBuildLogAdded}
          />
        </>
      )}

      <div className="px-4 py-2 bg-gray-50">
        {!isConnected && projectId && (
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
            placeholder={isConnected ? "输入指令..." : "连接中..."}
            disabled={!isConnected}
            className="flex-1 bg-transparent text-gray-900 placeholder-gray-400 text-sm outline-none resize-none leading-tight py-1.5 overflow-hidden disabled:cursor-not-allowed"
            rows={1}
            style={{ height: '28px', maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || !isConnected}
            className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
          >
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
