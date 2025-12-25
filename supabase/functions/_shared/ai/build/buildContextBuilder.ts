/**
 * Build 上下文构建器
 * 
 * 职责：
 * - 递归获取文件树（带深度和数量限制）
 * - 推断项目类型（react/vue/vanilla/unknown）
 * - 识别关键入口文件
 * - 获取计划摘要（来自 plan 阶段）
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import type { FileTreeNode, ProjectFilesContext } from '../types.ts';

export type ProjectType = 'react' | 'vue' | 'vanilla' | 'unknown';

export interface FileTreeSummary {
  totalFiles: number;
  totalDirectories: number;
  tree: FileTreeNode[];
  truncated: boolean;
  maxDepth: number;
}

export interface PlanSummary {
  requirement: string;
  technicalPlan?: string;
  implementationSteps?: string[];
  confirmedAt?: string;
}

export interface BuildContext {
  fileTree: FileTreeSummary;
  entryPoints: string[];
  recentlyModified: string[];
  planSummary?: PlanSummary;
  allowedModificationScope?: string[];
  projectType: ProjectType;
}

export interface BuildContextOptions {
  maxDepth?: number;
  maxFiles?: number;
  maxContentLength?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
}

export interface FileTreeOptions {
  maxDepth: number;
  maxFiles: number;
  includePatterns: string[];
  excludePatterns: string[];
}

const DEFAULT_INCLUDE_PATTERNS = [
  '*.ts', '*.tsx', '*.js', '*.jsx', 
  '*.json', '*.html', '*.css', '*.scss',
  '*.md', '*.yaml', '*.yml'
];

const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules', '.git', 'dist', 'build', 
  '.next', '.nuxt', '.cache', 'coverage',
  '*.lock', '*.log'
];

function matchesPattern(path: string, patterns: string[]): boolean {
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

async function getFileTreeWithLimits(
  supabase: ReturnType<typeof createClient>,
  context: ProjectFilesContext,
  options: FileTreeOptions
): Promise<FileTreeSummary> {
  const { maxDepth, maxFiles, includePatterns, excludePatterns } = options;
  
  let totalFiles = 0;
  let totalDirectories = 0;
  let truncated = false;

  async function traverse(path: string, depth: number): Promise<FileTreeNode[]> {
    if (depth > maxDepth || totalFiles >= maxFiles) {
      truncated = true;
      return [];
    }

    const storagePath = path 
      ? `${context.path}/${path}`.replace(/\/+/g, '/')
      : context.path;

    const { data: items, error } = await supabase.storage
      .from(context.bucket)
      .list(storagePath, {
        limit: 100,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (error || !items) {
      console.error(`[BuildContextBuilder] 列出目录失败: ${storagePath}`, error);
      return [];
    }

    const nodes: FileTreeNode[] = [];
    
    for (const item of items) {
      if (totalFiles >= maxFiles) {
        truncated = true;
        break;
      }

      const itemPath = path ? `${path}/${item.name}` : item.name;
      
      if (matchesPattern(itemPath, excludePatterns)) continue;

      if (item.id) {
        if (matchesPattern(itemPath, includePatterns) || includePatterns.length === 0) {
          totalFiles++;
          nodes.push({
            name: item.name,
            type: 'file',
            path: itemPath,
            size: item.metadata?.size as number | undefined
          });
        }
      } else {
        totalDirectories++;
        const children = await traverse(itemPath, depth + 1);
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

  const tree = await traverse('', 0);

  return {
    totalFiles,
    totalDirectories,
    tree,
    truncated,
    maxDepth
  };
}

function inferProjectType(fileTree: FileTreeSummary): ProjectType {
  const allFiles = flattenFileTree(fileTree.tree);
  const fileNames = allFiles.map(f => f.name.toLowerCase());
  const filePaths = allFiles.map(f => f.path.toLowerCase());
  
  const hasPackageJson = fileNames.includes('package.json');
  const hasReactFiles = filePaths.some(p => p.endsWith('.tsx') || p.endsWith('.jsx'));
  const hasVueFiles = filePaths.some(p => p.endsWith('.vue'));
  const hasNextConfig = fileNames.some(n => n.startsWith('next.config'));
  const hasNuxtConfig = fileNames.some(n => n.startsWith('nuxt.config'));
  const hasViteConfig = fileNames.some(n => n.startsWith('vite.config'));
  
  if (hasVueFiles || hasNuxtConfig) {
    return 'vue';
  }
  
  if (hasReactFiles || hasNextConfig || (hasPackageJson && hasViteConfig)) {
    return 'react';
  }
  
  if (hasPackageJson) {
    return 'vanilla';
  }
  
  return 'unknown';
}

function flattenFileTree(nodes: FileTreeNode[]): FileTreeNode[] {
  const result: FileTreeNode[] = [];
  
  for (const node of nodes) {
    if (node.type === 'file') {
      result.push(node);
    } else if (node.children) {
      result.push(...flattenFileTree(node.children));
    }
  }
  
  return result;
}

function identifyEntryPoints(fileTree: FileTreeSummary, projectType: ProjectType): string[] {
  const allFiles = flattenFileTree(fileTree.tree);
  const entryPoints: string[] = [];
  
  const commonEntryFiles = [
    'index.html',
    'index.ts', 'index.tsx', 'index.js', 'index.jsx',
    'main.ts', 'main.tsx', 'main.js', 'main.jsx',
    'App.tsx', 'App.jsx', 'App.vue',
    'app.ts', 'app.tsx', 'app.js', 'app.jsx',
    'package.json',
    'vite.config.ts', 'vite.config.js',
    'next.config.js', 'next.config.mjs', 'next.config.ts',
    'nuxt.config.ts', 'nuxt.config.js',
    'tsconfig.json'
  ];
  
  for (const file of allFiles) {
    if (commonEntryFiles.includes(file.name)) {
      entryPoints.push(file.path);
    }
  }
  
  if (projectType === 'react') {
    for (const file of allFiles) {
      if (file.path.includes('src/') && 
          (file.name === 'App.tsx' || file.name === 'App.jsx' || 
           file.name === 'index.tsx' || file.name === 'index.jsx')) {
        if (!entryPoints.includes(file.path)) {
          entryPoints.push(file.path);
        }
      }
    }
  }
  
  if (projectType === 'vue') {
    for (const file of allFiles) {
      if (file.path.includes('src/') && 
          (file.name === 'App.vue' || file.name === 'main.ts' || file.name === 'main.js')) {
        if (!entryPoints.includes(file.path)) {
          entryPoints.push(file.path);
        }
      }
    }
  }
  
  return entryPoints;
}

async function getPlanSummary(
  supabase: ReturnType<typeof createClient>,
  projectId: string
): Promise<PlanSummary | undefined> {
  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select('content, metadata, created_at')
    .eq('project_id', projectId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (error || !messages) {
    console.error('[BuildContextBuilder] 获取计划摘要失败:', error);
    return undefined;
  }
  
  for (const msg of messages) {
    const metadata = msg.metadata as Record<string, unknown> | null;
    if (metadata?.planSummary) {
      const plan = metadata.planSummary as PlanSummary;
      return {
        requirement: plan.requirement || '',
        technicalPlan: plan.technicalPlan,
        implementationSteps: plan.implementationSteps,
        confirmedAt: plan.confirmedAt || msg.created_at
      };
    }
    
    if (msg.content?.includes('[IMPLEMENT_READY]')) {
      const content = msg.content as string;
      const lines = content.split('\n');
      const requirement = lines.find(l => l.includes('需求') || l.includes('requirement'))?.trim() || '';
      
      return {
        requirement,
        confirmedAt: msg.created_at
      };
    }
  }
  
  return undefined;
}

export async function buildEnhancedContext(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  projectFilesContext: ProjectFilesContext,
  options: BuildContextOptions = {}
): Promise<BuildContext> {
  const {
    maxDepth = 3,
    maxFiles = 200,
    includePatterns = DEFAULT_INCLUDE_PATTERNS,
    excludePatterns = DEFAULT_EXCLUDE_PATTERNS
  } = options;

  console.log(`[BuildContextBuilder] 开始构建上下文, projectId: ${projectId}`);
  
  const fileTree = await getFileTreeWithLimits(
    supabase,
    projectFilesContext,
    { maxDepth, maxFiles, includePatterns, excludePatterns }
  );

  console.log(`[BuildContextBuilder] 文件树构建完成: ${fileTree.totalFiles} 文件, ${fileTree.totalDirectories} 目录`);

  const projectType = inferProjectType(fileTree);
  console.log(`[BuildContextBuilder] 项目类型推断: ${projectType}`);

  const entryPoints = identifyEntryPoints(fileTree, projectType);
  console.log(`[BuildContextBuilder] 入口文件: ${entryPoints.join(', ')}`);

  const planSummary = await getPlanSummary(supabase, projectId);
  if (planSummary) {
    console.log(`[BuildContextBuilder] 找到计划摘要`);
  }

  return {
    fileTree,
    entryPoints,
    recentlyModified: [],
    planSummary,
    projectType
  };
}

export function formatFileTreeForPrompt(fileTree: FileTreeSummary): string {
  const lines: string[] = [];
  
  function formatNode(node: FileTreeNode, indent: string = ''): void {
    const prefix = node.type === 'directory' ? '📁 ' : '📄 ';
    const sizeInfo = node.size ? ` (${formatSize(node.size)})` : '';
    lines.push(`${indent}${prefix}${node.name}${sizeInfo}`);
    
    if (node.children) {
      for (const child of node.children) {
        formatNode(child, indent + '  ');
      }
    }
  }
  
  for (const node of fileTree.tree) {
    formatNode(node);
  }
  
  if (fileTree.truncated) {
    lines.push(`\n... (文件树已截断，共 ${fileTree.totalFiles} 文件, ${fileTree.totalDirectories} 目录)`);
  }
  
  return lines.join('\n');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
