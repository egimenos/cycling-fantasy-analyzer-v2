import { useCallback, useEffect, useState } from 'react';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { Moon, Sun } from 'lucide-react';

export const Route = createRootRoute({
  component: RootLayout,
});

function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('theme');
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggle = useCallback(() => setIsDark((prev) => !prev), []);

  return { isDark, toggle };
}

function RootLayout() {
  const { isDark, toggle } = useTheme();

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-surface-dim text-on-surface">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-primary focus:text-on-primary focus:px-4 focus:py-2 focus:rounded-sm focus:font-mono focus:text-sm"
        >
          Skip to main content
        </a>
        <header>
          <nav
            data-testid="nav-bar"
            className="fixed top-0 w-full z-50 bg-surface-dim/70 backdrop-blur-md border-b border-outline-variant/15 shadow-sm shadow-black/20"
          >
            <div className="flex justify-between items-center px-4 md:px-5 lg:px-8 xl:px-12 h-14 md:h-16">
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                <img src="/logo.svg" alt="" className="h-7 w-7 md:h-8 md:w-8 flex-shrink-0" />
                <span className="text-base md:text-xl font-black tracking-tighter text-on-surface uppercase italic font-headline">
                  CYCLING FANTASY OPTIMIZER
                </span>
              </div>
              <div className="flex items-center gap-4">
                <button
                  data-testid="nav-theme-toggle"
                  onClick={toggle}
                  className="p-2 rounded-sm hover:bg-surface-container-high transition-colors text-on-surface-variant"
                  aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <div className="h-px bg-gradient-to-r from-transparent via-secondary/30 to-transparent" />
          </nav>
        </header>
        <main id="main-content" className="pt-14 md:pt-16">
          <Outlet />
        </main>
        <Toaster richColors position="top-right" />
      </div>
    </TooltipProvider>
  );
}
