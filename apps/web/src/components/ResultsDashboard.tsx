import { AlertTriangle, Database, Download, FileJson } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { ResultsInspector } from './ResultsInspector';

interface ApiFileEntry {
  filename: string;
  meta?: {
    location?: string;
    scrapedAt?: string;
    query?: string;
  };
  count: number;
}

interface ResultEntry {
  id: string;
  title: string;
  company: string;
  location: string;
  date: string;
  link: string;
  count: number;
  filename: string;
}

export function ResultsDashboard() {
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    fetch('http://localhost:3000/api/results')
      .then((res) => res.json())
      .then((data: { results?: ApiFileEntry[] }) => {
        const parsed = (data.results || []).map((file) => ({
          id: file.filename,
          title: file.meta?.query || file.filename,
          company: 'Multiple Targets',
          location: file.meta?.location || 'Any Region',
          date: file.meta?.scrapedAt
            ? new Date(file.meta.scrapedAt).toLocaleDateString()
            : 'Unknown',
          link: `http://localhost:3000/api/results/${file.filename}`,
          count: file.count,
          filename: file.filename,
        }));
        setResults(parsed);
        setLoading(false);
      })
      .catch(() => {
        setResults([]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-brand-panel brutal-border relative group overflow-hidden">
      <AnimatePresence mode="wait">
        {selectedFile ? (
          <ResultsInspector
            key="inspector"
            filename={selectedFile}
            onBack={() => setSelectedFile(null)}
          />
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex-1 flex flex-col h-full min-h-0 p-1"
          >
            <div className="flex justify-between items-center bg-brand-dark border-b border-brand-border px-4 py-3 relative z-10 shrink-0">
              <h2 className="text-xl flex items-center gap-3 text-brand-cyan tracking-widest font-display font-bold">
                <Database className="w-5 h-5" />
                <span className="mt-1">DATA_REPOSITORIES</span>
              </h2>

              <div className="flex gap-4 items-center">
                <div className="text-xs text-brand-muted uppercase tracking-widest bg-brand-dark border border-brand-border px-3 py-1 flex items-center gap-2">
                  <span className="w-2 h-2 bg-brand-ok inline-block rounded-full animate-pulse" />
                  STATUS: SECURE
                </div>
                <button
                  type="button"
                  className="brutal-btn !px-4 !py-1 !border-brand-ok !text-brand-ok hover:!bg-brand-ok flex items-center gap-2 text-sm"
                >
                  <Download className="w-4 h-4" /> EXPORT ALL
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto min-h-0 scrollbar-cyber p-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50">
                  <div className="w-16 h-16 border-4 border-brand-border border-t-brand-cyan rounded-full animate-spin" />
                  <p className="font-mono text-brand-cyan tracking-widest animate-pulse uppercase">
                    Querying Data Store...
                  </p>
                </div>
              ) : (
                <table className="w-full text-left font-mono text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-brand-accent bg-brand-dark text-brand-muted uppercase tracking-widest sticky top-0 z-20 brutal-shadow">
                      <th className="p-4 w-16 text-center">ID</th>
                      <th className="p-4">Operation Target</th>
                      <th className="p-4">Entity Volume</th>
                      <th className="p-4">Region</th>
                      <th className="p-4">Timestamp</th>
                      <th className="p-4 text-right">Inspect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((job, idx) => (
                      <motion.tr
                        key={job.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.05 }}
                        className="border-b border-brand-border hover:bg-brand-cyan/5 hover:border-brand-cyan transition-colors group/row cursor-crosshair relative"
                        onClick={() => setSelectedFile(job.filename)}
                      >
                        <td className="p-4 text-center text-brand-muted group-hover/row:text-brand-cyan">
                          {String(idx + 1).padStart(3, '0')}
                        </td>
                        <td className="p-4 font-bold text-brand-cyan group-hover/row:text-white transition-colors">
                          <span className="group-hover/row:underline decoration-brand-cyan decoration-2 underline-offset-4">
                            {job.title}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="bg-[#1a1a1a] px-3 py-1 border border-brand-border group-hover/row:border-brand-cyan transition-colors text-brand-text">
                            {job.count} TARGETS
                          </span>
                        </td>
                        <td className="p-4 flex items-center gap-2 mt-1">
                          {job.location === 'Remote' ||
                          job.location === 'Any Region' ||
                          !job.location ? (
                            <span className="w-2 h-2 bg-brand-ok inline-block rounded-none" />
                          ) : (
                            <span className="w-2 h-2 bg-brand-accent inline-block rounded-none" />
                          )}
                          {job.location || 'Any Region'}
                        </td>
                        <td className="p-4 text-brand-muted">{job.date}</td>
                        <td className="p-4 text-right">
                          <button
                            type="button"
                            className="text-brand-muted group-hover/row:text-brand-accent transition-colors inline-block hover:scale-110 transform"
                            onClick={(e) => {
                              e.stopPropagation(); // Prevents row click if button is clicked
                              window.open(job.link, '_blank');
                            }}
                            title="View Raw JSON"
                          >
                            <FileJson className="w-5 h-5 inline-block" />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                    {results.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="text-center p-12 text-brand-muted"
                        >
                          <AlertTriangle className="w-8 h-8 mx-auto mb-4 text-brand-error opacity-50" />
                          NO RECORDS FOUND IN CURRENT DATASET
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer info */}
            <div className="bg-brand-dark border-t border-brand-border px-4 py-2 flex justify-between text-xs text-brand-muted uppercase font-mono tracking-widest z-10 shrink-0">
              <div>Total Datasets: {results.length}</div>
              <div className="text-brand-ok">INTEGRITY CHECK PASSED</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
