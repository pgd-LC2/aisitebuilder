import { Plus, Lightbulb, Play, ChevronDown, Send } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import QuickCommands, { QuickCommand } from './QuickCommands';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

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

  const handleBuildClick= () => {
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

      <Card className="overflow-hidden shadow-sm">
        <div className="p-4 pb-2">
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder=""
              disabled={disabled || isSubmitting}
              className="w-full border-0 bg-transparent resize-none text-base leading-relaxed min-h-[40px] max-h-[200px] focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
              rows={1}
            />
            {!value && (
              <div className="absolute left-0 top-0 pointer-events-none overflow-hidden">
                <div
                  className={cn(
                    "transition-transform duration-300 ease-in-out",
                    isAnimating ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'
                  )}
                >
                  <span className="text-muted-foreground text-base">
                    {currentPlaceholderText}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-3 border-t flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              title="添加附件"
              disabled={disabled}
            >
              <Plus className="w-5 h-5" />
            </Button>

            {showAgentSelector && (
              <Button
                variant="ghost"
                className="flex items-center gap-2"
                disabled={disabled}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#4285F4"/>
                  <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-sm font-medium">Gemini</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <ToggleGroup
              type="single"
              value={selectedMode === 'default' ? '' : selectedMode}
              onValueChange={(value) => {
                if (value) {
                  setSelectedMode(value as InputMode);
                } else {
                  setSelectedMode('default');
                }
              }}
              className="rounded-full border bg-background"
              disabled={disabled || isSubmitting}
            >
              <ToggleGroupItem
                value="plan"
                aria-label="Plan mode"
                className={cn(
                  "rounded-l-full px-4 data-[state=on]:bg-warning/20 data-[state=on]:text-warning",
                  "flex items-center gap-1.5"
                )}
              >
                <Lightbulb className="w-4 h-4" />
                <span>Plan</span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="build"
                aria-label="Build mode"
                className={cn(
                  "rounded-r-full px-4 data-[state=on]:bg-success/20 data-[state=on]:text-success",
                  "flex items-center gap-1.5"
                )}
              >
                <Play className="w-4 h-4" />
                <span>Build</span>
              </ToggleGroupItem>
            </ToggleGroup>

            {variant === 'home' ? (
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={handleBuildClick}
                  disabled={!value.trim() || disabled || isSubmitting}
                  className="flex items-center gap-2"
                >
                  {isSubmitting ? '创建中...' : 'Build now'}
                  {!isSubmitting && <Play className="w-4 h-4 fill-current" />}
                </Button>
              </motion.div>
            ) : (
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={() => handleSubmit(selectedMode)}
                  disabled={!value.trim() || disabled || isSubmitting}
                  size="icon"
                  className="rounded-full"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </motion.div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
