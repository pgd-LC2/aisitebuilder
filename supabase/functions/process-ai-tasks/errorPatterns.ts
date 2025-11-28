/**
 * 错误模式配置文件
 * 用于自我修复循环中的错误分类和可修复性判断
 */

// 错误类别枚举
export type ErrorCategory = 
  | 'syntax'      // 语法错误
  | 'type'        // 类型错误
  | 'reference'   // 引用错误
  | 'build'       // 构建错误
  | 'lint'        // Lint 错误
  | 'module'      // 模块/导入错误
  | 'runtime'     // 运行时错误
  | 'misc'        // 其他错误
  | 'unknown';    // 未知错误

// 错误模式定义
export interface ErrorPattern {
  category: ErrorCategory;
  patterns: RegExp[];
  description: string;
  repairable: boolean;
}

// 可修复错误模式配置
export const ERROR_PATTERNS: ErrorPattern[] = [
  {
    category: 'syntax',
    patterns: [
      /SyntaxError/i,
      /Unexpected token/i,
      /Unexpected end of/i,
      /Missing .* in/i,
      /Unterminated string/i,
      /Invalid or unexpected token/i
    ],
    description: '语法错误 - 代码结构或格式问题',
    repairable: true
  },
  {
    category: 'type',
    patterns: [
      /TypeError/i,
      /Type '.*' is not assignable/i,
      /Cannot read propert/i,
      /undefined is not/i,
      /null is not/i,
      /is not a function/i,
      /Expected .* but got/i,
      /Argument of type/i,
      /Property .* does not exist/i
    ],
    description: '类型错误 - 类型不匹配或属性访问问题',
    repairable: true
  },
  {
    category: 'reference',
    patterns: [
      /ReferenceError/i,
      /is not defined/i,
      /Cannot access .* before initialization/i,
      /is not a constructor/i
    ],
    description: '引用错误 - 变量或函数未定义',
    repairable: true
  },
  {
    category: 'module',
    patterns: [
      /Module not found/i,
      /Cannot find module/i,
      /Cannot resolve/i,
      /Failed to resolve/i,
      /Unable to resolve/i,
      /No such file or directory/i,
      /ENOENT/i
    ],
    description: '模块错误 - 导入或模块解析问题',
    repairable: true
  },
  {
    category: 'build',
    patterns: [
      /Build failed/i,
      /Compilation failed/i,
      /Failed to compile/i,
      /npm ERR!/i,
      /Error: Build/i,
      /vite.*error/i,
      /webpack.*error/i,
      /rollup.*error/i
    ],
    description: '构建错误 - 构建或编译失败',
    repairable: true
  },
  {
    category: 'lint',
    patterns: [
      /lint.*error/i,
      /eslint.*error/i,
      /typecheck.*error/i,
      /tsc.*error/i,
      /Parsing error/i,
      /\d+ error/i
    ],
    description: 'Lint 错误 - 代码检查或类型检查失败',
    repairable: true
  },
  {
    category: 'runtime',
    patterns: [
      /RuntimeError/i,
      /Maximum call stack/i,
      /Out of memory/i,
      /Timeout/i
    ],
    description: '运行时错误 - 执行时发生的错误',
    repairable: false
  },
  {
    category: 'misc',
    patterns: [
      /Error:/i,
      /Exception/i,
      /Failed/i
    ],
    description: '其他错误 - 未分类的一般错误',
    repairable: false
  }
];

// 不可修复的错误模式（优先级高于可修复模式）
export const NON_REPAIRABLE_PATTERNS: RegExp[] = [
  /Network error/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /Permission denied/i,
  /EACCES/i,
  /Authentication failed/i,
  /Unauthorized/i,
  /Rate limit/i,
  /Quota exceeded/i,
  /Out of memory/i,
  /ENOMEM/i,
  /Disk full/i,
  /ENOSPC/i
];

/**
 * 判断错误是否可修复
 * @param error 错误对象或错误消息
 * @returns 是否可修复
 */
export function isRepairableError(error: Error | string): boolean {
  const errorMessage = typeof error === 'string' ? error : error.message;
  
  // 首先检查是否匹配不可修复模式
  if (NON_REPAIRABLE_PATTERNS.some(pattern => pattern.test(errorMessage))) {
    return false;
  }
  
  // 检查是否匹配可修复模式
  for (const errorPattern of ERROR_PATTERNS) {
    if (errorPattern.repairable && errorPattern.patterns.some(pattern => pattern.test(errorMessage))) {
      return true;
    }
  }
  
  return false;
}

/**
 * 分类错误类型
 * @param error 错误对象或错误消息
 * @returns 错误类别
 */
export function classifyError(error: Error | string): ErrorCategory {
  const errorMessage = typeof error === 'string' ? error : error.message;
  
  for (const errorPattern of ERROR_PATTERNS) {
    if (errorPattern.patterns.some(pattern => pattern.test(errorMessage))) {
      return errorPattern.category;
    }
  }
  
  return 'unknown';
}

/**
 * 获取错误类别的描述
 * @param category 错误类别
 * @returns 描述文本
 */
export function getErrorCategoryDescription(category: ErrorCategory): string {
  const pattern = ERROR_PATTERNS.find(p => p.category === category);
  return pattern?.description || '未知错误类型';
}

/**
 * 解析 Debugger 输出的结果类型
 */
export interface ParseDebuggerResult {
  success: boolean;
  data?: DebuggerSuggestion;
  error?: string;
}

/**
 * Debugger 建议接口
 */
export interface DebuggerSuggestion {
  rootCause: string;
  errorCategory: string;
  fileModifications: FileModification[];
  verificationCommands: string[];
}

/**
 * 文件修改接口
 */
export interface FileModification {
  path: string;
  action: 'create' | 'modify' | 'delete';
  content?: string;
}

/**
 * 增强的 parseDebuggerOutput 函数
 * 尝试从多种格式中提取 JSON，失败时返回结构化错误而非抛出异常
 * @param content Debugger 输出内容
 * @returns 解析结果
 */
export function parseDebuggerOutput(content: string): ParseDebuggerResult {
  if (!content || typeof content !== 'string') {
    return {
      success: false,
      error: 'Debugger output malformed: 输出内容为空或类型错误'
    };
  }

  // 尝试多种 JSON 提取模式
  const extractionPatterns = [
    // 模式 1: ```json ... ``` 代码块
    /```json\s*([\s\S]*?)\s*```/,
    // 模式 2: ``` ... ``` 代码块（无语言标识）
    /```\s*([\s\S]*?)\s*```/,
    // 模式 3: { ... } JSON 对象（贪婪匹配最外层）
    /(\{[\s\S]*\})/
  ];

  for (const pattern of extractionPatterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      try {
        const jsonStr = match[1].trim();
        const parsed = JSON.parse(jsonStr);
        
        // 验证必要字段
        if (parsed.rootCause && parsed.fileModifications) {
          return {
            success: true,
            data: {
              rootCause: parsed.rootCause || '',
              errorCategory: parsed.errorCategory || 'unknown',
              fileModifications: Array.isArray(parsed.fileModifications) ? parsed.fileModifications : [],
              verificationCommands: Array.isArray(parsed.verificationCommands) ? parsed.verificationCommands : []
            }
          };
        }
      } catch {
        // 继续尝试下一个模式
        continue;
      }
    }
  }

  // 尝试直接解析整个内容
  try {
    const directParse = JSON.parse(content);
    if (directParse.rootCause && directParse.fileModifications) {
      return {
        success: true,
        data: {
          rootCause: directParse.rootCause || '',
          errorCategory: directParse.errorCategory || 'unknown',
          fileModifications: Array.isArray(directParse.fileModifications) ? directParse.fileModifications : [],
          verificationCommands: Array.isArray(directParse.verificationCommands) ? directParse.verificationCommands : []
        }
      };
    }
  } catch {
    // 直接解析也失败
  }

  // 所有尝试都失败
  return {
    success: false,
    error: 'Debugger output malformed: 无法从输出中解析有效的 JSON 修复建议'
  };
}
