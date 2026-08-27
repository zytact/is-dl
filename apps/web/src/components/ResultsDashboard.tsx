import { AlertTriangle, Database, Download, FileJson, Sparkles, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { SOURCE_LABELS, type SourceRun } from '../types';
import { ResultsInspector } from './ResultsInspector';

interface ApiFileEntry {
  filename: string;
  meta?: {
    location?: string;
    scrapedAt?: string;
    query?: string;
    sources?: SourceRun[];
  };
  count: number;
  aiAgentSummary?: {
    detectedCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
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
  hasAiAgentSignals: boolean;
  skippedSources: SourceRun[];
}

export function ResultsDashboard() {
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const fetchResults = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:3000/api/results');
      const data = (await res.json()) as { results?: ApiFileEntry[] };
      const parsed = (data.results || []).map((file) => ({
        id: file.filename,
        title: file.meta?.query || file.filename,
        company: 'Multiple Targets',
        location: file.meta?.location || 'Any Region',
        date: file.meta?.scrapedAt ? new Date(file.meta.scrapedAt).toLocaleDateString() : 'Unknown',
        link: `http://localhost:3000/api/results/${file.filename}`,
        count: file.count,
        filename: file.filename,
        hasAiAgentSignals: (file.aiAgentSummary?.detectedCount || 0) > 0,
        skippedSources: (file.meta?.sources || []).filter((run) => run.status === 'failed'),
      }));
      setResults(parsed);
    } catch (err) {
      console.error('Failed to fetch results', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDeleteRequest = (e: React.MouseEvent, filename: string) => {
    e.stopPropagation();

    setConfirmDelete((current) => (current === filename ? null : filename));
  };

  const handleDeleteConfirm = async (e: React.MouseEvent, filename: string) => {
    e.stopPropagation();

    setIsDeleting(filename);
    setDeleteError(null);
    try {
      const res = await fetch(`http://localhost:3000/api/results/${filename}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || 'Failed to delete');
      }
      setResults((prev) => prev.filter((r) => r.filename !== filename));
      setConfirmDelete(null);
      if (selectedFile === filename) {
        setSelectedFile(null);
      }
    } catch (err) {
      console.error('Failed to purge dataset', err);
      setDeleteError('Delete failed. Check API logs or refresh.');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleDeleteCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(null);
  };

  const handleDownloadSingle = async (e: React.MouseEvent, filename: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`http://localhost:3000/api/results/${filename}`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download', err);
    }
  };

  const handleExportAll = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch('http://localhost:3000/api/results/export');
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || 'Export failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'results-export.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export results', err);
      setExportError('Export failed. Check API logs or refresh.');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    void fetchResults();
  }, [fetchResults]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-brand-panel brutal-border relative group overflow-hidden">
      <AnimatePresence mode="wait">
        {selectedFile ? (
          <ResultsInspector
            key="inspector"
            filename={selectedFile}
            onBack={() => setSelectedFile(null)}
            onDeleted={() => {
              setSelectedFile(null);
              void fetchResults();
            }}
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
                  onClick={handleExportAll}
                  className={`brutal-btn !px-4 !py-1 flex items-center gap-2 text-sm transition-colors ${
                    exporting
                      ? '!border-brand-muted !text-brand-muted'
                      : '!border-brand-ok !text-brand-ok hover:!bg-brand-ok hover:!text-brand-dark'
                  }`}
                  disabled={exporting}
                >
                  {exporting ? (
                    <div className="w-4 h-4 border-2 border-brand-muted border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {exporting ? 'EXPORTING...' : 'EXPORT ALL'}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto min-h-0 scrollbar-cyber p-4">
              {deleteError && (
                <div className="mb-4 border border-brand-error bg-brand-error/10 text-brand-error px-4 py-2 text-xs font-mono uppercase tracking-widest">
                  {deleteError}
                </div>
              )}
              {exportError && (
                <div className="mb-4 border border-brand-error bg-brand-error/10 text-brand-error px-4 py-2 text-xs font-mono uppercase tracking-widest">
                  {exportError}
                </div>
              )}
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
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((job, idx) => (
                      <motion.tr
                        key={job.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{
                          opacity: isDeleting === job.filename ? 0.3 : 1,
                          y: 0,
                        }}
                        transition={{ duration: 0.3, delay: idx * 0.05 }}
                        className="border-b border-brand-border transition-colors group/row cursor-crosshair relative hover:bg-brand-cyan/5 hover:border-brand-cyan"
                        onClick={() => setSelectedFile(job.filename)}
                      >
                        <td className="p-4 text-center text-brand-muted group-hover/row:text-brand-cyan">
                          {String(idx + 1).padStart(3, '0')}
                        </td>
                        <td className="p-4 font-bold text-brand-cyan group-hover/row:text-white transition-colors">
                          <span className="group-hover/row:underline decoration-brand-cyan decoration-2 underline-offset-4">
                            {job.title}
                          </span>
                          {job.hasAiAgentSignals && (
                            <span className="ml-3 inline-flex items-center gap-1 border border-brand-accent bg-brand-accent/10 px-2 py-1 text-[10px] text-brand-accent tracking-widest align-middle">
                              <Sparkles className="w-3 h-3" />
                              AI MENTIONED
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          <span className="bg-[#1a1a1a] px-3 py-1 border border-brand-border group-hover/row:border-brand-cyan transition-colors text-brand-text">
                            {job.count} TARGETS
                          </span>
                          {job.skippedSources.map((run) => (
                            <span
                              key={run.source}
                              className="ml-2 inline-block border border-brand-accent bg-brand-accent/10 px-2 py-1 text-[10px] text-brand-accent tracking-widest align-middle"
                              title={run.error || 'No reason recorded'}
                            >
                              {SOURCE_LABELS[run.source].toUpperCase()} SKIPPED
                            </span>
                          ))}
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
                        <td className="p-4 text-right relative">
                          <div className="flex items-center justify-end gap-4 h-full">
                            <button
                              type="button"
                              className="text-brand-muted hover:text-brand-accent transition-colors flex items-center justify-center hover:scale-110 transform"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(job.link, '_blank');
                              }}
                              title="View Raw JSON"
                            >
                              <FileJson className="w-5 h-5" />
                            </button>
                            <button
                              type="button"
                              className="text-brand-muted hover:text-brand-ok transition-colors flex items-center justify-center hover:scale-110 transform"
                              onClick={(e) => handleDownloadSingle(e, job.filename)}
                              title="Download JSON"
                            >
                              <Download className="w-5 h-5" />
                            </button>
                            <button
                              type="button"
                              className={`transition-all duration-200 flex items-center justify-center h-8 min-w-[32px] ${
                                isDeleting === job.filename
                                  ? 'border border-brand-error text-brand-error'
                                  : 'border border-transparent text-brand-muted hover:text-brand-error hover:border-brand-error/50'
                              }`}
                              onClick={(e) => handleDeleteRequest(e, job.filename)}
                              title="Purge Record"
                              disabled={isDeleting === job.filename}
                            >
                              {isDeleting === job.filename ? (
                                <div className="w-4 h-4 border-2 border-brand-error border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Trash2 className="w-5 h-5 hover:scale-110 transform transition-transform" />
                              )}
                            </button>
                          </div>
                          <AnimatePresence>
                            {confirmDelete === job.filename && (
                              <motion.div
                                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                transition={{ duration: 0.2, ease: 'easeOut' }}
                                className="absolute right-4 top-1/2 -translate-y-1/2 bg-brand-dark border border-brand-error/60 text-brand-text font-mono text-xs uppercase tracking-widest px-3 py-2 flex items-center gap-3 brutal-shadow"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="text-brand-error">Confirm purge?</span>
                                <button
                                  type="button"
                                  className="border border-brand-border px-2 py-1 text-brand-muted hover:text-brand-text hover:border-brand-text transition-colors"
                                  onClick={handleDeleteCancel}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="border border-brand-error bg-brand-error/10 px-2 py-1 text-brand-error hover:bg-brand-error hover:text-brand-dark transition-colors"
                                  onClick={(e) => handleDeleteConfirm(e, job.filename)}
                                >
                                  Purge
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </td>
                      </motion.tr>
                    ))}
                    {results.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center p-12 text-brand-muted">
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
