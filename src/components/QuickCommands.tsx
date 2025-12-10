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
    name: '通用指令',
    commands: [
      { 
        id: 'clear-context', 
        name: '清除对话上下文', 
        icon: 'clear',
        description: '清除当前对话的上下文记忆，重新开始一个全新的对话。适合在你想切换话题或重置聊天状态时使用。'
      },
      { 
        id: 'create-prompt', 
        name: '创建提示词模板',
        icon: 'create',
        description: '创建一个新的提示词（Prompt）模板，可以保存常用的指令以便快速复用，支持变量占位和简单条件逻辑。'
      },
    ]
  },
  {
    name: 'Supabase 集成',
    commands: [
      { 
        id: 'auth-feature', 
        name: '创建登录 / 注册功能', 
        icon: 'supabase',
        description: '请为我的应用添加 Supabase 身份验证功能，包括：\n1. 用户注册页面\n2. 用户登录页面\n3. 用户管理服务\n4. 登录状态管理\n5. 退出登录功能'
      },
      { 
        id: 'crawler', 
        name: 'Supabase 爬虫实现', 
        icon: 'supabase',
        description: '实现一个网页爬虫功能，使用 Supabase Edge Functions 定时抓取指定网站的数据，并将结果存储到数据库中。支持自定义抓取规则和数据清洗。'
      },
      { 
        id: 'fix-connection', 
        name: '修复前后端连接问题', 
        icon: 'supabase',
        description: '诊断并修复前端与 Supabase 后端的连接问题。检查 API 密钥配置、CORS 设置、网络请求和响应格式，确保数据能够正常传输，并保证前端不硬编码数据，全部从数据库获取。'
      },
    ]
  },
  {
    name: '无障碍访问（Accessibility）',
    commands: [
      {
        id: 'keyboard-nav',
        name: '键盘导航检查与优化',
        icon: 'accessibility',
        description: '审核并改进应用的键盘导航功能。确保所有交互元素都可以通过 Tab 键访问，添加清晰的焦点样式，并根据需要实现快捷键支持。'
      },
      {
        id: 'focus-management',
        name: '单页应用焦点管理',
        icon: 'accessibility',
        description: '为单页应用设计并实现焦点管理策略。在路由切换时正确移动焦点，让屏幕阅读器用户能感知页面变化，同时添加“跳过导航”链接。'
      },
      {
        id: 'data-tables',
        name: '无障碍数据表格',
        icon: 'accessibility',
        description: '创建符合无障碍标准的数据表格。添加正确的表头标记、行列关联、排序功能的 ARIA 标签，支持键盘操作和屏幕阅读器朗读。'
      },
      {
        id: 'rich-text',
        name: '无障碍富文本内容',
        icon: 'accessibility',
        description: '分析我的文本内容，并提供提升可读性和可访问性的建议。包括合理的标题层级（h1–h6）、段落与行高、文本间距和颜色对比度，并给出通过 CSS 改善阅读障碍或视力障碍用户体验的方案。'
      },
      {
        id: 'aria-landmarks',
        name: 'ARIA 地标区域设计',
        icon: 'accessibility',
        description: '为页面添加 ARIA 地标区域，包括 banner、navigation、main、complementary 和 contentinfo，帮助屏幕阅读器用户快速跳转到页面不同区域。'
      },
    ]
  },
  {
    name: '搜索引擎优化（SEO）',
    commands: [
      {
        id: 'internal-linking',
        name: '站内链接优化策略',
        icon: 'seo',
        description: '分析并优化网站的内部链接结构。规划合理的页面层级与面包屑导航，确保重要页面有足够的内链支持，提升搜索引擎抓取效率。'
      },
      {
        id: 'header-hierarchy',
        name: '标题层级结构优化',
        icon: 'seo',
        description: '优化页面标题（H1–H6）的层级结构。确保每个页面仅有一个 H1，层级递进清晰，并自然融入目标关键词，提升可读性与 SEO 效果。'
      },
      {
        id: 'local-seo',
        name: '本地 SEO 实施方案',
        icon: 'seo',
        description: '为企业网站生成本地 SEO 所需的实现方案与代码示例。包括本地企业结构化数据标记、Google 商家资料集成建议、本地化内容布局，以及在全站保持名称、地址、电话（NAP）信息一致的策略。'
      },
      {
        id: 'content-readability',
        name: '内容可读性分析',
        icon: 'seo',
        description: '分析内容的可读性指标，如句子长度、段落结构、被动语态比例等，并给出改写和结构优化建议，以提升用户体验和搜索引擎排名。'
      },
      {
        id: 'image-seo',
        name: '图片 SEO 优化',
        icon: 'seo',
        description: '优化网站图片的 SEO 表现。添加有描述性的 alt 文本、优化文件名、实现懒加载、压缩图片大小，并生成合适的 srcset 响应式图片配置。'
      },
    ]
  },
  {
    name: '易用性与用户体验',
    commands: [
      {
        id: 'form-simplification',
        name: '表单简化与优化',
        icon: 'usability',
        description: '简化表单设计以提升填写体验。减少必填字段、添加合理默认值、支持自动填充，对长表单进行分步引导，降低用户流失。'
      },
      {
        id: 'nav-optimization',
        name: '导航菜单优化',
        icon: 'usability',
        description: '优化网站导航结构和交互。实现响应式导航、添加站内搜索、梳理菜单层级、强化当前状态与悬停反馈，提升用户寻找内容的效率。'
      },
      {
        id: 'input-validation',
        name: '表单验证用户体验',
        icon: 'usability',
        description: '生成实现用户友好型表单验证的代码与策略，包括内联实时验证、错误预防提示、清晰有用的错误消息以及提交成功后的反馈，降低表单放弃率。'
      },
      {
        id: 'inclusive-design',
        name: '包容性设计模式',
        icon: 'usability',
        description: '实施包容性设计，让更多用户都能顺利使用。包括色盲友好的配色方案、足够大的触控区域、清晰易懂的错误提示，以及支持多种输入方式。'
      },
      {
        id: 'microcopy',
        name: '界面微文案优化',
        icon: 'usability',
        description: '优化界面中的微文案，例如按钮文字、提示信息、空状态文案和错误提示等。使用清晰、友好且统一的语气，帮助用户理解和完成任务。'
      },
    ]
  },
  {
    name: '通用功能与配置',
    commands: [
      {
        id: 'dark-mode',
        name: '深色模式实现',
        icon: 'misc',
        description: '为应用实现深色模式支持。设计完整的深色主题配色方案，实现主题切换控件，保存用户偏好，并支持根据系统主题自动切换。'
      },
      {
        id: 'i18n-setup',
        name: '国际化（i18n）配置',
        icon: 'misc',
        description: '为应用配置国际化支持。集成 i18n 库、提取可翻译文案、实现语言切换，并正确本地化日期、时间和数字格式。'
      },
      {
        id: 'error-handling',
        name: '错误处理策略',
        icon: 'misc',
        description: '实现全面的错误处理机制，包括全局错误边界、API 错误处理、用户友好的错误提示，以及错误日志记录与监控平台集成。'
      },
      {
        id: 'web-manifest',
        name: 'Web App Manifest 生成',
        icon: 'misc',
        description: '生成 PWA 所需的 Web App Manifest 文件。配置应用名称、图标、主题色、启动方式等，使应用可以被安装到用户设备。'
      },
    ]
  },
  {
    name: '工作流与文档',
    commands: [
      {
        id: 'component-docs',
        name: '组件文档模板',
        icon: 'workflow',
        description: '为 React 组件生成标准化文档模板。包括组件简介、 Props 说明、使用示例与注意事项，可适配 Storybook 或 MDX 格式。'
      },
      {
        id: 'api-docs',
        name: 'API 文档生成器',
        icon: 'workflow',
        description: '为 API 端点生成完整文档。包含请求与响应示例、鉴权要求、错误结构和 HTTP 状态码说明，并推荐可随 API 演进而自动更新的文档工具。'
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
