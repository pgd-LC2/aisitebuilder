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

// 递归列出目录下所有文件
async function listAllFilesRecursively(
  ctx: ToolContext,
  dirPath: string
): Promise<string[]> {
  const allFiles: string[] = [];
  
  const { data: items, error } = await ctx.supabase.storage
    .from(ctx.bucket)
    .list(dirPath, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' }
    });
  
  if (error || !items) {
    return allFiles;
  }
  
  for (const item of items) {
    const itemPath = `${dirPath}/${item.name}`.replace(/\/+/g, '/');
    if (item.id) {
      // 是文件
      allFiles.push(itemPath);
    } else {
      // 是目录，递归列出
      const subFiles = await listAllFilesRecursively(ctx, itemPath);
      allFiles.push(...subFiles);
    }
  }
  
  return allFiles;
}

// 检查路径是文件还是目录
async function isDirectory(
  ctx: ToolContext,
  path: string
): Promise<boolean> {
  // 尝试列出该路径下的内容，如果能列出内容则是目录
  const { data: items, error } = await ctx.supabase.storage
    .from(ctx.bucket)
    .list(path, { limit: 1 });
  
  // 如果没有错误且有内容，说明是目录
  if (!error && items && items.length > 0) {
    return true;
  }
  
  // 尝试下载该路径，如果能下载则是文件
  const { data: fileData } = await ctx.supabase.storage
    .from(ctx.bucket)
    .download(path);
  
  // 如果能下载到数据，说明是文件
  if (fileData) {
    return false;
  }
  
  // 默认当作文件处理
  return false;
}

// 删除文件或文件夹（支持递归删除）
export async function handleDeleteFile(
  ctx: ToolContext, 
  args: { path: string }
): Promise<FileOperationResult> {
  try {
    const fullPath = `${ctx.basePath}/${args.path}`.replace(/\/+/g, '/');
    const pathName = args.path.split('/').pop() || 'unnamed';
    
    // 检查是否是目录
    const isDir = await isDirectory(ctx, fullPath);
    
    if (isDir) {
      // 递归删除目录
      const allFiles = await listAllFilesRecursively(ctx, fullPath);
      
      if (allFiles.length === 0) {
        // 空目录，直接返回成功
        await logFileEvent(
          ctx.supabase,
          ctx.projectId,
          args.path,
          'delete',
          `删除空目录: ${pathName}`
        );
        return { success: true };
      }
      
      // 批量删除所有文件
      const { error: deleteError } = await ctx.supabase.storage
        .from(ctx.bucket)
        .remove(allFiles);
      
      if (deleteError) {
        return { success: false, error: `删除目录失败: ${deleteError.message}` };
      }
      
      // 删除数据库中的文件记录
      for (const filePath of allFiles) {
        await ctx.supabase
          .from('project_files')
          .delete()
          .eq('project_id', ctx.projectId)
          .eq('file_path', filePath);
      }
      
      await logFileEvent(
        ctx.supabase,
        ctx.projectId,
        args.path,
        'delete',
        `递归删除目录: ${pathName} (共 ${allFiles.length} 个文件)`
      );
      
      return { success: true };
    } else {
      // 删除单个文件
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
        `删除文件: ${pathName}`
      );
      
      return { success: true };
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { success: false, error: `删除文件/目录异常: ${errorMessage}` };
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

// 递归收集所有文件路径
async function collectFilesRecursively(
  ctx: ToolContext,
  dirPath: string,
  fileExtension: string | undefined,
  textExtensions: string[],
  maxFiles: number
): Promise<string[]> {
  const files: string[] = [];
  
  const { data: items, error } = await ctx.supabase.storage
    .from(ctx.bucket)
    .list(dirPath, {
      limit: 100,
      sortBy: { column: 'name', order: 'asc' }
    });
  
  if (error || !items) return files;
  
  for (const item of items) {
    if (files.length >= maxFiles) break;
    
    const itemPath = `${dirPath}/${item.name}`.replace(/\/+/g, '/');
    
    if (item.id) {
      const hasTextExt = textExtensions.some(ext => item.name.endsWith(ext));
      if (fileExtension) {
        if (item.name.endsWith(fileExtension)) {
          files.push(itemPath);
        }
      } else if (hasTextExt) {
        files.push(itemPath);
      }
    } else {
      const subFiles = await collectFilesRecursively(
        ctx, 
        itemPath, 
        fileExtension, 
        textExtensions, 
        maxFiles - files.length
      );
      files.push(...subFiles);
    }
  }
  
  return files;
}

// 搜索文件（增强版：支持递归搜索和正则表达式）
export async function handleSearchFiles(
  ctx: ToolContext, 
  args: { 
    keyword: string; 
    file_extension?: string;
    recursive?: boolean;
    use_regex?: boolean;
    max_results?: number;
  }
): Promise<SearchFilesResult> {
  try {
    const recursive = args.recursive !== false;
    const useRegex = args.use_regex === true;
    const maxResults = Math.min(args.max_results || 50, 100);
    
    console.log(`[SearchFiles] 开始搜索, keyword="${args.keyword}", recursive=${recursive}, useRegex=${useRegex}`);
    
    const textExtensions = ['.html', '.css', '.js', '.ts', '.jsx', '.tsx', '.json', '.md', '.txt', '.vue', '.svelte'];
    
    let filesToSearch: string[];
    
    if (recursive) {
      filesToSearch = await collectFilesRecursively(
        ctx,
        ctx.basePath,
        args.file_extension,
        textExtensions,
        200
      );
    } else {
      const { data: fileList, error: listError } = await ctx.supabase.storage
        .from(ctx.bucket)
        .list(ctx.basePath, {
          limit: 100,
          sortBy: { column: 'name', order: 'asc' }
        });
      
      if (listError) {
        return { success: false, error: `搜索文件失败: ${listError.message}` };
      }
      
      filesToSearch = (fileList || [])
        .filter(f => {
          if (!f.id) return false;
          const hasTextExt = textExtensions.some(ext => f.name.endsWith(ext));
          if (args.file_extension) {
            return f.name.endsWith(args.file_extension);
          }
          return hasTextExt;
        })
        .map(f => `${ctx.basePath}/${f.name}`.replace(/\/+/g, '/'));
    }
    
    console.log(`[SearchFiles] 找到 ${filesToSearch.length} 个文件待搜索`);
    
    const results: Array<{ file: string; matches: string[] }> = [];
    let totalMatches = 0;
    
    let searchPattern: RegExp | null = null;
    if (useRegex) {
      try {
        searchPattern = new RegExp(args.keyword, 'gi');
      } catch {
        return { success: false, error: `无效的正则表达式: ${args.keyword}` };
      }
    }
    
    for (const filePath of filesToSearch) {
      if (totalMatches >= maxResults) break;
      
      const { data, error } = await ctx.supabase.storage
        .from(ctx.bucket)
        .download(filePath);
      
      if (error) continue;
      
      const content = await data.text();
      const lines = content.split('\n');
      const matchingLines: string[] = [];
      
      lines.forEach((line, index) => {
        if (totalMatches >= maxResults) return;
        
        let isMatch = false;
        if (useRegex && searchPattern) {
          searchPattern.lastIndex = 0;
          isMatch = searchPattern.test(line);
        } else {
          isMatch = line.toLowerCase().includes(args.keyword.toLowerCase());
        }
        
        if (isMatch) {
          matchingLines.push(`Line ${index + 1}: ${line.trim().substring(0, 150)}`);
          totalMatches++;
        }
      });
      
      if (matchingLines.length > 0) {
        const relativePath = filePath.replace(ctx.basePath + '/', '');
        results.push({
          file: relativePath,
          matches: matchingLines.slice(0, 10)
        });
      }
    }
    
    console.log(`[SearchFiles] 搜索完成, 找到 ${results.length} 个文件, ${totalMatches} 处匹配`);
    
    return { 
      success: true, 
      results,
      metadata: {
        totalFiles: filesToSearch.length,
        totalMatches,
        truncated: totalMatches >= maxResults
      }
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { success: false, error: `搜索文件异常: ${errorMessage}` };
  }
}

// 默认排除的目录和文件模式
const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules', '.git', 'dist', 'build', 
  '.next', '.nuxt', '.cache', 'coverage',
  '*.lock', '*.log', '.DS_Store'
];

// 检查路径是否匹配模式
function matchesPatternForStructure(path: string, patterns: string[]): boolean {
  const fileName = path.split('/').pop() || '';
  
  for (const pattern of patterns) {
    if (pattern.startsWith('*.')) {
      const ext = pattern.slice(1);
      if (fileName.endsWith(ext)) return true;
    } else if (pattern.endsWith('/**')) {
      const dir = pattern.slice(0, -3);
      if (path.startsWith(dir + '/') || path === dir) return true;
    } else if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      if (regex.test(fileName) || regex.test(path)) return true;
    } else {
      if (fileName === pattern || path === pattern || path.includes('/' + pattern + '/')) return true;
    }
  }
  
  return false;
}

// 递归获取项目结构
async function getProjectStructureRecursive(
  ctx: ToolContext,
  relativePath: string,
  currentDepth: number,
  maxDepth: number,
  includePatterns: string[],
  excludePatterns: string[],
  stats: { totalFiles: number; totalDirs: number; maxFiles: number }
): Promise<FileTreeNode[]> {
  if (currentDepth > maxDepth || stats.totalFiles >= stats.maxFiles) {
    return [];
  }

  const fullPath = relativePath 
    ? `${ctx.basePath}/${relativePath}`.replace(/\/+/g, '/')
    : ctx.basePath;

  const { data: items, error } = await ctx.supabase.storage
    .from(ctx.bucket)
    .list(fullPath, {
      limit: 100,
      sortBy: { column: 'name', order: 'asc' }
    });

  if (error || !items) {
    console.error(`[GetProjectStructure] 列出目录失败: ${fullPath}`, error);
    return [];
  }

  const nodes: FileTreeNode[] = [];

  for (const item of items) {
    if (stats.totalFiles >= stats.maxFiles) break;

    const itemPath = relativePath ? `${relativePath}/${item.name}` : item.name;
    
    if (matchesPatternForStructure(itemPath, excludePatterns)) continue;

    if (item.id) {
      if (includePatterns.length === 0 || matchesPatternForStructure(itemPath, includePatterns)) {
        stats.totalFiles++;
        nodes.push({
          name: item.name,
          type: 'file',
          path: itemPath,
          size: item.metadata?.size as number | undefined
        });
      }
    } else {
      stats.totalDirs++;
      const children = await getProjectStructureRecursive(
        ctx,
        itemPath,
        currentDepth + 1,
        maxDepth,
        includePatterns,
        excludePatterns,
        stats
      );
      nodes.push({
        name: item.name,
        type: 'directory',
        path: itemPath,
        children
      });
    }
  }

  return nodes;
}

// 获取项目结构（增强版：支持递归、深度限制、文件过滤）
export async function handleGetProjectStructure(
  ctx: ToolContext,
  args?: { 
    depth?: number; 
    include_patterns?: string[]; 
    exclude_patterns?: string[];
  }
): Promise<GetProjectStructureResult> {
  try {
    const maxDepth = Math.min(Math.max(args?.depth ?? 3, 0), 10);
    const includePatterns = args?.include_patterns || [];
    const excludePatterns = args?.exclude_patterns || DEFAULT_EXCLUDE_PATTERNS;
    
    console.log(`[GetProjectStructure] 开始获取项目结构, depth=${maxDepth}, include=${includePatterns.join(',')}, exclude=${excludePatterns.join(',')}`);
    
    const stats = { totalFiles: 0, totalDirs: 0, maxFiles: 500 };
    
    const structure = await getProjectStructureRecursive(
      ctx,
      '',
      0,
      maxDepth,
      includePatterns,
      excludePatterns,
      stats
    );
    
    console.log(`[GetProjectStructure] 完成, 文件数=${stats.totalFiles}, 目录数=${stats.totalDirs}`);
    
    return { 
      success: true, 
      structure,
      metadata: {
        totalFiles: stats.totalFiles,
        totalDirectories: stats.totalDirs,
        maxDepth,
        truncated: stats.totalFiles >= stats.maxFiles
      }
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return { success: false, error: `获取项目结构异常: ${errorMessage}` };
  }
}
