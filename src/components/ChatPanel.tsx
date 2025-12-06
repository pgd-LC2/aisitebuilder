import { Send, Lightbulb, X } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProject } from '../contexts/ProjectContext';
import { useWorkflow } from '../contexts/WorkflowContext';
import { buildLogService } from '../services/buildLogService';
import { messageService } from '../services/messageService';
import { aiTaskService } from '../services/aiTaskService';
import { ProjectFilesContext, BuildLog } from '../types/project';
import { useAgentEvents } from '../realtime';
import BuildLogPanel from './BuildLogPanel';
import ActivityTimeline from './ActivityTimeline';
import ImplementationTrigger, { parseImplementReadyMarker } from './ImplementationTrigger';

interface ChatPanelProps {
  projectFilesContext?: ProjectFilesContext;
}

export default function ChatPanel({ projectFilesContext }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const { currentProject } = useProject();
  const { 
    mode, 
    isPlanningMode, 
    isBuildMode, 
    enterPlanningMode, 
    exitToDefaultMode,
    planSummary
  } = useWorkflow();
  const projectId = currentProject?.id;
  
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // 标记是否已完成初始滚动（打开网页时滚动到底部）
  const hasInitialScrollRef = useRef(false);

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

  // 吸顶滚动：将指定消息滚动到视口顶部
  const scrollToMessageTop = useCallback((messageId: string) => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollHeight, clientHeight } = container;
    // 如果内容还不够一屏，保持从顶部开始，不用动 scrollTop
    if (scrollHeight <= clientHeight) {
      container.scrollTop = 0;
      return;
    }

    // 找到目标消息元素，将其滚动到容器顶部
    const target = container.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (!target) return;

    // 使用 getBoundingClientRect 计算目标消息相对于容器的偏移量
    // 这种方法不依赖 offsetParent，更加可靠
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    
    // target 到容器顶部的"视觉距离" + 当前 scrollTop = 目标 scrollTop
    const offset = targetRect.top - containerRect.top + container.scrollTop;
    container.scrollTop = offset;
  }, []);

  // 滚动到底部：将指定消息滚动到视口底部（用于打开网页时显示最新消息）
  const scrollToMessageBottom = useCallback((messageId: string) => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollHeight, clientHeight } = container;
    // 如果内容不够一屏，保持从顶部开始
    if (scrollHeight <= clientHeight) {
      container.scrollTop = 0;
      return;
    }

    const target = container.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (!target) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    // 目标消息底部相对于容器顶部的偏移 + 当前 scrollTop
    const targetBottomOffset = targetRect.bottom - containerRect.top + container.scrollTop;

    // 让消息"贴在容器底部"：bottomOffset - clientHeight
    const desiredScrollTop = targetBottomOffset - clientHeight;

    const maxScrollTop = scrollHeight - clientHeight;
    container.scrollTop = Math.min(desiredScrollTop, maxScrollTop);
  }, []);

  // 初始滚动：打开网页时自动滚动到最下方（显示最新消息）
  // 使用 messages 数组作为依赖，确保在消息完全加载后执行
  useEffect(() => {
    if (hasInitialScrollRef.current) return;
    if (!isConnected) return;
    if (!messagesContainerRef.current) return;
    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;

    // 使用双重 requestAnimationFrame 确保 DOM 完全渲染后再执行滚动
    // 第一个 rAF 等待 React 提交 DOM 更新，第二个 rAF 等待浏览器完成布局
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // 再次检查条件，防止在等待期间状态发生变化
        if (hasInitialScrollRef.current) return;
        if (!messagesContainerRef.current) return;
        
        // 获取当前最新的消息（可能在等待期间有新消息加载）
        const container = messagesContainerRef.current;
        const allMessageElements = container.querySelectorAll('[data-message-id]');
        if (allMessageElements.length === 0) return;
        
        const lastMessageElement = allMessageElements[allMessageElements.length - 1];
        const lastMessageId = lastMessageElement.getAttribute('data-message-id');
        if (!lastMessageId) return;
        
        scrollToMessageBottom(lastMessageId);
        hasInitialScrollRef.current = true;
      });
    });
  }, [isConnected, messages, scrollToMessageBottom]);

  const getTaskTypeFromMode = useCallback((): 'chat_reply' | 'build_site' | 'refactor_code' => {
    if (isBuildMode) {
      return 'build_site';
    }
    return 'chat_reply';
  }, [isBuildMode]);

  const handleSend = async () => {
    if (!input.trim() || !projectId) return;

    const messageContent = input;
    setInput('');

    const taskType = getTaskTypeFromMode();
    console.log('发送消息:', messageContent, '模式:', mode, '任务类型:', taskType, '时间:', new Date().toISOString());
    
    const { data: userMsg, error } = await messageService.addMessage(
      projectId,
      'user',
      messageContent
    );

    console.log('消息保存结果:', { userMsg, error });

    if (userMsg) {
      appendMessage(userMsg);
      requestAnimationFrame(() => {
        scrollToMessageTop(userMsg.id);
      });
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
      // 方案B: 构建任务 payload，在 build_site 模式下传递 planSummary
      const taskPayload: Record<string, unknown> = {
        messageId: userMsg.id,
        content: messageContent,
        workflowMode: mode
      };
      
      // 如果是 build_site 模式且有 planSummary，添加到 payload
      if (taskType === 'build_site' && planSummary) {
        taskPayload.requirement = planSummary.requirement;
        taskPayload.planSummary = {
          requirement: planSummary.requirement,
          technicalPlan: planSummary.technicalPlan,
          implementationSteps: planSummary.implementationSteps
        };
        console.log('构建模式: 传递规划摘要到任务', taskPayload.planSummary);
      }
      
      const { data: task, error: taskError } = await aiTaskService.addTask(
        projectId,
        taskType,
        taskPayload
      );

      if (taskError) {
        console.error('创建 AI 任务失败:', taskError);
      } else {
        console.log('AI 任务已创建:', task);
        
        console.log('开始触发 Edge Function 处理任务...');
        
        const { error: triggerError } = await aiTaskService.triggerProcessor(
          projectId,
          projectFilesContext
        );
        
        if (triggerError) {
          console.error('Edge Function 处理失败:', triggerError);
          await buildLogService.addBuildLog(
            projectId,
            'error',
            '触发 AI 任务处理失败，请稍后重试'
          );
        } else {
          console.log('Edge Function 处理完成');
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

  // 处理构建日志添加事件，当 AI 任务完成时刷新消息
  const handleBuildLogAdded = useCallback((log: BuildLog) => {
    if (log.message === 'AI 任务处理完成' || log.message.includes('AI 任务处理完成')) {
      console.log('检测到 AI 任务处理完成日志，刷新消息');
      refreshMessages();
    }
  }, [refreshMessages]);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 消息列表区域：使用 flex-col 确保消息从顶部开始显示（吸顶）
          关键布局：
          1. 外层容器 overflow-y-auto 负责滚动
          2. 内层使用 min-h-full 确保内容至少占满容器高度
          3. 底部 spacer (flex-grow) 在消息少时撑满空白，在消息多时提供额外滚动空间
          4. 这样才能让最后一条消息有足够的空间滚动到视口顶部（吸顶效果）
      */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
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
          <div className="flex flex-col min-h-full">
            <div className="space-y-3">
              {messages.map(message => {
                const planSummary = message.role === 'assistant' && isPlanningMode 
                  ? parseImplementReadyMarker(message.content) 
                  : null;
                const displayContent = planSummary 
                  ? message.content.replace(/\[IMPLEMENT_READY\][\s\S]*?\[\/IMPLEMENT_READY\]/g, '').replace(/\[IMPLEMENT_READY\]/g, '').trim()
                  : message.content;
                
                return (
                  <div
                    key={message.id}
                    data-message-id={message.id}
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
                        {displayContent}
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
                    {planSummary && (
                      <ImplementationTrigger
                        planSummary={planSummary}
                        onImplement={() => {
                          console.log('[ChatPanel] 用户点击开始实现，规划摘要:', planSummary);
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {/* 底部 spacer：提供额外的滚动空间，让最后一条消息可以滚动到视口顶部
                使用 flex-grow 在消息少时自然撑满空白区域
                min-h-[100vh] 确保在消息多时提供至少一个视口高度的额外空间 */}
            <div className="flex-grow min-h-[100vh]" />
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

      <div className="px-4 py-3 bg-gray-50">
        {!isConnected && projectId && (
          <div className="mb-2 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs text-yellow-700">连接中，请稍候...</p>
          </div>
        )}
        <AnimatePresence>
          {isPlanningMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-600" />
                <span className="text-xs text-amber-700 font-medium">规划模式</span>
                <span className="text-xs text-amber-600">AI 将帮助你澄清需求和制定方案</span>
              </div>
              <button
                onClick={exitToDefaultMode}
                className="p-1 hover:bg-amber-100 rounded transition-colors"
                title="退出规划模式"
              >
                <X className="w-3.5 h-3.5 text-amber-600" />
              </button>
            </motion.div>
          )}
          {isBuildMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-green-600" />
                <span className="text-xs text-green-700 font-medium">构建模式</span>
                <span className="text-xs text-green-600">AI 正在按计划执行代码修改</span>
              </div>
              <button
                onClick={exitToDefaultMode}
                className="p-1 hover:bg-green-100 rounded transition-colors"
                title="退出构建模式"
              >
                <X className="w-3.5 h-3.5 text-green-600" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 bg-white rounded-2xl pl-4 py-2 pr-2 border border-gray-300 focus-within:border-blue-500 transition-colors shadow-sm">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={
                isPlanningMode 
                  ? "描述你的需求，AI 将帮助你制定方案..." 
                  : isBuildMode 
                    ? "输入指令，AI 将执行代码修改..." 
                    : isConnected 
                      ? "输入指令..." 
                      : "连接中..."
              }
              disabled={!isConnected}
              className="flex-1 bg-transparent text-gray-900 placeholder-gray-400 text-sm outline-none resize-none leading-tight py-1 overflow-hidden disabled:cursor-not-allowed"
              rows={1}
              style={{ height: '32px', maxHeight: '120px' }}
            />
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {!isPlanningMode && !isBuildMode && (
                <motion.button
                  onClick={enterPlanningMode}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-medium rounded-full transition-colors"
                  title="进入规划模式"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  Plan
                </motion.button>
              )}
              <button
                onClick={handleSend}
                disabled={!input.trim() || !isConnected}
                className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              >
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
