import { supabase } from '../lib/supabase';
import { Model } from '../types/project';

export const modelService = {
  async getModelById(id: string): Promise<{ data: Model | null; error: unknown }> {
    const { data, error } = await supabase
      .from('models')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    return { data, error };
  },

  async getModelByApiName(apiName: string): Promise<{ data: Model | null; error: unknown }> {
    const { data, error } = await supabase
      .from('models')
      .select('*')
      .eq('api_name', apiName)
      .maybeSingle();

    return { data, error };
  },

  async getAllActiveModels(): Promise<{ data: Model[] | null; error: unknown }> {
    const { data, error } = await supabase
      .from('models')
      .select('*')
      .eq('is_active', true)
      .order('provider', { ascending: true })
      .order('display_name', { ascending: true });

    return { data, error };
  },

  async getModelsByProvider(provider: string): Promise<{ data: Model[] | null; error: unknown }> {
    const { data, error } = await supabase
      .from('models')
      .select('*')
      .eq('provider', provider)
      .eq('is_active', true)
      .order('display_name', { ascending: true });

    return { data, error };
  },

  async getAllModels(): Promise<{ data: Model[] | null; error: unknown }> {
    const { data, error } = await supabase
      .from('models')
      .select('*')
      .order('provider', { ascending: true })
      .order('display_name', { ascending: true });

    return { data, error };
  }
};
