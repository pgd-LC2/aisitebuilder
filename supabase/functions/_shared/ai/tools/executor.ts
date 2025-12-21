/**
 * 工具执行器模块
 * 负责根据工具名称调用对应的处理函数
 * 
 * 这是所有工具执行的唯一入口，包括：
 * - 文件操作工具 (list_files, read_file, write_file, delete_file, move_file, search_files, get_project_structure)
 * - 图片生成工具 (generate_image)
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
import { generateImage, saveImageToStorage } from '../llm/imageGenerator.ts';
import { writeBuildLog } from '../logging/buildLog.ts';
import { IMAGE_MODEL } from '../config.ts';

// --- 类型定义 ---

/**
 * 扩展的工具执行上下文
 * 包含执行所有工具所需的上下文信息
 */
export interface ToolExecutionContext extends ToolContext {
  apiKey: string;
  taskId?: string;
}

/**
 * 工具执行结果
 */
export interface ToolExecutionResult {
  success: boolean;
  result: unknown;
  sideEffects?: {
    generatedImages?: string[];
    modifiedFiles?: string[];
  };
}

// --- 图片生成模型白名单 ---

const ALLOWED_IMAGE_MODELS = [
  'google/gemini-3-pro-image-preview',
  'openai/dall-e-3',
  'openai/dall-e-2'
];

/**
 * 验证并获取图片生成模型
 * 如果提供的模型不在白名单中，则回退到默认模型
 */
function getValidImageModel(requestedModel?: string): string {
  if (!requestedModel) {
    return IMAGE_MODEL;
  }
  
  if (ALLOWED_IMAGE_MODELS.includes(requestedModel)) {
    return requestedModel;
  }
  
  console.log(`[ToolExecutor] 图片生成模型 "${requestedModel}" 不在白名单中，回退到默认模型: ${IMAGE_MODEL}`);
  return IMAGE_MODEL;
}

// --- 工具处理函数 ---

/**
 * 处理 generate_image 工具调用
 */
async function handleGenerateImage(
  args: { prompt: string; aspect_ratio?: string; model?: string },
  ctx: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const { supabase, projectId, versionId, apiKey } = ctx;
  const { prompt, aspect_ratio = '1:1', model: requestedModel } = args;
  
  try {
    const model = getValidImageModel(requestedModel);
    console.log(`[ToolExecutor] 生成图片, 模型: ${model}, 提示: ${prompt.substring(0, 50)}...`);
    
    await writeBuildLog(supabase, projectId, 'info', `正在生成图片: ${prompt}`);
    
    // 调用图片生成 API
    const imageDataUrl = await generateImage(prompt, apiKey, aspect_ratio);
    
    // 保存图片到 Storage
    const timestamp = Date.now();
    const fileName = `generated_image_${timestamp}.png`;
    const imagePath = await saveImageToStorage(supabase, projectId, versionId, imageDataUrl, fileName);
    
    await writeBuildLog(supabase, projectId, 'success', `图片已生成并保存: ${imagePath}`);
    
    return {
      success: true,
      result: {
        success: true,
        image_path: imagePath,
        file_name: fileName,
        message: '图片已成功生成并保存到项目文件夹'
      },
      sideEffects: {
        generatedImages: [imagePath]
      }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[ToolExecutor] 图片生成失败:', error);
    await writeBuildLog(supabase, projectId, 'error', `图片生成失败: ${errorMessage}`);
    
    return {
      success: false,
      result: {
        success: false,
        error: errorMessage
      }
    };
  }
}

// --- 主执行函数 ---

/**
 * 执行工具调用
 * 这是所有工具执行的唯一入口
 * 
 * @param toolName - 工具名称
 * @param args - 工具参数
 * @param ctx - 执行上下文
 * @returns 工具执行结果
 */
export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionResult> {
  // 构建基础 ToolContext（用于文件操作）
  const baseToolContext: ToolContext = {
    supabase: ctx.supabase,
    projectId: ctx.projectId,
    versionId: ctx.versionId,
    bucket: ctx.bucket,
    basePath: ctx.basePath
  };
  
  switch (toolName) {
    // 文件操作工具
    case 'list_files':
      return { 
        success: true, 
        result: await handleListFiles(baseToolContext, args as { path?: string }) 
      };
    
    case 'read_file':
      return { 
        success: true, 
        result: await handleReadFile(baseToolContext, args as { path: string }) 
      };
    
    case 'write_file': {
      const writeResult = await handleWriteFile(baseToolContext, args as { path: string; content: string });
      return { 
        success: writeResult.success, 
        result: writeResult,
        sideEffects: writeResult.success && writeResult.file_path 
          ? { modifiedFiles: [writeResult.file_path] } 
          : undefined
      };
    }
    
    case 'delete_file':
      return { 
        success: true, 
        result: await handleDeleteFile(baseToolContext, args as { path: string }) 
      };
    
    case 'move_file':
      return { 
        success: true, 
        result: await handleMoveFile(baseToolContext, args as { fromPath: string; toPath: string; overwrite?: boolean }) 
      };
    
    case 'search_files':
      return { 
        success: true, 
        result: await handleSearchFiles(baseToolContext, args as { keyword: string; file_extension?: string }) 
      };
    
    case 'get_project_structure':
      return { 
        success: true, 
        result: await handleGetProjectStructure(baseToolContext) 
      };
    
    // 图片生成工具
    case 'generate_image':
      return await handleGenerateImage(
        args as { prompt: string; aspect_ratio?: string; model?: string },
        ctx
      );
    
    // 未知工具
    default:
      return { 
        success: false, 
        result: { error: `未知工具: ${toolName}` } 
      };
  }
}
