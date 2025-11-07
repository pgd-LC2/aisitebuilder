import { supabase } from '../lib/supabase';
import { ProjectVersion } from '../types/project';

export const versionService = {
  async createVersion(
    projectId: string,
    versionNumber: number,
    codeSnapshot: Record<string, any>,
    previewUrl?: string,
    copyFromVersionId?: string
  ): Promise<{ data: ProjectVersion | null; error: any }> {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        return { data: null, error: '未授权' };
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/create-version`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          versionNumber,
          codeSnapshot,
          previewUrl,
          copyFromVersionId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { data: null, error: errorData.error };
      }

      const result = await response.json();
      return { data: result.version, error: null };
    } catch (error) {
      console.error('创建版本失败:', error);
      return { data: null, error };
    }
  },

  async getVersionsByProjectId(projectId: string): Promise<{ data: ProjectVersion[] | null; error: any }> {
    const { data, error } = await supabase
      .from('project_versions')
      .select('*')
      .eq('project_id', projectId)
      .order('version_number', { ascending: false });

    return { data, error };
  },

  async getLatestVersion(projectId: string): Promise<{ data: ProjectVersion | null; error: any }> {
    const { data, error } = await supabase
      .from('project_versions')
      .select('*')
      .eq('project_id', projectId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    return { data, error };
  },

  async deleteVersion(versionId: string): Promise<{ error: any }> {
    const { data: files } = await supabase
      .from('project_files')
      .select('id')
      .eq('version_id', versionId);

    if (files && files.length > 0) {
      for (const file of files) {
        await fileService.deleteFile(file.id);
      }
    }

    const { error } = await supabase
      .from('project_versions')
      .delete()
      .eq('id', versionId);

    return { error };
  },

  async getVersionFileStats(versionId: string): Promise<{
    data: { totalFiles: number; totalSize: number } | null;
    error: any;
  }> {
    const { data, error } = await supabase
      .from('project_versions')
      .select('total_files, total_size')
      .eq('id', versionId)
      .maybeSingle();

    if (error || !data) {
      return { data: null, error };
    }

    return {
      data: {
        totalFiles: data.total_files || 0,
        totalSize: data.total_size || 0
      },
      error: null
    };
  },

  async updateVersion(
    versionId: string,
    updates: Partial<ProjectVersion>
  ): Promise<{ data: ProjectVersion | null; error: any }> {
    const { data, error } = await supabase
      .from('project_versions')
      .update(updates)
      .eq('id', versionId)
      .select()
      .maybeSingle();

    return { data, error };
  }
};
