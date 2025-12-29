import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

const navItems = [
  { label: 'Docs', href: '#' },
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
          <Button
            size="sm"
            className="hidden bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 md:inline-flex"
          >
            登录
          </Button>
        </div>
      </div>
    </header>
  );
}
