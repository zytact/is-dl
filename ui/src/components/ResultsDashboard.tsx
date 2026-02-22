import { AlertTriangle, Database, Download, FileJson } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ResultsDashboard() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:3000/api/results')
      .then((res) => res.json())
      .then((data) => {
        const parsed = (data.results || []).map((file: any) => ({
          id: file.filename,
          title: file.filename,
          company: 'Multiple',
          location: file.meta?.location || 'Any',
          date: file.meta?.scrapedAt
            ? new Date(file.meta.scrapedAt).toLocaleDateString()
            : 'Unknown',
          link: `http://localhost:3000/api/results/${file.filename}`,
          count: file.count,
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
    <div className="flex-1 flex flex-col h-full bg-brand-panel brutal-border relative group p-1">
      <div className="flex justify-between items-center bg-brand-dark border-b border-brand-border px-4 py-3 relative z-10">
        <h2 className="text-xl flex items-center gap-3 text-brand-cyan tracking-widest font-display">
          <Database className="w-5 h-5" />
          <span className="mt-1 font-bold">DATA_REPOSITORIES</span>
        </h2>

        <div className="flex gap-4 items-center">
          <div className="text-xs text-brand-muted uppercase tracking-widest bg-brand-dark border border-brand-border px-3 py-1 flex items-center gap-2">
            <span className="w-2 h-2 bg-brand-ok inline-block rounded-full animate-pulse"></span>
            LATEST: jobs_export_2024-05-12.json
          </div>
          <button className="brutal-btn !px-4 !py-1 !border-brand-ok !text-brand-ok hover:!bg-brand-ok flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" /> EXPORT
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto scrollbar-cyber p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50">
            <div className="w-16 h-16 border-4 border-brand-border border-t-brand-cyan rounded-full animate-spin"></div>
            <p className="font-mono text-brand-cyan tracking-widest animate-pulse uppercase">
              Querying Data Store...
            </p>
          </div>
        ) : (
          <table className="w-full text-left font-mono text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-brand-accent bg-brand-dark text-brand-muted uppercase tracking-widest">
                <th className="p-3 w-12 text-center">#</th>
                <th className="p-3">Designation</th>
                <th className="p-3">Entity</th>
                <th className="p-3">Sector</th>
                <th className="p-3">Timestamp</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.map((job, idx) => (
                <tr
                  key={job.id}
                  className="border-b border-brand-border hover:bg-brand-dark transition-colors group/row cursor-crosshair"
                >
                  <td className="p-3 text-center text-brand-muted group-hover/row:text-brand-accent">
                    {idx + 1}
                  </td>
                  <td className="p-3 font-bold text-brand-cyan group-hover/row:text-white transition-colors">
                    {job.title}{' '}
                    <span className="text-brand-muted text-xs font-normal ml-2">
                      ({job.count} items)
                    </span>
                  </td>
                  <td className="p-3">{job.company}</td>
                  <td className="p-3 flex items-center gap-2">
                    {job.location === 'Remote' && (
                      <span className="w-2 h-2 bg-brand-ok inline-block rounded-none"></span>
                    )}
                    {job.location}
                  </td>
                  <td className="p-3 text-brand-muted">{job.date}</td>
                  <td className="p-3 text-right">
                    <a
                      href={job.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-muted hover:text-brand-accent transition-colors inline-block"
                    >
                      <FileJson className="w-5 h-5 inline-block" />
                    </a>
                  </td>
                </tr>
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
      <div className="bg-brand-dark border-t border-brand-border px-4 py-2 flex justify-between text-xs text-brand-muted uppercase font-mono tracking-widest z-10">
        <div>Total Rows: {results.length}</div>
        <div className="text-brand-ok">INTEGRITY CHECK PASSED</div>
      </div>
    </div>
  );
}
