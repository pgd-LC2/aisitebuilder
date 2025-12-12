import { supabase } from '../lib/supabase';

export interface UserProfile {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export const userProfileService = {
  async getProfileByUserId(userId: string): Promise<{ data: UserProfile | null; error: any }> {
    const { data, error } = await supabase
      .from('users_profile')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    return { data, error };
  },

  async getProfileByUsername(username: string): Promise<{ data: UserProfile | null; error: any }> {
    const { data, error } = await supabase
      .from('users_profile')
      .select('*')
      .eq('username', username)
      .maybeSingle();

    return { data, error };
  },

  async getEmailByUsername(username: string): Promise<{ data: string | null; error: any }> {
    const { data, error } = await supabase
      .rpc('get_email_by_username', { p_username: username });

    return { data, error };
  },

  async updateProfile(
    userId: string,
    updates: Partial<Pick<UserProfile, 'username' | 'display_name' | 'avatar_url'>>
  ): Promise<{ data: UserProfile | null; error: any }> {
    const { data, error } = await supabase
      .from('users_profile')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    return { data, error };
  },

  async checkUsernameAvailable(username: string): Promise<{ data: boolean; error: any }> {
    const { data, error } = await supabase
      .from('users_profile')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (error) {
      return { data: false, error };
    }

    return { data: data === null, error: null };
  }
};
