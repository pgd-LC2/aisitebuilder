/**
 * Debugger 模块
 * 负责错误诊断和修复建议生成
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { MODEL_CONFIG } from '../config.ts';
import type { 
  ErrorContext, 
  DebuggerSuggestion, 
  ToolContext,
  PromptRouterContext,
  ChatMessage
} from '../types.ts';
import { assembleSystemPrompt } from '../prompts/router.ts';
import { callOpenRouterChatCompletionsApi } from '../llm/client.ts';
import { handleGetProjectStructure } from '../tools/fileOperations.ts';

// --- 错误模式配置 ---

interface ErrorPattern {
  category: string;
  patterns: RegExp[];
  description: string;
  repairable: boolean;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    category: 'syntax',
    patterns: [
      /SyntaxError/i,
      /Unexpected token/i,
      /Unexpected end of/i,
      /Missing semicolon/i,
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
      /Property '.*' does not exist/i,
      /Cannot read propert/i,
      /is not a function/i,
      /TS\d{4}:/i
    ],
    description: '类型错误 - TypeScript 类型不匹配',
    repairable: true
  },
  {
    category: 'reference',
    patterns: [
      /ReferenceError/i,
      /is not defined/i,
      /Cannot find name/i,
      /Cannot find module/i
    ],
    description: '引用错误 - 变量或模块未定义',
    repairable: true
  },
  {
    category: 'module',
    patterns: [
      /Module not found/i,
      /Cannot resolve/i,
      /Failed to resolve/i,
      /Could not find a declaration file/i,
      /ERR_MODULE_NOT_FOUND/i
    ],
    description: '模块错误 - 依赖或导入问题',
    repairable: true
  },
  {
    category: 'build',
    patterns: [
      /Build failed/i,
      /Compilation failed/i,
      /error during build/i,
      /vite.*error/i,
      /rollup.*error/i
    ],
    description: '构建错误 - 编译或打包失败',
    repairable: true
  },
  {
    category: 'lint',
    patterns: [
      /ESLint/i,
      /Parsing error/i,
      /no-unused-vars/i,
      /prefer-const/i
    ],
    description: 'Lint 错误 - 代码风格问题',
    repairable: true
  },
  {
    category: 'runtime',
    patterns: [
      /at runtime/i,
      /Uncaught/i,
      /unhandled promise rejection/i
    ],
    description: '运行时错误',
    repairable: true
  },
  {
    category: 'misc',
    patterns: [/.*/],
    description: '其他错误',
    repairable: true
  }
];

const NON_REPAIRABLE_PATTERNS: RegExp[] = [
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /network error/i,
  /permission denied/i,
  /EACCES/i,
  /out of memory/i,
  /heap out of memory/i,
  /ENOMEM/i,
  /rate limit/i,
  /quota exceeded/i,
  /authentication failed/i,
  /unauthorized/i,
  /forbidden/i
];

// 判断错误是否可修复
export function isRepairableError(error: Error | string): boolean {
  const errorMessage = typeof error === 'string' ? error : error.message;
  
  if (NON_REPAIRABLE_PATTERNS.some(pattern => pattern.test(errorMessage))) {
    return false;
  }
  
  for (const errorPattern of ERROR_PATTERNS) {
    if (errorPattern.repairable && errorPattern.patterns.some(pattern => pattern.test(errorMessage))) {
      return true;
    }
  }
  
  return false;
}

// 分类错误
export function classifyError(error: Error | string): string {
  const errorMessage = typeof error === 'string' ? error : error.message;
  
  for (const errorPattern of ERROR_PATTERNS) {
    if (errorPattern.patterns.some(pattern => pattern.test(errorMessage))) {
      return errorPattern.category;
    }
  }
  
  return 'misc';
}

// 收集错误上下文
export async function collectErrorContext(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  error: Error | string,
  toolContext: ToolContext,
  modifiedFiles: string[]
): Promise<ErrorContext> {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorStack = typeof error === 'object' && error.stack ? error.stack : undefined;
  
  const structureResult = await handleGetProjectStructure(toolContext);
  const projectStructure = structureResult.success && structureResult.structure
    ? JSON.stringify(structureResult.structure, null, 2)
    : undefined;
  
  const errorType = classifyError(error);
  
  return {
    errorType,
    errorMessage,
    errorStack,
    recentFileChanges: modifiedFiles,
    projectStructure
  };
}

// 解析 Debugger 输出 - 增强版，支持多种 JSON 格式
export function parseDebuggerOutput(content: string): DebuggerSuggestion | null {
  try {
    // 尝试从 markdown 代码块中提取 JSON
    const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    let jsonStr = jsonBlockMatch ? jsonBlockMatch[1].trim() : content;
    
    // 如果没有找到代码块，尝试直接解析整个内容
    if (!jsonBlockMatch) {
      // 尝试找到 JSON 对象的开始和结束
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonStr = content.substring(jsonStart, jsonEnd + 1);
      }
    }
    
    const parsed = JSON.parse(jsonStr);
    
    // 验证必要字段
    if (!parsed.rootCause || !Array.isArray(parsed.fileModifications)) {
      console.log('[SelfRepairLoop] Debugger output malformed: 缺少必要字段 rootCause 或 fileModifications');
      return null;
    }
    
    return {
      rootCause: parsed.rootCause,
      errorCategory: parsed.errorCategory || 'unknown',
      fileModifications: parsed.fileModifications.map((mod: { path: string; action: string; content?: string }) => ({
        path: mod.path,
        action: mod.action as 'create' | 'modify' | 'delete',
        content: mod.content
      })),
      verificationCommands: parsed.verificationCommands || []
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.log(`[SelfRepairLoop] Debugger output malformed: JSON 解析失败 - ${errorMessage}`);
    return null;
  }
}

// 调用 Debugger 进行诊断
export async function invokeDebugger(
  supabase: ReturnType<typeof createClient>,
  errorContext: ErrorContext,
  apiKey: string
): Promise<DebuggerSuggestion | null> {
  console.log('[SelfRepairLoop] 调用 Debugger 进行错误诊断...');
  
  try {
    const routerContext: PromptRouterContext = {
      taskType: 'debug',
      hasError: true,
      errorInfo: errorContext.errorMessage
    };
    
    const systemPrompt = await assembleSystemPrompt(supabase, routerContext);
    
    const userMessage = `## 错误诊断请求

### 错误类型
${errorContext.errorType}

### 错误信息
\`\`\`
${errorContext.errorMessage}
\`\`\`

${errorContext.errorStack ? `### 错误堆栈\n\`\`\`\n${errorContext.errorStack}\n\`\`\`` : ''}

### 最近修改的文件
${errorContext.recentFileChanges.length > 0 ? errorContext.recentFileChanges.map(f => `- ${f}`).join('\n') : '无'}

${errorContext.projectStructure ? `### 项目结构\n\`\`\`json\n${errorContext.projectStructure}\n\`\`\`` : ''}

请按照 Debugger 层的调试流程进行诊断，并输出：
1. 根因分析
2. 最小化修复方案（具体的文件修改）
3. 验证命令

**重要**：请以 JSON 格式输出修复建议，格式如下：
\`\`\`json
{
  "rootCause": "根本原因描述",
  "errorCategory": "错误类别",
  "fileModifications": [
    {
      "path": "文件路径",
      "action": "create|modify|delete",
      "content": "完整文件内容（如果是 create 或 modify）"
    }
  ],
  "verificationCommands": ["npm run lint", "npm run typecheck", "npm run build"]
}
\`\`\``;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];
    
    const model = MODEL_CONFIG.default;
    
    const response = await callOpenRouterChatCompletionsApi(messages, apiKey, model, {
      tools: null,
      toolChoice: 'none'
    });
    
    return parseDebuggerOutput(response.content);
  } catch (e) {
    console.error('[SelfRepairLoop] Debugger 调用失败:', e);
    return null;
  }
}
