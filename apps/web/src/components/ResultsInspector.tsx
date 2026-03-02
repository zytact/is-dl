import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  Database,
  Download,
  ExternalLink,
  FileJson,
  Globe,
  MapPin,
  Search,
  Server,
  Terminal,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

interface Job {
  jobId: string;
  jobUrl: string;
  title: string;
  companyName: string;
  companyUrl: string;
  locationText: string;
  postedAtText: string;
  postedAtIso: string | null;
  jobType: string;
  alumniCount: string | null;
  descriptionText: string;
  requirementsText: string;
}

interface Meta {
  query?: string;
  location?: string;
  filters?: Record<string, unknown>;
  scrapedAt?: string;
  source?: string;
  count?: number;
}

interface ResultsData {
  meta: Meta;
  jobs: Job[];
}

interface ResultsInspectorProps {
  filename: string;
  onBack: () => void;
  onDeleted: () => void;
}

export function ResultsInspector({
  filename,
  onBack,
  onDeleted,
}: ResultsInspectorProps) {
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`http://localhost:3000/api/results/${filename}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch data payload');
        return res.json();
      })
      .then((json: ResultsData) => {
        setData(json);
        if (json.jobs && json.jobs.length > 0) {
          const firstJob = json.jobs[0];
          if (firstJob) {
            setSelectedJob(firstJob);
          }
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [filename]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-brand-panel brutal-border p-1">
        <div className="w-16 h-16 border-4 border-brand-border border-t-brand-accent rounded-full animate-spin mb-4" />
        <p className="font-mono text-brand-accent tracking-widest animate-pulse uppercase text-sm">
          DECRYPTING PAYLOAD: {filename}...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-brand-panel brutal-border p-1 text-brand-error">
        <Terminal className="w-12 h-12 mb-4 opacity-50" />
        <p className="font-mono tracking-widest uppercase">
          FATAL ERROR: {error}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="brutal-btn mt-6 text-sm"
        >
          RETURN TO DATABANK
        </button>
      </div>
    );
  }

  const handleDeleteRequest = () => {
    setConfirmDelete((current) => !current);
  };

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`http://localhost:3000/api/results/${filename}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || 'Failed to delete');
      }
      setConfirmDelete(false);
      onDeleted();
    } catch (err) {
      console.error('Failed to purge dataset', err);
      setDeleteError('Delete failed. Check API logs or refresh.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = async () => {
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

  const { meta, jobs } = data;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex-1 flex flex-col h-full min-h-0 bg-brand-panel brutal-border relative overflow-hidden"
    >
      {/* Header */}
      <div className="flex justify-between items-center bg-brand-dark border-b border-brand-border px-4 py-3 shrink-0">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="text-brand-muted hover:text-brand-cyan transition-colors"
            title="Back to List"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h2 className="text-xl flex items-center gap-3 text-brand-accent tracking-widest font-display font-bold">
              <Database className="w-5 h-5" />
              INSPECTOR_PROTOCOL
            </h2>
            <p className="text-xs text-brand-muted font-mono">{filename}</p>
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs font-mono uppercase text-brand-muted">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-brand-cyan" />
            <span className="text-brand-text">Q:</span> {meta.query || 'N/A'}
          </div>
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-brand-cyan" />
            <span className="text-brand-text">SRC:</span>{' '}
            {meta.source?.toUpperCase() || 'UNKNOWN'}
          </div>
          <div className="flex items-center gap-2 bg-brand-dark border border-brand-border px-3 py-1 brutal-shadow-cyan text-brand-cyan">
            <span className="w-2 h-2 bg-brand-cyan inline-block rounded-none animate-pulse" />
            RECORDS: {jobs.length}
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="text-brand-muted hover:text-brand-accent transition-colors flex items-center justify-center hover:scale-110 transform"
              onClick={() =>
                window.open(
                  `http://localhost:3000/api/results/${filename}`,
                  '_blank',
                )
              }
              title="View Raw JSON"
            >
              <FileJson className="w-5 h-5" />
            </button>
            <button
              type="button"
              className="text-brand-muted hover:text-brand-ok transition-colors flex items-center justify-center hover:scale-110 transform"
              onClick={handleDownload}
              title="Download JSON"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              type="button"
              className={`transition-all duration-200 flex items-center justify-center h-8 min-w-[32px] ${
                isDeleting
                  ? 'border border-brand-error text-brand-error'
                  : 'border border-transparent text-brand-muted hover:text-brand-error hover:border-brand-error/50'
              }`}
              onClick={handleDeleteRequest}
              title="Purge Record"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <div className="w-4 h-4 border-2 border-brand-error border-t-transparent rounded-full animate-spin" />
              ) : (
                <Trash2 className="w-5 h-5 hover:scale-110 transform transition-transform" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Master Detail Split */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        <AnimatePresence>
          {confirmDelete && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute right-6 top-4 bg-brand-dark border border-brand-error/60 text-brand-text font-mono text-xs uppercase tracking-widest px-3 py-2 flex items-center gap-3 brutal-shadow z-30"
            >
              <span className="text-brand-error">Confirm purge?</span>
              <button
                type="button"
                className="border border-brand-border px-2 py-1 text-brand-muted hover:text-brand-text hover:border-brand-text transition-colors"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="border border-brand-error bg-brand-error/10 px-2 py-1 text-brand-error hover:bg-brand-error hover:text-brand-dark transition-colors"
                onClick={handleDeleteConfirm}
              >
                Purge
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {deleteError && (
          <div className="absolute right-6 top-20 border border-brand-error bg-brand-error/10 text-brand-error px-4 py-2 text-xs font-mono uppercase tracking-widest z-30">
            {deleteError}
          </div>
        )}
        {/* Left: Job List */}
        <div className="w-[35%] min-w-[300px] border-r border-brand-border flex flex-col h-full bg-[#0a0a0a]">
          <div className="p-3 border-b border-brand-border text-xs text-brand-muted font-mono tracking-widest bg-brand-dark flex justify-between items-center shrink-0">
            <span>INDEXED_ENTITIES</span>
            <span className="text-brand-text">{jobs.length} FOUND</span>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 scrollbar-cyber p-2 flex flex-col gap-2">
            {jobs.map((job) => {
              const isActive = selectedJob?.jobId === job.jobId;
              return (
                <button
                  key={job.jobId}
                  type="button"
                  onClick={() => setSelectedJob(job)}
                  className={`w-full text-left p-3 border font-mono transition-all duration-200 relative group overflow-hidden shrink-0 ${
                    isActive
                      ? 'border-brand-cyan bg-brand-cyan/5 text-brand-text brutal-shadow-cyan z-10'
                      : 'border-brand-border bg-brand-panel text-brand-muted hover:border-brand-muted hover:bg-[#151515]'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] opacity-70">
                      ID: {job.jobId.slice(-6)}
                    </span>
                    <span className="text-[10px] text-brand-ok">
                      {job.postedAtText}
                    </span>
                  </div>
                  <h3
                    className={`font-display text-lg leading-tight mb-1 truncate ${
                      isActive ? 'text-brand-cyan font-bold' : 'text-brand-text'
                    }`}
                  >
                    {job.title}
                  </h3>
                  <div className="flex justify-between items-center text-xs mt-3">
                    <span className="truncate max-w-[60%]">
                      {job.companyName}
                    </span>
                    <span className="flex items-center gap-1 opacity-70">
                      <MapPin className="w-3 h-3" />
                      {job.locationText.split(',')[0]}
                    </span>
                  </div>

                  {/* Active Indicator */}
                  {isActive && (
                    <motion.div
                      layoutId="active-indicator"
                      className="absolute left-0 top-0 bottom-0 w-1 bg-brand-cyan"
                      initial={false}
                      transition={{
                        type: 'spring',
                        stiffness: 300,
                        damping: 30,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Job Detail */}
        <div className="flex-1 bg-brand-panel h-full overflow-hidden flex flex-col relative min-w-0">
          <AnimatePresence mode="wait">
            {selectedJob ? (
              <motion.div
                key={selectedJob.jobId}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="flex-1 flex flex-col h-full overflow-y-auto min-h-0 scrollbar-cyber"
              >
                {/* Detail Header */}
                <div className="p-8 border-b border-brand-border relative bg-[#0a0a0a] overflow-hidden shrink-0">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-brand-cyan/5 rounded-full blur-3xl pointer-events-none" />
                  <div className="absolute top-4 right-4 text-[10px] font-mono text-brand-muted tracking-widest border border-brand-border p-1">
                    TARGET_ID :: {selectedJob.jobId}
                  </div>

                  <h1 className="text-4xl md:text-5xl font-display font-bold text-brand-text mt-4 mb-2 tracking-tight">
                    {selectedJob.title}
                  </h1>

                  <div className="flex flex-wrap items-center gap-4 text-sm font-mono mt-6">
                    <a
                      href={selectedJob.companyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-brand-cyan hover:underline group"
                    >
                      <Globe className="w-4 h-4" />
                      <span className="group-hover:text-white transition-colors">
                        {selectedJob.companyName}
                      </span>
                    </a>
                    <span className="text-brand-border">|</span>
                    <div className="flex items-center gap-2 text-brand-muted">
                      <MapPin className="w-4 h-4" />
                      {selectedJob.locationText}
                    </div>
                    <span className="text-brand-border">|</span>
                    <div className="flex items-center gap-2 text-brand-muted">
                      <Calendar className="w-4 h-4" />
                      {selectedJob.postedAtText}
                    </div>
                  </div>

                  <div className="mt-8 flex gap-4">
                    <a
                      href={selectedJob.jobUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="brutal-btn !border-brand-cyan !text-brand-cyan hover:!bg-brand-cyan hover:!text-brand-dark flex items-center gap-2 text-sm"
                    >
                      ACCESS_SOURCE <ExternalLink className="w-4 h-4" />
                    </a>
                    {selectedJob.jobType && (
                      <div className="px-4 py-2 border border-brand-border bg-brand-dark text-xs font-mono text-brand-muted flex items-center">
                        TYPE: {selectedJob.jobType.replace(/\s+/g, ' ').trim()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Detail Content */}
                <div className="p-8 flex flex-col gap-8 font-mono text-sm leading-relaxed shrink-0">
                  {selectedJob.descriptionText && (
                    <div className="space-y-4">
                      <h3 className="text-xl font-display text-brand-accent tracking-widest font-bold flex items-center gap-2">
                        <ChevronRight className="w-5 h-5" /> PAYLOAD_DESCRIPTION
                      </h3>
                      <div className="text-brand-text/80 whitespace-pre-wrap bg-brand-dark/50 border-l-2 border-brand-border p-4 pl-6">
                        {selectedJob.descriptionText}
                      </div>
                    </div>
                  )}

                  {selectedJob.requirementsText &&
                    selectedJob.requirementsText !==
                      selectedJob.descriptionText && (
                      <div className="space-y-4">
                        <h3 className="text-xl font-display text-brand-cyan tracking-widest font-bold flex items-center gap-2">
                          <ChevronRight className="w-5 h-5" />{' '}
                          TARGET_REQUIREMENTS
                        </h3>
                        <div className="text-brand-text/80 whitespace-pre-wrap bg-brand-dark/50 border-l-2 border-brand-border p-4 pl-6">
                          {selectedJob.requirementsText}
                        </div>
                      </div>
                    )}

                  <div className="mt-8 border-t border-brand-border pt-4 text-xs text-brand-muted">
                    END OF RECORD.
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-brand-muted font-mono uppercase tracking-widest">
                SELECT AN ENTITY TO INSPECT
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
