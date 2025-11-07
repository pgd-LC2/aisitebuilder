import { supabase } from '../lib/supabase';
import { ProjectFile, FileCategory, FileSourceType, FileTreeNode } from '../types/project';

const BUCKET_NAME = 'project-files';

export const fileService = {
  async uploadFile(
    projectId: string,
    versionId: string | undefined,
    file: File,
    category: FileCategory,
    sourceType: FileSourceType = 'user_upload',
    folderPath?: string
  ): Promise<{ data: ProjectFile | null; error: any }> {
    try {
      const versionPath = versionId ? `v${versionId}` : 'shared';
      const basePath = folderPath || '';
      const filePath = `${projectId}/${versionPath}/${basePath}${file.name}`.replace(/\/+/g, '/');

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('上传文件到存储桶失败:', uploadError);
        return { data: null, error: uploadError };
      }

      const fileRecord = {
        project_id: projectId,
        version_id: versionId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
        file_category: category,
        source_type: sourceType,
        is_public: false
      };

      const { data, error } = await supabase
        .from('project_files')
        .insert(fileRecord)
        .select()
        .maybeSingle();

      if (error) {
        await supabase.storage.from(BUCKET_NAME).remove([filePath]);
        return { data: null, error };
      }

      return { data, error: null };
    } catch (err) {
      console.error('上传文件异常:', err);
      return { data: null, error: err };
    }
  },

  async uploadMultipleFiles(
    projectId: string,
    versionId: string | undefined,
    files: File[],
    category: FileCategory,
    sourceType: FileSourceType = 'user_upload',
    onProgress?: (fileName: string, progress: number) => void
  ): Promise<{ data: ProjectFile[] | null; error: any }> {
    const results: ProjectFile[] = [];
    const errors: any[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      onProgress?.(file.name, (i / files.length) * 100);

      const { data, error } = await this.uploadFile(
        projectId,
        versionId,
        file,
        category,
        sourceType
      );

      if (error) {
        errors.push({ file: file.name, error });
      } else if (data) {
        results.push(data);
      }
    }

    onProgress?.('', 100);

    if (errors.length > 0) {
      return { data: results.length > 0 ? results : null, error: errors };
    }

    return { data: results, error: null };
  },

  async getFilesByProject(
    projectId: string,
    versionId?: string
  ): Promise<{ data: ProjectFile[] | null; error: any }> {
    let query = supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (versionId) {
      query = query.eq('version_id', versionId);
    }

    const { data, error } = await query;
    return { data, error };
  },

  async getFileTree(
    projectId: string,
    versionId?: string
  ): Promise<{ data: FileTreeNode | null; error: any }> {
    const { data: files, error } = await this.getFilesByProject(projectId, versionId);

    if (error || !files) {
      return { data: null, error };
    }

    const root: FileTreeNode = {
      name: 'root',
      path: '',
      type: 'folder',
      children: []
    };

    files.forEach(file => {
      const pathParts = file.file_path.split('/').slice(2);
      let currentNode = root;

      pathParts.forEach((part, index) => {
        const isLastPart = index === pathParts.length - 1;

        if (isLastPart) {
          currentNode.children?.push({
            name: part,
            path: file.file_path,
            type: 'file',
            size: file.file_size,
            mimeType: file.mime_type,
            file: file
          });
        } else {
          let folderNode = currentNode.children?.find(
            child => child.name === part && child.type === 'folder'
          );

          if (!folderNode) {
            folderNode = {
              name: part,
              path: pathParts.slice(0, index + 1).join('/'),
              type: 'folder',
              children: []
            };
            currentNode.children?.push(folderNode);
          }

          currentNode = folderNode;
        }
      });
    });

    return { data: root, error: null };
  },

  async downloadFile(fileId: string): Promise<{ data: string | null; error: any }> {
    const { data: fileRecord, error: fetchError } = await supabase
      .from('project_files')
      .select('*')
      .eq('id', fileId)
      .maybeSingle();

    if (fetchError || !fileRecord) {
      return { data: null, error: fetchError || new Error('文件记录不存在') };
    }

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(fileRecord.file_path, 3600);

    if (error) {
      return { data: null, error };
    }

    return { data: data.signedUrl, error: null };
  },

  async deleteFile(fileId: string): Promise<{ error: any }> {
    const { data: fileRecord, error: fetchError } = await supabase
      .from('project_files')
      .select('*')
      .eq('id', fileId)
      .maybeSingle();

    if (fetchError || !fileRecord) {
      return { error: fetchError || new Error('文件记录不存在') };
    }

    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([fileRecord.file_path]);

    if (storageError) {
      console.error('从存储桶删除文件失败:', storageError);
    }

    const { error } = await supabase
      .from('project_files')
      .delete()
      .eq('id', fileId);

    return { error };
  },

  async generateShareLink(
    fileId: string,
    expiresIn: number = 604800
  ): Promise<{ data: { url: string; expiresAt: string } | null; error: any }> {
    const { data: fileRecord, error: fetchError } = await supabase
      .from('project_files')
      .select('*')
      .eq('id', fileId)
      .maybeSingle();

    if (fetchError || !fileRecord) {
      return { data: null, error: fetchError || new Error('文件记录不存在') };
    }

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(fileRecord.file_path, expiresIn);

    if (error) {
      return { data: null, error };
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const { error: updateError } = await supabase
      .from('project_files')
      .update({
        is_public: true,
        public_url: data.signedUrl,
        share_expires_at: expiresAt
      })
      .eq('id', fileId);

    if (updateError) {
      return { data: null, error: updateError };
    }

    return {
      data: {
        url: data.signedUrl,
        expiresAt
      },
      error: null
    };
  },

  async revokeShareLink(fileId: string): Promise<{ error: any }> {
    const { error } = await supabase
      .from('project_files')
      .update({
        is_public: false,
        public_url: null,
        share_expires_at: null
      })
      .eq('id', fileId);

    return { error };
  },

  async copyFilesToNewVersion(
    sourceVersionId: string,
    targetVersionId: string,
    targetProjectId: string
  ): Promise<{ data: ProjectFile[] | null; error: any }> {
    const { data: sourceFiles, error: fetchError } = await supabase
      .from('project_files')
      .select('*')
      .eq('version_id', sourceVersionId);

    if (fetchError || !sourceFiles || sourceFiles.length === 0) {
      return { data: null, error: fetchError };
    }

    const copiedFiles: ProjectFile[] = [];
    const errors: any[] = [];

    for (const sourceFile of sourceFiles) {
      const sourcePath = sourceFile.file_path;
      const targetPath = sourcePath.replace(
        /\/v[^/]+\//,
        `/v${targetVersionId}/`
      );

      const { error: copyError } = await supabase.storage
        .from(BUCKET_NAME)
        .copy(sourcePath, targetPath);

      if (copyError) {
        errors.push({ file: sourceFile.file_name, error: copyError });
        continue;
      }

      const newFileRecord = {
        project_id: targetProjectId,
        version_id: targetVersionId,
        file_name: sourceFile.file_name,
        file_path: targetPath,
        file_size: sourceFile.file_size,
        mime_type: sourceFile.mime_type,
        file_category: sourceFile.file_category,
        source_type: sourceFile.source_type,
        is_public: false
      };

      const { data: newFile, error: insertError } = await supabase
        .from('project_files')
        .insert(newFileRecord)
        .select()
        .maybeSingle();

      if (insertError) {
        errors.push({ file: sourceFile.file_name, error: insertError });
      } else if (newFile) {
        copiedFiles.push(newFile);
      }
    }

    if (errors.length > 0 && copiedFiles.length === 0) {
      return { data: null, error: errors };
    }

    if (copiedFiles.length > 0) {
      const totalSize = copiedFiles.reduce((sum, file) => sum + (file.file_size || 0), 0);

      await supabase
        .from('project_versions')
        .update({
          total_files: copiedFiles.length,
          total_size: totalSize
        })
        .eq('id', targetVersionId);
    }

    return { data: copiedFiles, error: errors.length > 0 ? errors : null };
  },

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  },

  getFileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎥';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('zip') || mimeType.includes('compressed')) return '📦';
    if (mimeType.includes('text') || mimeType.includes('javascript') || mimeType.includes('json')) return '📝';
    return '📎';
  }
};
