import { Ban, PlusSquare, Star, MoreHorizontal, Search, Hand, Sparkles, GitBranch, Accessibility } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CommandIconType, QuickCommand, CommandCategory } from '../../types/quickCommands';
import { defaultQuickCommands } from '../../data/quickCommands';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export type { CommandIconType, QuickCommand, CommandCategory };

interface QuickCommandsProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (command: QuickCommand) => void;
  commands?: CommandCategory[];
}

function renderCommandIcon(iconType: CommandIconType) {
  switch (iconType) {
    case 'clear':
      return <Ban className="w-4 h-4 text-muted-foreground" />;
    case 'create':
      return <PlusSquare className="w-4 h-4 text-muted-foreground" />;
    case 'supabase':
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#3ECF8E"/>
          <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#3ECF8E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    case 'accessibility':
      return <Accessibility className="w-4 h-4 text-blue-500" />;
    case 'seo':
      return <Search className="w-4 h-4 text-orange-500" />;
    case 'usability':
      return <Hand className="w-4 h-4 text-purple-500" />;
    case 'misc':
      return <Sparkles className="w-4 h-4 text-yellow-500" />;
    case 'workflow':
      return <GitBranch className="w-4 h-4 text-green-500" />;
    default:
      return null;
  }
}

export default function QuickCommands({
  isOpen,
  onClose,
  onSelect,
  commands = defaultQuickCommands
}: QuickCommandsProps) {
  const [hoveredCommand, setHoveredCommand] = useState<QuickCommand | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearHoverWithDelay = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredCommand(null);
    }, 150);
  }, []);

  const setHoverCommand = useCallback((command: QuickCommand) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredCommand(command);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
        setHoveredCommand(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        setHoveredCommand(null);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [isOpen, onClose]);

  const handleCommandClick = (command: QuickCommand) => {
    onSelect(command);
    setHoveredCommand(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.15 }}
          className="absolute bottom-full left-0 mb-2 bg-popover rounded-xl shadow-xl border overflow-hidden z-50 flex w-[720px] max-h-[60vh]"
          onMouseLeave={clearHoverWithDelay}
        >
          <div className="flex-1 flex flex-col min-w-0 max-w-[400px]">
            <ScrollArea className="flex-1 max-h-[400px]">
              {commands.map((category) => (
                <div key={category.name}>
                  <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {category.name}
                  </div>
                  {category.commands.map((command) => (
                    <button
                      key={command.id}
                      onClick={() => handleCommandClick(command)}
                      onMouseEnter={() => setHoverCommand(command)}
                      className={cn(
                        "w-full px-4 py-2.5 flex items-center gap-3 hover:bg-accent transition-colors text-left",
                        hoveredCommand?.id === command.id && 'bg-accent'
                      )}
                    >
                      {renderCommandIcon(command.icon)}
                      <span className={cn(
                        "text-sm flex-1 truncate",
                        hoveredCommand?.id === command.id ? 'text-primary' : 'text-foreground'
                      )}>
                        {command.name}
                      </span>
                      {hoveredCommand?.id === command.id && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Star className="w-4 h-4 text-muted-foreground/50 hover:text-yellow-400 cursor-pointer" />
                          <MoreHorizontal className="w-4 h-4 text-muted-foreground/50" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </ScrollArea>

            <div className="px-4 py-2 bg-muted border-t flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Use Prompt</span>
                <kbd className="px-1.5 py-0.5 bg-muted-foreground/20 rounded text-muted-foreground">↵</kbd>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Options</span>
                <kbd className="px-1.5 py-0.5 bg-muted-foreground/20 rounded text-muted-foreground">⌘</kbd>
                <kbd className="px-1.5 py-0.5 bg-muted-foreground/20 rounded text-muted-foreground">K</kbd>
              </div>
            </div>
          </div>

          <div className="w-80 border-l bg-muted flex-shrink-0">
            {hoveredCommand ? (
              <div className="p-4">
                <h4 className="font-medium mb-3">{hoveredCommand.name}</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                  {hoveredCommand.description}
                </p>
              </div>
            ) : (
              <div className="p-4 flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground/70 text-center">
                  将鼠标悬停在左侧指令上<br />查看详细信息
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
