import { Plus, Lightbulb, Play, Users, ChevronDown } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

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
  showUserCount?: boolean;
  userCount?: number;
}

const defaultPlaceholders = [
  "Let's build a prototype to validate",
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
  showUserCount = true,
  userCount = 1
}: ChatInputProps) {
  const [currentPlaceholder, setCurrentPlaceholder] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [selectedMode, setSelectedMode] = useState<InputMode>('default');

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
      handleSubmit(selectedMode);
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
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
      <div className="p-4 pb-2">
        <div className="relative">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder=""
            disabled={disabled || isSubmitting}
            className="w-full outline-none text-gray-800 bg-transparent resize-none text-base leading-relaxed min-h-[60px] disabled:opacity-50"
            rows={2}
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

      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
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
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold">C</span>
              </div>
              <span className="text-sm text-gray-700 font-medium">Claude Agent</span>
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

          {showUserCount && (
            <div className="flex items-center gap-1 px-2 py-1.5 text-gray-500">
              <Users className="w-4 h-4" />
              <span className="text-sm">{userCount}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
