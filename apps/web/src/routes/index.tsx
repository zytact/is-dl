import { Square, Terminal as TerminalIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { ScraperForm, type ScraperFormData } from '../components/ScraperForm';
import { TerminalLogs } from '../components/TerminalLogs';

export function TerminalPage() {
  const [isScraping, setIsScraping] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

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

  const handleStartScrape = async (data: ScraperFormData) => {
    console.log('Starting scrape with:', data);
    setLogs([]);
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

  const handleStopScrape = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/abort', {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok) {
        setLogs((prev) => [
          ...prev,
          `[ERROR] Failed to abort: ${result.error || response.statusText}`,
        ]);
      } else {
        setLogs((prev) => [...prev, '[SYSTEM] Abort signal sent to backend.']);
      }
    } catch (err) {
      setLogs((prev) => [
        ...prev,
        `[ERROR] Network failure during abort: ${err instanceof Error ? err.message : String(err)}`,
      ]);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="w-full flex gap-6 h-full"
    >
      <div className="w-[400px] flex flex-col gap-6 shrink-0 h-full overflow-y-auto scrollbar-cyber pr-2">
        <ScraperForm onStart={handleStartScrape} isScraping={isScraping} />
      </div>
      <div className="flex-1 border-l border-brand-border pl-6 flex flex-col h-full">
        <div className="flex items-center gap-4 border-b border-brand-border pb-2 mb-4">
          <h2 className="text-xl flex items-center gap-2">
            <TerminalIcon className="w-5 h-5 text-brand-cyan" />
            Console Output
          </h2>
          {isScraping ? (
            <button
              type="button"
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
        <TerminalLogs logs={logs} isScraping={isScraping} />
      </div>
    </motion.div>
  );
}
