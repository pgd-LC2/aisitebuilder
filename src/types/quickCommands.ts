export type CommandIconType = 'clear' | 'create' | 'supabase' | 'accessibility' | 'seo' | 'usability' | 'misc' | 'workflow';

export interface QuickCommand {
  id: string;
  name: string;
  icon: CommandIconType;
  description: string;
}

export interface CommandCategory {
  name: string;
  commands: QuickCommand[];
}
