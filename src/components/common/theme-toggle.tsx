'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  if (!mounted) {
    return (
      <div className="flex h-8 w-24 items-center rounded border border-border bg-muted/40 p-0.5" />
    );
  }

  return (
    <div className="flex items-center rounded border border-border bg-muted/30 p-0.5">
      <Button
        variant="ghost"
        size="sm"
        className={`h-7 w-7 p-0 ${theme === 'light' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground'}`}
        onClick={() => setTheme('light')}
        aria-label="Light mode"
      >
        <Sun className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-7 w-7 p-0 ${theme === 'dark' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground'}`}
        onClick={() => setTheme('dark')}
        aria-label="Dark mode"
      >
        <Moon className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-7 w-7 p-0 ${theme === 'system' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground'}`}
        onClick={() => setTheme('system')}
        aria-label="System mode"
      >
        <Monitor className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

