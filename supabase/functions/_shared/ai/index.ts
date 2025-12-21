/**
 * AI 模块统一导出入口
 * 提供所有共享模块的统一访问点
 */

// 配置
export * from './config.ts';

// 类型
export * from './types.ts';

// Prompts 模块（路由、缓存、组装）
export { 
  // v3 架构：统一交互模式
  MODE_TO_PROMPT_PREFIX,
  getLatestModeKey,
  routePromptByMode,
  assembleSystemPromptByMode,
  // 路由（向后兼容）
  routePromptsAsync,
  routePromptLayers,
  PROMPT_ROUTING_TABLE,
  cleanupOldPromptVersions,
  // 缓存
  VERSION_CACHE_TTL,
  promptCache,
  extractVersion,
  detectLatestVersions,
  getVersionCache,
  getLatestLayerKey,
  getLatestWorkflowKey,
  clearVersionCache,
  clearPromptCache,
  clearAllCaches,
  // 组装（向后兼容）
  assembleSystemPrompt, 
  getMultiplePrompts,
  classifyPromptError,
  // 层级映射（向后兼容）
  LAYER_TO_PROMPT_PREFIX,
  WORKFLOW_MODE_TO_PROMPT_PREFIX
} from './prompts/index.ts';

// LLM 客户端
export { 
  parseChatCompletionOutput, 
  callOpenRouterChatCompletionsApi 
} from './llm/client.ts';

// 流式 LLM 客户端
export {
  callOpenRouterChatCompletionsApiStreaming,
  DEFAULT_STREAMING_CONFIG
} from './llm/streamingClient.ts';
export type {
  StreamingConfig,
  StreamingCallbacks,
  StreamingResult
} from './llm/streamingClient.ts';

// 图片生成
export { 
  generateImage, 
  saveImageToStorage 
} from './llm/imageGenerator.ts';

// 工具定义和能力矩阵（基于 InteractionMode）
export { 
  TOOLS, 
  getFilteredToolsByMode,
  getAllowedToolNamesByMode
} from './tools/definitions.ts';

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

// TaskRunner - 阶段化任务执行主干
export {
  TaskRunner,
  createTaskRunner
} from './core/taskRunner.ts';

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
  logSelfRepairFinalStatus,
  logProgressEvent,
  logStageEnter,
  logStageExit,
  logIterationStart,
  logToolStart,
  logToolComplete,
  logStreamDelta,
  logStreamComplete
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
