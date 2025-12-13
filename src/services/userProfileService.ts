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

export interface AvatarTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  resize?: 'cover' | 'contain' | 'fill';
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
  },

  getOptimizedAvatarUrl(
    filePath: string,
    options: AvatarTransformOptions = {}
  ): string {
    const { width = 200, height = 200, quality = 80, resize = 'cover' } = options;
    
    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath, {
        transform: {
          width,
          height,
          quality,
          resize
        }
      });
    
    return data.publicUrl;
  },

  getAvatarUrlWithTransform(
    avatarUrl: string | null,
    options: AvatarTransformOptions = {}
  ): string | null {
    if (!avatarUrl) return null;
    
    const { width = 200, height = 200, quality = 80 } = options;
    
    const url = new URL(avatarUrl);
    url.searchParams.set('width', width.toString());
    url.searchParams.set('height', height.toString());
    url.searchParams.set('quality', quality.toString());
    
    return url.toString();
  }
};
