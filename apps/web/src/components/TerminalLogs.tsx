import { memo, type RefCallback } from 'react';
import type { LogLine } from '../scraper-stream';

interface TerminalLogsProps {
  logs: LogLine[];
  isScraping: boolean;
}

/** Memoized: a new line must not re-render the thousands already on screen. */
const LogRow = memo(function LogRow({ line }: { line: LogLine }) {
  const isError =
    line.text.includes('Error') || line.text.includes('Failed') || line.text.includes('ABORTED');
  const isSuccess = line.text.includes('complete') || line.text.includes('Successfully');

  return (
    <div
      className={`mb-1 typewriter-text ${
        isError ? 'text-brand-error' : isSuccess ? 'text-brand-ok' : 'text-brand-text'
      }`}
      style={{ animationDuration: '0.2s' }}
    >
      <span className="opacity-50 mr-2 text-xs">[{line.at}]</span>
      {line.text}
    </div>
  );
});

export function TerminalLogs({ logs, isScraping }: TerminalLogsProps) {
  const scrollToBottom: RefCallback<HTMLDivElement> = (el) => {
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  };

  return (
    <div className="flex-1 bg-brand-panel brutal-border relative flex flex-col overflow-hidden group">
      {/* Decorative corners */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-brand-cyan opacity-50 z-10 pointer-events-none"></div>
      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-brand-cyan opacity-50 z-10 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-brand-cyan opacity-50 z-10 pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-brand-cyan opacity-50 z-10 pointer-events-none"></div>

      <div className="flex justify-between items-center bg-brand-dark border-b border-brand-border px-3 py-1">
        <span className="text-xs text-brand-cyan font-bold tracking-widest uppercase">STDOUT</span>
        <span className="text-[10px] text-brand-muted uppercase">
          TTY1 {/* NODE_ENV=production */}
        </span>
      </div>

      <div
        ref={scrollToBottom}
        className="flex-1 p-4 overflow-y-auto scrollbar-cyber font-mono text-sm leading-relaxed whitespace-pre-wrap selection:bg-brand-cyan selection:text-brand-dark"
      >
        {logs.length === 0 ? (
          <div className="text-brand-muted italic opacity-50 flex items-center h-full justify-center text-xs tracking-widest uppercase">
            {'>'} Waiting for command execution...
          </div>
        ) : (
          logs.map((line) => <LogRow key={line.id} line={line} />)
        )}

        {isScraping && (
          <div className="mt-2 text-brand-cyan animate-pulse">
            <span className="mr-2">&gt;</span>
            <span className="inline-block w-2 h-4 bg-brand-cyan align-middle animate-flicker"></span>
          </div>
        )}
      </div>
    </div>
  );
}
