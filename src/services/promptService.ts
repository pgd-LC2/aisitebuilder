import { supabase } from '../lib/supabase';
import { Prompt, PromptCategory } from '../types/project';

export const promptService = {
  async getPromptByKey(key: string): Promise<{ data: Prompt | null; error: unknown }> {
    const { data, error } = await supabase
      .from('prompts')
      .select('*')
      .eq('key', key)
      .eq('is_active', true)
      .maybeSingle();

    return { data, error };
  },

  async getPromptsByCategory(category: PromptCategory): Promise<{ data: Prompt[] | null; error: unknown }> {
    const { data, error } = await supabase
      .from('prompts')
      .select('*')
      .eq('category', category)
      .eq('is_active', true)
      .order('key', { ascending: true });

    return { data, error };
  },

  async getAllActivePrompts(): Promise<{ data: Prompt[] | null; error: unknown }> {
    const { data, error } = await supabase
      .from('prompts')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('key', { ascending: true });

    return { data, error };
  },

  async getMultiplePromptsByKeys(keys: string[]): Promise<{ data: Prompt[] | null; error: unknown }> {
    const { data, error } = await supabase
      .from('prompts')
      .select('*')
      .in('key', keys)
      .eq('is_active', true);

    return { data, error };
  }
};
