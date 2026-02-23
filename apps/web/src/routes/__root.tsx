import { Link, Outlet } from '@tanstack/react-router';
import { Activity } from 'lucide-react';
import { useEffect, useState } from 'react';

export function RootLayout() {
  const [isScraping, setIsScraping] = useState(false);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (eventSource) {
        eventSource.close();
      }

      eventSource = new EventSource('http://localhost:3000/api/logs');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'status') {
            setIsScraping(data.isScraping);
          }
        } catch (err) {
          console.error('Error parsing SSE data', err);
        }
      };

      eventSource.onerror = () => {
        if (eventSource) eventSource.close();
        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  return (
    <div className="min-h-screen w-full flex flex-col pt-4 px-4 pb-0 overflow-hidden relative selection:bg-brand-cyan selection:text-brand-dark">
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

      <main className="flex-1 flex gap-6 overflow-hidden pb-6 relative z-10">
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
