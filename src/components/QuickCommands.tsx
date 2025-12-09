import { Ban, PlusSquare, Star, MoreHorizontal, Search, Hand, Sparkles, GitBranch, Accessibility } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type CommandIconType = 'clear' | 'create' | 'supabase' | 'accessibility' | 'seo' | 'usability' | 'misc' | 'workflow';

export interface QuickCommand {
  id: string;
  name: string;
  icon: CommandIconType;
  description: string;
}

export interface CommandCategory {
  name: string;
  commands: QuickCommand[];
}

const defaultQuickCommands: CommandCategory[] = [
  {
    name: 'Commands',
    commands: [
      { 
        id: 'clear-context', 
        name: 'Clear context', 
        icon: 'clear',
        description: '清除当前对话的上下文记忆，开始一个全新的对话。这在你想要切换话题或重新开始时非常有用。'
      },
      { 
        id: 'create-prompt', 
        name: 'Create Prompt', 
        icon: 'create',
        description: '创建一个新的提示词模板，可以保存常用的指令以便快速复用。支持变量替换和条件逻辑。'
      },
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
      { 
        id: 'crawler', 
        name: '爬虫实现', 
        icon: 'supabase',
        description: '实现一个网页爬虫功能，使用 Supabase Edge Functions 定时抓取指定网站的数据，并将结果存储到数据库中。支持自定义抓取规则和数据清洗。'
      },
      { 
        id: 'fix-connection', 
        name: '修复前后端没接上', 
        icon: 'supabase',
        description: '诊断并修复前端与 Supabase 后端的连接问题。检查 API 密钥配置、CORS 设置、网络请求和响应格式，确保数据能够正常传输。并且保证前端不要硬编码数据 应全部从数据库调取'
      },
    ]
  },
  {
    name: 'Accessibility',
    commands: [
      {
        id: 'keyboard-nav',
        name: 'Keyboard Navigation Audit',
        icon: 'accessibility',
        description: '审核并改进应用的键盘导航功能。确保所有交互元素都可以通过 Tab 键访问，添加适当的焦点样式，实现快捷键支持。'
      },
      {
        id: 'focus-management',
        name: 'Focus Management for Single Page A...',
        icon: 'accessibility',
        description: '为单页应用实现焦点管理策略。在路由切换时正确移动焦点，确保屏幕阅读器用户能够感知页面变化，添加跳过导航链接。'
      },
      {
        id: 'data-tables',
        name: 'Accessible Data Tables',
        icon: 'accessibility',
        description: '创建符合无障碍标准的数据表格。添加适当的表头标记、行列关联、排序功能的 ARIA 标签，支持键盘操作和屏幕阅读器。'
      },
      {
        id: 'rich-text',
        name: 'Accessible Rich Text Content',
        icon: 'accessibility',
        description: '分析我的文本内容，并提供提高可读性和可访问性的建议。包括适当的标题结构（h1-h6）、文本间距、行高和颜色对比度。建议通过CSS更改来改善阅读障碍或视力障碍用户的可读性。'
      },
      {
        id: 'aria-landmarks',
        name: 'ARIA Landmark Regions',
        icon: 'accessibility',
        description: '为页面添加 ARIA 地标区域，包括 banner、navigation、main、complementary 和 contentinfo。帮助屏幕阅读器用户快速导航到页面的不同部分。'
      },
    ]
  },
  {
    name: 'SEO',
    commands: [
      {
        id: 'internal-linking',
        name: 'Internal Linking Strategy',
        icon: 'seo',
        description: '分析并优化网站的内部链接结构。创建合理的页面层级，添加面包屑导航，确保重要页面有足够的内链支持，提升搜索引擎爬取效率。'
      },
      {
        id: 'header-hierarchy',
        name: 'Header Hierarchy Optimization',
        icon: 'seo',
        description: '优化页面的标题层级结构。确保每个页面只有一个 H1，标题层级递进合理，包含目标关键词，提升内容的可读性和 SEO 效果。'
      },
      {
        id: 'local-seo',
        name: 'Local SEO Implementation',
        icon: 'seo',
        description: '为我的企业网站生成实现本地SEO元素的代码。包括本地企业的结构化数据标记、Google商家资料集成建议、特定位置的内容，以及在所有页面上保持名称、地址、电话（NAP）信息一致性的实施方案。'
      },
      {
        id: 'content-readability',
        name: 'Content Readability Analysis',
        icon: 'seo',
        description: '分析内容的可读性评分，包括句子长度、段落结构、被动语态使用等。提供改进建议以提升用户体验和搜索引擎排名。'
      },
      {
        id: 'image-seo',
        name: 'Image SEO Enhancement',
        icon: 'seo',
        description: '优化网站图片的 SEO 表现。添加描述性的 alt 文本、优化文件名、实现懒加载、压缩图片大小，并生成适当的 srcset 响应式图片。'
      },
    ]
  },
  {
    name: 'Usability',
    commands: [
      {
        id: 'form-simplification',
        name: 'Form Simplification',
        icon: 'usability',
        description: '简化表单设计以提升用户体验。减少必填字段、添加智能默认值、实现自动填充、分步骤展示长表单，降低用户填写负担。'
      },
      {
        id: 'nav-optimization',
        name: 'Navigation Menu Optimization',
        icon: 'usability',
        description: '优化导航菜单的结构和交互。实现响应式导航、添加搜索功能、优化菜单层级、添加视觉反馈，提升用户找到目标内容的效率。'
      },
      {
        id: 'input-validation',
        name: 'Input Validation UX',
        icon: 'usability',
        description: '生成实现用户友好型表单验证的代码，以提供清晰、即时的反馈。包括内联验证、错误预防、有用的错误提示以及提交成功确认的策略。重点在于减少表单放弃和用户挫败感。'
      },
      {
        id: 'inclusive-design',
        name: 'Inclusive Design Patterns',
        icon: 'usability',
        description: '实现包容性设计模式，确保应用对所有用户友好。包括色盲友好的配色、足够的触摸目标大小、清晰的错误提示、多种输入方式支持。'
      },
      {
        id: 'microcopy',
        name: 'Microcopy Optimization',
        icon: 'usability',
        description: '优化界面中的微文案，包括按钮文字、提示信息、错误消息等。使用清晰、友好、一致的语言风格，帮助用户理解和完成任务。'
      },
    ]
  },
  {
    name: 'Misc',
    commands: [
      {
        id: 'dark-mode',
        name: 'Dark Mode Implementation',
        icon: 'misc',
        description: '为应用实现深色模式支持。创建深色主题配色方案、实现主题切换功能、保存用户偏好、支持系统主题自动检测。'
      },
      {
        id: 'i18n-setup',
        name: 'Internationalization Setup',
        icon: 'misc',
        description: '设置应用的国际化支持。配置 i18n 库、提取可翻译文本、实现语言切换、处理日期时间和数字格式的本地化。'
      },
      {
        id: 'error-handling',
        name: 'Error Handling Strategy',
        icon: 'misc',
        description: '实现全面的错误处理策略。包括全局错误边界、API 错误处理、用户友好的错误提示、错误日志记录和监控集成。'
      },
      {
        id: 'web-manifest',
        name: 'Web App Manifest Generator',
        icon: 'misc',
        description: '生成 PWA 所需的 Web App Manifest 文件。配置应用名称、图标、主题色、启动画面等，使应用可以安装到用户设备上。'
      },
    ]
  },
  {
    name: 'Workflow',
    commands: [
      {
        id: 'component-docs',
        name: 'Component Documentation Template',
        icon: 'workflow',
        description: '为 React 组件生成文档模板。包括组件描述、Props 说明、使用示例、注意事项，支持 Storybook 或 MDX 格式。'
      },
      {
        id: 'api-docs',
        name: 'API Documentation Generator',
        icon: 'workflow',
        description: '为我的 API 端点生成全面的文档。包括请求/响应示例、身份验证要求、错误处理和状态码。创建一个可随着 API 扩展而扩展的模板。推荐用于自动生成 API 文档的工具。'
      },
    ]
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
          className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50 flex w-[720px] max-h-[60vh]"
          onMouseLeave={clearHoverWithDelay}
        >
          <div className="flex-1 flex flex-col min-w-0 max-w-[400px]">
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
                      onMouseEnter={() => setHoverCommand(command)}
                      className={`w-full px-4 py-2.5 flex items-center gap-3 hover:bg-blue-50 transition-colors text-left ${
                        hoveredCommand?.id === command.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      {renderCommandIcon(command.icon)}
                      <span className={`text-sm flex-1 truncate ${hoveredCommand?.id === command.id ? 'text-blue-600' : 'text-gray-700'}`}>
                        {command.name}
                      </span>
                      {hoveredCommand?.id === command.id && (
                        <div className="flex items-center gap-2 flex-shrink-0">
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

          <div className="w-80 border-l border-gray-200 bg-gray-50 flex-shrink-0">
            {hoveredCommand ? (
              <div className="p-4">
                <h4 className="font-medium text-gray-900 mb-3">{hoveredCommand.name}</h4>
                <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">
                  {hoveredCommand.description}
                </p>
              </div>
            ) : (
              <div className="p-4 flex items-center justify-center h-full">
                <p className="text-sm text-gray-400 text-center">
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

export { defaultQuickCommands };
