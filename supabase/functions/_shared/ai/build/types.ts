/**
 * Build 模块类型定义
 * 定义 build 模式专属的输入输出类型
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

/**
 * Build 任务输入参数
 */
export interface BuildTaskInput {
  task: {
    id: string;
    type: string;
    project_id: string;
    payload?: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
  };
  supabase: ReturnType<typeof createClient>;
  apiKey: string;
  projectFilesContext?: {
    bucket: string;
    path: string;
    versionId?: string;
  };
}

/**
 * Build 任务执行结果
 */
export interface BuildTaskResult {
  success: boolean;
  taskId: string;
  finalResponse?: string;
  modifiedFiles?: string[];
  generatedImages?: string[];
  error?: string;
  repairAttempts?: number;
  totalIterationsUsed?: number;
}
