import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Square, Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ResultsDashboard } from './components/ResultsDashboard';
import { ScraperForm } from './components/ScraperForm';
import { TerminalLogs } from './components/TerminalLogs';

export default function App() {
  const [activeTab, setActiveTab] = useState<'scraper' | 'results'>('scraper');
  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Setup SSE for logs
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
          if (data.type === 'log') {
            setLogs((prev) => [...prev, data.message]);
          } else if (data.type === 'status') {
            setIsScraping(data.isScraping);
          }
        } catch (err) {
          console.error('Error parsing SSE data', err);
        }
      };

      eventSource.onerror = (e) => {
        console.error('SSE Connection lost or failed. Reconnecting...', e);
        if (eventSource) eventSource.close();
        reconnectTimeout = setTimeout(connect, 3000);
      };

      eventSource.onopen = () => {
        console.log('SSE Connection established.');
        // Don't clear logs here otherwise we wipe on reconnect
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

  const handleStartScrape = async (data: any) => {
    console.log('Starting scrape with:', data);
    setLogs([]); // Clear logs when explicitly starting
    setLogs(['[SYSTEM] Initializing extraction sequence...']);

    try {
      const response = await fetch('http://localhost:3000/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (!response.ok) {
        setLogs((prev) => [
          ...prev,
          `[ERROR] Failed to start: ${result.error || response.statusText}`,
        ]);
      }
    } catch (err) {
      setLogs((prev) => [
        ...prev,
        `[ERROR] Network failure: ${err instanceof Error ? err.message : String(err)}`,
      ]);
    }
  };

  const handleStopScrape = () => {
    setIsScraping(false);
    setLogs((prev) => [
      ...prev,
      '[SYSTEM] WARNING: Backend abort not fully supported yet.',
    ]);
  };

  return (
    <div className="min-h-screen w-full flex flex-col pt-4 px-4 pb-0 overflow-hidden relative selection:bg-brand-cyan selection:text-brand-dark">
      {/* HEADER */}
      <header className="flex items-end justify-between border-b-2 border-brand-border pb-4 mb-6 relative">
        <div className="flex items-center gap-4">
          <div className="bg-brand-accent w-12 h-12 flex items-center justify-center brutal-shadow-cyan rotate-3 animate-flicker">
            <Activity className="text-brand-dark w-8 h-8" />
          </div>
          <div>
            <h1 className="text-4xl text-brand-text mb-[-4px]">
              IS-DL <span className="text-brand-accent">v2.0</span>
            </h1>
            <p className="text-brand-muted font-mono text-sm tracking-widest uppercase">
              Intelligent Scraper // Data Link
            </p>
          </div>
        </div>

        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('scraper')}
            className={`brutal-btn !border-brand-border !text-brand-text hover:!bg-brand-border px-8 ${activeTab === 'scraper' ? '!bg-brand-text !text-brand-dark' : ''}`}
          >
            Terminal
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`brutal-btn !border-brand-border !text-brand-text hover:!bg-brand-border px-8 ${activeTab === 'results' ? '!bg-brand-cyan !text-brand-dark !border-brand-cyan' : ''}`}
          >
            Payloads
          </button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex gap-6 overflow-hidden pb-6 relative z-10">
        <AnimatePresence mode="wait">
          {activeTab === 'scraper' ? (
            <motion.div
              key="scraper"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="w-full flex gap-6 h-full"
            >
              <div className="w-[400px] flex flex-col gap-6 shrink-0 h-full overflow-y-auto scrollbar-cyber pr-2">
                <ScraperForm
                  onStart={handleStartScrape}
                  isScraping={isScraping}
                />
              </div>
              <div className="flex-1 border-l border-brand-border pl-6 flex flex-col h-full">
                <div className="flex justify-between items-center border-b border-brand-border pb-2 mb-4">
                  <h2 className="text-xl flex items-center gap-2">
                    <Terminal className="w-5 h-5 text-brand-cyan" />
                    Console Output
                  </h2>
                  <div className="flex gap-3">
                    {isScraping ? (
                      <button
                        onClick={handleStopScrape}
                        className="brutal-btn !border-brand-error !text-brand-error hover:!bg-brand-error hover:!text-brand-dark flex items-center gap-2 text-sm !py-1"
                      >
                        <Square className="w-4 h-4" /> ABORT
                      </button>
                    ) : (
                      <div className="text-brand-muted text-sm uppercase px-2 py-1 border border-brand-border">
                        IDLE
                      </div>
                    )}
                  </div>
                </div>
                <TerminalLogs logs={logs} isScraping={isScraping} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="results"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full flex flex-col"
            >
              <ResultsDashboard />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* STATUS BAR */}
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
        <div>BUN + REACT + VITE // DEPLOYED SECURELY</div>
      </footer>
    </div>
  );
}
