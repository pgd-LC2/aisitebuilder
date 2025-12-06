/**
 * 文件操作模块
 * 实现所有文件相关的工具函数
 */

import type { 
  ToolContext, 
  ListFilesResult, 
  ReadFileResult, 
  WriteFileResult, 
  SearchFilesResult, 
  GetProjectStructureResult,
  MoveFileResult,
  FileOperationResult,
  FileTreeNode
} from '../types.ts';
import { logFileEvent } from '../logging/agentEvents.ts';

// 获取 MIME 类型
export function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'ts': 'application/typescript',
    'tsx': 'application/typescript',
    'jsx': 'application/javascript',
    'json': 'application/json',
    'md': 'text/markdown',
    'txt': 'text/plain',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// 获取文件类别
export function getFileCategory(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const codeExtensions = ['html', 'css', 'js', 'ts', 'tsx', 'jsx', 'json'];
  const assetExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'];
  const documentExtensions = ['md', 'txt', 'pdf'];
  
  if (codeExtensions.includes(ext)) return 'code';
  if (assetExtensions.includes(ext)) return 'asset';
  if (documentExtensions.includes(ext)) return 'document';
  return 'code';
}

// 列出文件
export async function handleListFiles(
  ctx: ToolContext, 
  args: { path?: string }
): Promise<ListFilesResult> {
  try {
    const relativePath = args.path || '';
    const fullPath = relativePath ? `${ctx.basePath}/${relativePath}`.replace(/\/+/g, '/') : ctx.basePath;
    
    const { data: fileList, error } = await ctx.supabase.storage
      .from(ctx.bucket)
      .list(fullPath, {
        limit: 100,
        sortBy: { column: 'name', order: 'asc' }
      });
    
    if (error) {
      return { success: false, error: `列出文件失败: ${error.message}` };
    }
    
    const files = (fileList || []).map(f => ({
      name: f.name,
      type: f.id ? 'file' : 'directory',
      size: f.metadata?.size
    }));
    
    return { success: true, files };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { success: false, error: `列出文件异常: ${errorMessage}` };
  }
}

// 读取文件
export async function handleReadFile(
  ctx: ToolContext, 
  args: { path: string }
): Promise<ReadFileResult> {
  try {
    const fullPath = `${ctx.basePath}/${args.path}`.replace(/\/+/g, '/');
    
    const { data, error } = await ctx.supabase.storage
      .from(ctx.bucket)
      .download(fullPath);
    
    if (error) {
      return { success: false, error: `读取文件失败: ${error.message}` };
    }
    
    const content = await data.text();
    return { success: true, content };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { success: false, error: `读取文件异常: ${errorMessage}` };
  }
}

// 写入文件
export async function handleWriteFile(
  ctx: ToolContext, 
  args: { path: string; content: string }
): Promise<WriteFileResult> {
  try {
    const fullPath = `${ctx.basePath}/${args.path}`.replace(/\/+/g, '/');
    const fileName = args.path.split('/').pop() || 'unnamed';
    const mimeType = getMimeType(fileName);
    const fileCategory = getFileCategory(fileName);
    
    const encoder = new TextEncoder();
    const buffer = encoder.encode(args.content);
    
    const { error: uploadError } = await ctx.supabase.storage
      .from(ctx.bucket)
      .upload(fullPath, buffer, {
        contentType: mimeType,
        upsert: true
      });
    
    if (uploadError) {
      return { success: false, error: `写入文件失败: ${uploadError.message}` };
    }
    
    const { data: existingFile } = await ctx.supabase
      .from('project_files')
      .select('id')
      .eq('project_id', ctx.projectId)
      .eq('file_path', fullPath)
      .maybeSingle();
    
    const isUpdate = !!existingFile;
    
    if (existingFile) {
      await ctx.supabase
        .from('project_files')
        .update({
          file_size: buffer.length,
          mime_type: mimeType,
          source_type: 'ai_generated'
        })
        .eq('id', existingFile.id);
    } else {
      await ctx.supabase
        .from('project_files')
        .insert({
          project_id: ctx.projectId,
          version_id: ctx.versionId,
          file_name: fileName,
          file_path: fullPath,
          file_size: buffer.length,
          mime_type: mimeType,
          file_category: fileCategory,
          source_type: 'ai_generated',
          is_public: false
        });
    }
    
    await logFileEvent(
      ctx.supabase,
      ctx.projectId,
      args.path,
      isUpdate ? 'update' : 'create',
      isUpdate ? `更新文件: ${fileName}` : `创建文件: ${fileName}`,
      fullPath,
      ctx.versionId
    );
    
    return { success: true, file_path: fullPath };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { success: false, error: `写入文件异常: ${errorMessage}` };
  }
}

// 删除文件
export async function handleDeleteFile(
  ctx: ToolContext, 
  args: { path: string }
): Promise<FileOperationResult> {
  try {
    const fullPath = `${ctx.basePath}/${args.path}`.replace(/\/+/g, '/');
    const fileName = args.path.split('/').pop() || 'unnamed';
    
    const { error: deleteError } = await ctx.supabase.storage
      .from(ctx.bucket)
      .remove([fullPath]);
    
    if (deleteError) {
      return { success: false, error: `删除文件失败: ${deleteError.message}` };
    }
    
    await ctx.supabase
      .from('project_files')
      .delete()
      .eq('project_id', ctx.projectId)
      .eq('file_path', fullPath);
    
    await logFileEvent(
      ctx.supabase,
      ctx.projectId,
      args.path,
      'delete',
      `删除文件: ${fileName}`
    );
    
    return { success: true };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { success: false, error: `删除文件异常: ${errorMessage}` };
  }
}

// 移动文件
export async function handleMoveFile(
  ctx: ToolContext, 
  args: { fromPath: string; toPath: string; overwrite?: boolean }
): Promise<MoveFileResult> {
  try {
    const fromFullPath = `${ctx.basePath}/${args.fromPath}`.replace(/\/+/g, '/');
    const toFullPath = `${ctx.basePath}/${args.toPath}`.replace(/\/+/g, '/');
    
    const { data: sourceData, error: sourceError } = await ctx.supabase.storage
      .from(ctx.bucket)
      .download(fromFullPath);
    
    if (sourceError || !sourceData) {
      return { success: false, message: `源文件不存在: ${args.fromPath}` };
    }
    
    if (!args.overwrite) {
      const { data: targetData } = await ctx.supabase.storage
        .from(ctx.bucket)
        .download(toFullPath);
      
      if (targetData) {
        return { success: false, message: `目标文件已存在: ${args.toPath}` };
      }
    }
    
    const content = await sourceData.arrayBuffer();
    const toFileName = args.toPath.split('/').pop() || 'unnamed';
    const mimeType = getMimeType(toFileName);
    const fileCategory = getFileCategory(toFileName);
    
    const { error: uploadError } = await ctx.supabase.storage
      .from(ctx.bucket)
      .upload(toFullPath, content, {
        contentType: mimeType,
        upsert: args.overwrite || false
      });
    
    if (uploadError) {
      return { success: false, message: `移动文件失败: ${uploadError.message}` };
    }
    
    const { error: deleteError } = await ctx.supabase.storage
      .from(ctx.bucket)
      .remove([fromFullPath]);
    
    if (deleteError) {
      await ctx.supabase.storage.from(ctx.bucket).remove([toFullPath]);
      return { success: false, message: `删除源文件失败: ${deleteError.message}` };
    }
    
    const { data: existingFile } = await ctx.supabase
      .from('project_files')
      .select('id, file_size')
      .eq('project_id', ctx.projectId)
      .eq('file_path', fromFullPath)
      .maybeSingle();
    
    if (existingFile) {
      await ctx.supabase
        .from('project_files')
        .update({
          file_name: toFileName,
          file_path: toFullPath,
          mime_type: mimeType,
          file_category: fileCategory,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingFile.id);
    } else {
      await ctx.supabase
        .from('project_files')
        .insert({
          project_id: ctx.projectId,
          version_id: ctx.versionId,
          file_name: toFileName,
          file_path: toFullPath,
          file_size: content.byteLength,
          mime_type: mimeType,
          file_category: fileCategory,
          source_type: 'ai_generated',
          is_public: false
        });
    }
    
    await logFileEvent(
      ctx.supabase,
      ctx.projectId,
      args.toPath,
      'move',
      `移动文件: ${args.fromPath} → ${args.toPath}`,
      toFullPath,
      ctx.versionId,
      args.fromPath
    );
    
    return { success: true, message: `文件已移动: ${args.fromPath} → ${args.toPath}` };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { success: false, message: `移动文件异常: ${errorMessage}` };
  }
}

// 搜索文件
export async function handleSearchFiles(
  ctx: ToolContext, 
  args: { keyword: string; file_extension?: string }
): Promise<SearchFilesResult> {
  try {
    const { data: fileList, error: listError } = await ctx.supabase.storage
      .from(ctx.bucket)
      .list(ctx.basePath, {
        limit: 50,
        sortBy: { column: 'name', order: 'asc' }
      });
    
    if (listError) {
      return { success: false, error: `搜索文件失败: ${listError.message}` };
    }
    
    const textExtensions = ['.html', '.css', '.js', '.ts', '.jsx', '.tsx', '.json', '.md', '.txt'];
    const filesToSearch = (fileList || []).filter(f => {
      if (!f.id) return false;
      const hasTextExt = textExtensions.some(ext => f.name.endsWith(ext));
      if (args.file_extension) {
        return f.name.endsWith(args.file_extension);
      }
      return hasTextExt;
    });
    
    const results: Array<{ file: string; matches: string[] }> = [];
    
    for (const file of filesToSearch) {
      const filePath = `${ctx.basePath}/${file.name}`.replace(/\/+/g, '/');
      const { data, error } = await ctx.supabase.storage
        .from(ctx.bucket)
        .download(filePath);
      
      if (error) continue;
      
      const content = await data.text();
      const lines = content.split('\n');
      const matchingLines: string[] = [];
      
      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(args.keyword.toLowerCase())) {
          matchingLines.push(`Line ${index + 1}: ${line.trim().substring(0, 100)}`);
        }
      });
      
      if (matchingLines.length > 0) {
        results.push({
          file: file.name,
          matches: matchingLines.slice(0, 5)
        });
      }
    }
    
    return { success: true, results };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { success: false, error: `搜索文件异常: ${errorMessage}` };
  }
}

// 获取项目结构
export async function handleGetProjectStructure(
  ctx: ToolContext
): Promise<GetProjectStructureResult> {
  try {
    const { data: fileList, error } = await ctx.supabase.storage
      .from(ctx.bucket)
      .list(ctx.basePath, {
        limit: 200,
        sortBy: { column: 'name', order: 'asc' }
      });
    
    if (error) {
      return { success: false, error: `获取项目结构失败: ${error.message}` };
    }
    
    const structure: FileTreeNode[] = (fileList || []).map(f => ({
      name: f.name,
      type: f.id ? 'file' as const : 'directory' as const,
      size: f.metadata?.size
    }));
    
    return { success: true, structure };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { success: false, error: `获取项目结构异常: ${errorMessage}` };
  }
}
