/**
 * 工具执行器模块
 * 负责根据工具名称调用对应的处理函数
 */

import type { ToolContext } from '../types.ts';
import {
  handleListFiles,
  handleReadFile,
  handleWriteFile,
  handleDeleteFile,
  handleMoveFile,
  handleSearchFiles,
  handleGetProjectStructure
} from './fileOperations.ts';

// 执行工具调用
export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<{ success: boolean; result: unknown }> {
  switch (toolName) {
    case 'list_files':
      return { success: true, result: await handleListFiles(ctx, args as { path?: string }) };
    case 'read_file':
      return { success: true, result: await handleReadFile(ctx, args as { path: string }) };
    case 'write_file':
      return { success: true, result: await handleWriteFile(ctx, args as { path: string; content: string }) };
    case 'delete_file':
      return { success: true, result: await handleDeleteFile(ctx, args as { path: string }) };
    case 'move_file':
      return { success: true, result: await handleMoveFile(ctx, args as { fromPath: string; toPath: string; overwrite?: boolean }) };
    case 'search_files':
      return { success: true, result: await handleSearchFiles(ctx, args as { keyword: string; file_extension?: string }) };
    case 'get_project_structure':
      return { success: true, result: await handleGetProjectStructure(ctx) };
    case 'generate_image':
      return { success: false, result: { error: 'generate_image handled separately' } };
    default:
      return { success: false, result: { error: `未知工具: ${toolName}` } };
  }
}
