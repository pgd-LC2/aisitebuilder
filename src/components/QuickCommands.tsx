import { Ban, PlusSquare, Star, MoreHorizontal } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type CommandIconType = 'clear' | 'create' | 'supabase';

export interface QuickCommand {
  id: string;
  name: string;
  icon: CommandIconType;
  description?: string;
}

export interface CommandCategory {
  name: string;
  commands: QuickCommand[];
}

const defaultQuickCommands: CommandCategory[] = [
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

interface QuickCommandsProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (command: QuickCommand) => void;
  commands?: CommandCategory[];
}

function renderCommandIcon(iconType: CommandIconType) {
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
}

export default function QuickCommands({
  isOpen,
  onClose,
  onSelect,
  commands = defaultQuickCommands
}: QuickCommandsProps) {
  const [hoveredCommand, setHoveredCommand] = useState<QuickCommand | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
          className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50 flex"
        >
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 max-h-[400px] overflow-y-auto">
              {commands.map((category) => (
                <div key={category.name}>
                  <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {category.name}
                  </div>
                  {category.commands.map((command) => (
                    <button
                      key={command.id}
                      onClick={() => handleCommandClick(command)}
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

            <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
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
          </div>

          <AnimatePresence>
            {hoveredCommand?.description && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 320 }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="border-l border-gray-200 bg-gray-50 overflow-hidden"
              >
                <div className="w-80 p-4">
                  <h4 className="font-medium text-gray-900 mb-3">{hoveredCommand.name}</h4>
                  <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">
                    {hoveredCommand.description}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { defaultQuickCommands };
