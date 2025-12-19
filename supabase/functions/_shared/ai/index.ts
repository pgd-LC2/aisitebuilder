/**
 * AI 模块统一导出入口
 * 提供所有共享模块的统一访问点
 */

// 配置
export * from './config.ts';

// 类型
export * from './types.ts';

// Prompt Router
export { 
  routePrompts, 
  assembleSystemPrompt, 
  getMultiplePrompts,
  DEFAULT_PROMPTS,
  PROMPT_ROUTING_TABLE,
  LAYER_TO_PROMPT_PREFIX
} from './prompts/router.ts';

// LLM 客户端
export { 
  parseChatCompletionOutput, 
  callOpenRouterChatCompletionsApi 
} from './llm/client.ts';

// 图片生成
export { 
  generateImage, 
  saveImageToStorage 
} from './llm/imageGenerator.ts';

// 工具定义和能力矩阵
export { TOOLS, getFilteredTools, getAllowedToolNames } from './tools/definitions.ts';

// 文件操作
export {
  getMimeType,
  getFileCategory,
  handleListFiles,
  handleReadFile,
  handleWriteFile,
  handleDeleteFile,
  handleMoveFile,
  handleSearchFiles,
  handleGetProjectStructure
} from './tools/fileOperations.ts';

// 工具执行器
export { executeToolCall } from './tools/executor.ts';
export type { ToolExecutionContext, ToolExecutionResult } from './tools/executor.ts';

// AgentLoop - 统一的 Agent 循环抽象
export {
  runAgentLoop
} from './core/agentLoop.ts';
export type {
  AgentLoopConfig,
  AgentLoopContext,
  AgentLoopProgress,
  AgentLoopResult
} from './core/agentLoop.ts';

// 日志
export {
  writeBuildLog,
  writeAssistantMessage,
  updateTaskStatus,
  logSelfRepairAttemptToBuildLog,
  logSelfRepairFinalStatusToBuildLog
} from './logging/buildLog.ts';

export {
  logAgentEvent,
  logFileEvent,
  logSelfRepairAttempt,
  logSelfRepairFinalStatus
} from './logging/agentEvents.ts';

// 自我修复
export {
  isRepairableError,
  classifyError,
  collectErrorContext,
  parseDebuggerOutput,
  invokeDebugger
} from './selfRepair/debugger.ts';

export {
  applyRepairSuggestions,
  runVerificationCommands,
  processTaskWithSelfRepair
} from './selfRepair/loop.ts';

// Subagent 系统
export type {
  SubagentType,
  SubagentConfig,
  SubagentContext,
  SubagentTaskParams,
  SubagentResult
} from './subagent/index.ts';

export {
  MAX_NESTING_LEVEL,
  executeSubagent,
  canSpawnSubagent,
  getAvailableSubagentTypes,
  initializeBuiltinSubagents,
  registerSubagent,
  hasSubagent,
  getRegisteredSubagentTypes
} from './subagent/index.ts';
