import { createRootRoute, Outlet } from '@tanstack/react-router';
import { Toaster } from 'sonner';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-screen bg-surface-dim text-on-surface">
      <nav className="fixed top-0 w-full z-50 bg-surface-dim/70 backdrop-blur-md border-b border-outline-variant/15 shadow-sm shadow-black/20 flex justify-between items-center px-6 h-16">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="" className="h-8 w-8" />
          <span className="text-xl font-black tracking-tighter text-on-surface uppercase italic font-headline">
            CYCLING FANTASY OPTIMIZER
          </span>
        </div>
        <div className="flex items-center gap-4">
          {/* Theme toggle placeholder — dark-only for now */}
        </div>
      </nav>
      <main className="pt-16">
        <Outlet />
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
