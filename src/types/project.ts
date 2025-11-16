export type ProjectStatus = 'draft' | 'building' | 'completed' | 'failed';

export interface Project {
  id: string;
  user_id: string;
  title: string;
  description: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface ProjectVersion {
  id: string;
  project_id: string;
  version_number: number;
  code_snapshot: Record<string, any>;
  preview_url?: string;
  storage_path?: string;
  total_files?: number;
  total_size?: number;
  created_at: string;
}

export type BuildLogType = 'info' | 'success' | 'error';

export interface BuildLog {
  id: string;
  project_id: string;
  log_type: BuildLogType;
  message: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  project_id: string;
  role: MessageRole;
  content: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export type FileCategory = 'code' | 'asset' | 'document' | 'build';
export type FileSourceType = 'user_upload' | 'ai_generated';

export interface ProjectFile {
  id: string;
  project_id: string;
  version_id?: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  file_category: FileCategory;
  source_type: FileSourceType;
  is_public: boolean;
  public_url?: string;
  share_expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface FileUploadProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  result?: ProjectFile;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  size?: number;
  mimeType?: string;
  children?: FileTreeNode[];
  file?: ProjectFile;
}

export type AITaskType = 'chat_reply' | 'build_site' | 'refactor_code';
export type AITaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AITask {
  id: string;
  project_id: string;
  user_id: string;
  type: AITaskType;
  payload: Record<string, any>;
  status: AITaskStatus;
  result?: Record<string, any>;
  model?: string;
  error?: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
}
