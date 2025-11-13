import { supabase } from '../lib/supabase';
import { Project, ProjectStatus } from '../types/project';

export const projectService = {
  async createProject(userId: string, title: string, description: string): Promise<{ data: Project | null; error: any }> {
    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        title,
        description,
        status: 'draft'
      })
      .select()
      .maybeSingle();

    return { data, error };
  },

  async getProjectsByUserId(userId: string, limit?: number): Promise<{ data: Project[] | null; error: any }> {
    let query = supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    return { data, error };
  },

  async getProjectById(projectId: string): Promise<{ data: Project | null; error: any }> {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .maybeSingle();

    return { data, error };
  },

  async updateProjectStatus(projectId: string, status: ProjectStatus): Promise<{ data: Project | null; error: any }> {
    const { data, error } = await supabase
      .from('projects')
      .update({ status })
      .eq('id', projectId)
      .select()
      .maybeSingle();

    return { data, error };
  },

  async updateProject(projectId: string, updates: Partial<Project>): Promise<{ data: Project | null; error: any }> {
    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .select()
      .maybeSingle();

    return { data, error };
  },

  async deleteProject(projectId: string): Promise<{ error: any }> {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    return { error };
  },

  async searchProjects(userId: string, searchTerm: string): Promise<{ data: Project[] | null; error: any }> {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
      .order('created_at', { ascending: false });

    return { data, error };
  }
};
