import { Link, Outlet } from '@tanstack/react-router';
import { Activity } from 'lucide-react';
import { useScraperStream } from '../scraper-stream';

export function RootLayout() {
  const { isScraping } = useScraperStream();

  return (
    <div className="h-screen w-full flex flex-col pt-4 px-4 pb-0 overflow-hidden relative selection:bg-brand-cyan selection:text-brand-dark">
      <header className="flex items-end justify-between border-b-2 border-brand-border pb-4 mb-6 relative">
        <div className="flex items-center gap-4">
          <div className="bg-brand-accent w-12 h-12 flex items-center justify-center brutal-shadow-cyan rotate-3 animate-flicker">
            <Activity className="text-brand-dark w-8 h-8" />
          </div>
          <div>
            <h1 className="text-4xl text-brand-text mb-[-4px]">IS-DL</h1>
            <p className="text-brand-muted font-mono text-sm tracking-widest uppercase">
              Intelligent Scraper
            </p>
          </div>
        </div>

        <div className="flex gap-1">
          <Link
            to="/"
            className="brutal-btn !border-brand-border !text-brand-text hover:!bg-brand-border px-8 data-[status=active]:!bg-brand-border data-[status=active]:!text-brand-dark"
          >
            Terminal
          </Link>
          <Link
            to="/results"
            className="brutal-btn !border-brand-border !text-brand-text hover:!bg-brand-border px-8 data-[status=active]:!bg-brand-border data-[status=active]:!text-brand-dark"
          >
            Payloads
          </Link>
        </div>
      </header>

      <main className="flex-1 flex gap-6 overflow-hidden pb-6 relative z-10 min-h-0">
        <Outlet />
      </main>

      <footer className="h-8 border-t border-brand-border flex items-center justify-between px-4 text-xs text-brand-muted uppercase tracking-widest">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            <span
              className={`w-2 h-2 block rounded-none ${isScraping ? 'bg-brand-accent animate-pulse' : 'bg-brand-ok'}`}
            ></span>
            SYS: {isScraping ? 'ACTIVE_SCAN' : 'ONLINE'}
          </span>
          <span>NET: SECURE</span>
        </div>
      </footer>
    </div>
  );
}
