import { Plus, Lightbulb, Play, ChevronDown, Send, Ban, PlusSquare, Star, MoreHorizontal } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type InputMode = 'default' | 'plan' | 'build';

// 快捷指令定义
interface QuickCommand {
  id: string;
  name: string;
  icon: 'clear' | 'create' | 'supabase';
  description?: string;
}

interface CommandCategory {
  name: string;
  commands: QuickCommand[];
}

const quickCommands: CommandCategory[] = [
  {
    name: 'Commands',
    commands: [
      { id: 'clear-context', name: 'Clear context', icon: 'clear' },
      { id: 'create-prompt', name: 'Create Prompt', icon: 'create' },
    ]
  },
  {
    name: 'Supabase',
    commands: [
      { 
        id: 'auth-feature', 
        name: '创建登录/注册功能', 
        icon: 'supabase',
        description: '请为我的应用添加 Supabase 身份验证功能，包括：\n1. 用户注册页面\n2. 用户登录页面\n3. 用户管理服务\n4. 登录状态管理\n5. 退出登录功能'
      },
      { id: 'crawler', name: '爬虫实现', icon: 'supabase' },
      { id: 'fix-connection', name: '修复前后端没接上', icon: 'supabase' },
    ]
  },
  {
    name: 'Accessibility',
    commands: []
  }
];

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (mode: InputMode) => void;
  placeholder?: string;
  placeholders?: string[];
  disabled?: boolean;
  isSubmitting?: boolean;
  showAgentSelector?: boolean;
  variant?: 'home' | 'chat';
}

const defaultPlaceholders = [
  "How can Bolt help you today? (or /command)",
  '大地图游戏',
  '企业宣传网站',
  '在线课程平台',
  '电商购物网站',
  '个人作品集',
  '社交媒体应用',
  '任务管理工具'
];

export default function ChatInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  placeholders = defaultPlaceholders,
  disabled = false,
  isSubmitting = false,
  showAgentSelector = true,
  variant = 'home'
}: ChatInputProps) {
  const [currentPlaceholder, setCurrentPlaceholder] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [selectedMode, setSelectedMode] = useState<InputMode>('default');
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [hoveredCommand, setHoveredCommand] = useState<QuickCommand | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commandMenuRef = useRef<HTMLDivElement>(null);

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = 200;
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [value, adjustTextareaHeight]);

  // 检测输入 / 显示命令菜单
  useEffect(() => {
    if (value === '/') {
      setShowCommandMenu(true);
    } else if (!value.startsWith('/')) {
      setShowCommandMenu(false);
    }
  }, [value]);

  // 点击外部关闭命令菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (commandMenuRef.current && !commandMenuRef.current.contains(event.target as Node)) {
        setShowCommandMenu(false);
        setHoveredCommand(null);
      }
    };

    if (showCommandMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCommandMenu]);

  useEffect(() => {
    if (placeholder) return;
    
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentPlaceholder((prev) => (prev + 1) % placeholders.length);
      }, 150);
      setTimeout(() => {
        setIsAnimating(false);
      }, 300);
    }, 3000);

    return () => clearInterval(interval);
  }, [placeholder, placeholders]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showCommandMenu) {
        setShowCommandMenu(false);
        return;
      }
      handleSubmit(selectedMode);
    }
    if (e.key === 'Escape') {
      setShowCommandMenu(false);
      setHoveredCommand(null);
    }
  };

  const handleCommandSelect = (command: QuickCommand) => {
    const commandText = command.description || command.name;
    onChange(commandText);
    setShowCommandMenu(false);
    setHoveredCommand(null);
    textareaRef.current?.focus();
  };

  const renderCommandIcon = (iconType: QuickCommand['icon']) => {
    switch (iconType) {
      case 'clear':
        return <Ban className="w-4 h-4 text-gray-500" />;
      case 'create':
        return <PlusSquare className="w-4 h-4 text-gray-500" />;
      case 'supabase':
        return (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#3ECF8E"/>
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#3ECF8E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
      default:
        return null;
    }
  };

  const handleSubmit = (mode: InputMode) => {
    if (value.trim() && !isSubmitting && !disabled) {
      onSubmit(mode);
    }
  };

  const handleModeSelect = (mode: InputMode) => {
    setSelectedMode(mode);
  };

  const handleBuildClick = () => {
    setSelectedMode('build');
    handleSubmit('build');
  };

  const currentPlaceholderText = placeholder || placeholders[currentPlaceholder];

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden relative">
      {/* 快捷指令菜单 */}
      <AnimatePresence>
        {showCommandMenu && (
          <motion.div
            ref={commandMenuRef}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50 flex"
          >
            {/* 左侧命令列表 */}
            <div className="flex-1 max-h-[400px] overflow-y-auto">
              {quickCommands.map((category) => (
                <div key={category.name}>
                  <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {category.name}
                  </div>
                  {category.commands.map((command) => (
                    <button
                      key={command.id}
                      onClick={() => handleCommandSelect(command)}
                      onMouseEnter={() => setHoveredCommand(command)}
                      onMouseLeave={() => setHoveredCommand(null)}
                      className={`w-full px-4 py-2.5 flex items-center gap-3 hover:bg-blue-50 transition-colors text-left ${
                        hoveredCommand?.id === command.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      {renderCommandIcon(command.icon)}
                      <span className={`text-sm ${hoveredCommand?.id === command.id ? 'text-blue-600' : 'text-gray-700'}`}>
                        {command.name}
                      </span>
                      {command.description && (
                        <div className="ml-auto flex items-center gap-2">
                          <Star className="w-4 h-4 text-gray-300 hover:text-yellow-400 cursor-pointer" />
                          <MoreHorizontal className="w-4 h-4 text-gray-300" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            {/* 右侧预览面板 */}
            {hoveredCommand?.description && (
              <div className="w-80 border-l border-gray-200 bg-gray-50 p-4">
                <h4 className="font-medium text-gray-900 mb-3">{hoveredCommand.name}</h4>
                <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">
                  {hoveredCommand.description}
                </p>
              </div>
            )}

            {/* 底部操作栏 */}
            <div className="absolute bottom-0 left-0 right-0 px-4 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Use Prompt</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">↵</kbd>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Options</span>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">⌘</kbd>
                <kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">K</kbd>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-4 pb-2">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder=""
            disabled={disabled || isSubmitting}
            className="w-full outline-none text-gray-800 bg-transparent resize-none text-base leading-relaxed min-h-[40px] max-h-[200px] disabled:opacity-50 overflow-y-auto"
            rows={1}
          />
          {!value && (
            <div className="absolute left-0 top-0 pointer-events-none overflow-hidden">
              <div
                className={`transition-transform duration-300 ease-in-out ${
                  isAnimating ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'
                }`}
              >
                <span className="text-gray-400 text-base">
                  {currentPlaceholderText}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-3 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="添加附件"
            disabled={disabled}
          >
            <Plus className="w-5 h-5 text-gray-500" />
          </button>

          {showAgentSelector && (
            <button
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={disabled}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#4285F4"/>
                <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-sm text-gray-700 font-medium">Gemini Agent</span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            onClick={() => handleModeSelect('plan')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={disabled || isSubmitting}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedMode === 'plan'
                ? 'bg-amber-100 text-amber-700 border border-amber-300'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Lightbulb className="w-4 h-4" />
            Plan
          </motion.button>

          {variant === 'home' ? (
            <motion.button
              onClick={handleBuildClick}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={!value.trim() || disabled || isSubmitting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isSubmitting ? '创建中...' : 'Build now'}
              {!isSubmitting && <Play className="w-4 h-4 fill-current" />}
            </motion.button>
          ) : (
            <motion.button
              onClick={() => handleSubmit(selectedMode)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={!value.trim() || disabled || isSubmitting}
              className="w-9 h-9 rounded-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <Send className="w-4 h-4 text-white" />
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
