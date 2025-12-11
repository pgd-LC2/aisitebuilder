import { Plus, Lightbulb, Play, ChevronDown, Send } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import QuickCommands, { QuickCommand } from './QuickCommands';

export type InputMode = 'default' | 'plan' | 'build';

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    }
  };

  const handleCommandSelect = (command: QuickCommand) => {
    const commandText = command.description || command.name;
    onChange(commandText);
    setShowCommandMenu(false);
    textareaRef.current?.focus();
  };

  const handleCloseCommandMenu = () => {
    setShowCommandMenu(false);
  };

  const handleSubmit = (mode: InputMode) => {
    if (value.trim() && !isSubmitting && !disabled) {
      onSubmit(mode);
    }
  };

  const handleModeSelect = (mode: InputMode) => {
    setSelectedMode(prev => prev === mode ? 'default' : mode);
  };

  const handleBuildClick = () => {
    setSelectedMode('build');
    handleSubmit('build');
  };

  const currentPlaceholderText = placeholder || placeholders[currentPlaceholder];

  return (
    <div className="relative">
      <QuickCommands
        isOpen={showCommandMenu}
        onClose={handleCloseCommandMenu}
        onSelect={handleCommandSelect}
      />

      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
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
          {/* Plan / Build 分段按钮 - Liquid Glass 胶囊型设计 */}
          <div className="inline-flex rounded-full backdrop-blur-md bg-white/15 border border-white/30 shadow-[0_4px_12px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.2)] overflow-hidden">
            <motion.button
              onClick={() => handleModeSelect('plan')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={disabled || isSubmitting}
              className={`relative flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-all duration-200 overflow-hidden ${
                selectedMode === 'plan'
                  ? 'bg-amber-500/20 text-amber-700 shadow-[inset_0_0_12px_rgba(245,158,11,0.15)]'
                  : 'text-gray-600 hover:bg-white/20'
              }`}
            >
              <Lightbulb className="w-4 h-4 relative z-10" />
              <span className="relative z-10">Plan</span>
            </motion.button>
            <div className="w-px bg-white/20" />
            <motion.button
              onClick={() => handleModeSelect('build')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={disabled || isSubmitting}
              className={`relative flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-all duration-200 overflow-hidden ${
                selectedMode === 'build'
                  ? 'bg-green-500/20 text-green-700 shadow-[inset_0_0_12px_rgba(34,197,94,0.15)]'
                  : 'text-gray-600 hover:bg-white/20'
              }`}
            >
              <Play className="w-4 h-4 relative z-10" />
              <span className="relative z-10">Build</span>
            </motion.button>
          </div>

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
    </div>
  );
}
