import { Button } from '@/components/ui/button';
import { Search, Sun, Plus } from 'lucide-react';

const navItems = [
  { label: 'Docs', href: '#' },
  { label: 'Components', href: '#' },
  { label: 'Blocks', href: '#' },
  { label: 'Directory', href: '#' },
];

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">AI</span>
            <span>aisitebuilder</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            {navItems.map((item) => (
              <a key={item.label} href={item.href} className="transition-colors hover:text-foreground">
                {item.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="hidden gap-2 md:flex">
            <Search className="h-4 w-4" />
            Search
          </Button>
          <Button variant="ghost" size="icon" className="hidden md:inline-flex">
            <Sun className="h-4 w-4" />
            <span className="sr-only">切换主题</span>
          </Button>
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </div>
      </div>
    </header>
  );
}
