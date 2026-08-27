import { summarizeAiAgentSignals } from './ai-agent-detector.ts';
import { CliError } from './errors.ts';
import { summarizePay } from './pay.ts';
import type { JobListing, JobSource, ScraperOutput, SearchQuery, SourceRun } from './types.ts';

export interface SourceContext {
  onLog: (msg: string) => void;
  signal?: AbortSignal;
}

/**
 * A source is built by its own factory, which captures whatever that source
 * needs. LinkedIn takes a browser session, Unstop takes none, and neither has
 * to know about the other's options.
 */
export interface SourceRunner {
  readonly source: JobSource;
  run(query: SearchQuery, ctx: SourceContext): Promise<JobListing[]>;
}

export function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Scrape aborted');
}

export function waitOrAbort(signal: AbortSignal | undefined, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!signal) {
      setTimeout(resolve, ms);
      return;
    }
    if (signal.aborted) {
      reject(new Error('Scrape aborted'));
      return;
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timeout);
      reject(new Error('Scrape aborted'));
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && /abort/i.test(error.message);
}

/**
 * Newest first, with undated listings last. Ties break on source then id so the
 * same two result sets always merge into the same order.
 */
function byRecency(a: JobListing, b: JobListing): number {
  if (a.postedAtIso !== b.postedAtIso) {
    if (!a.postedAtIso) return 1;
    if (!b.postedAtIso) return -1;
    return b.postedAtIso.localeCompare(a.postedAtIso);
  }
  if (a.source !== b.source) return a.source.localeCompare(b.source);
  return (a.jobId ?? '').localeCompare(b.jobId ?? '');
}

/** Prefixes every line so two concurrent sources stay readable in one stream. */
function tagLog(onLog: (msg: string) => void, source: JobSource): (msg: string) => void {
  return (msg) => {
    for (const line of msg.split('\n')) onLog(`[${source}] ${line}`);
  };
}

/**
 * A lone source keeps its own exit code, so a LinkedIn-only search with no
 * session still exits 3 and tells the caller to log in.
 */
function failure(failed: Array<{ source: JobSource; error: unknown }>): unknown {
  const only = failed.length === 1 ? failed[0] : undefined;
  if (only) return only.error;

  const codes = new Set(
    failed.map(({ error }) => (error instanceof CliError ? error.code : 'ERROR')),
  );
  const shared = codes.size === 1 ? [...codes][0]! : 'ERROR';
  const detail = failed.map(({ source, error }) => `${source}: ${message(error)}`).join('; ');
  return new CliError(shared, `Every source failed. ${detail}`);
}

/**
 * Runs every source concurrently and merges the results. One source failing is
 * normal, not fatal: a user with no LinkedIn session still gets Unstop. The
 * command only fails when nothing succeeded.
 */
export async function runSources(
  query: SearchQuery,
  runners: SourceRunner[],
  onLog: (msg: string) => void = console.error,
  signal?: AbortSignal,
): Promise<ScraperOutput> {
  if (!runners.length) throw new CliError('USAGE', 'No sources selected.');

  onLog('Search configuration:');
  onLog(`  Sources: ${runners.map((runner) => runner.source).join(', ')}`);
  onLog(`  Keywords: ${query.keywords}`);
  onLog(`  Location: ${query.location || 'Any'}`);
  onLog(`  Limit: ${query.limit} per source`);
  onLog(`  Remote only: ${query.remoteOnly ? 'Yes' : 'No'}\n`);

  const settled = await Promise.all(
    runners.map(async (runner) => {
      try {
        const jobs = await runner.run(query, {
          onLog: tagLog(onLog, runner.source),
          signal,
        });
        return { runner, jobs, error: null as unknown };
      } catch (error) {
        if (isAbort(error)) throw error;
        return { runner, jobs: [] as JobListing[], error: error as unknown };
      }
    }),
  );

  const runs: SourceRun[] = settled.map(({ runner, jobs, error }) => ({
    source: runner.source,
    status: error ? 'failed' : 'ok',
    count: jobs.length,
    error: error ? message(error) : null,
  }));

  for (const run of runs) {
    if (run.status === 'failed') onLog(`WARNING: ${run.source} failed: ${run.error}`);
    else onLog(`${run.source}: ${run.count} jobs.`);
  }

  const ok = settled.filter(({ error }) => !error);
  if (!ok.length) {
    throw failure(settled.map(({ runner, error }) => ({ source: runner.source, error })));
  }

  // A single source keeps its own ordering; only a merge needs a common one.
  const jobs = ok.length === 1 ? ok[0]!.jobs : ok.flatMap(({ jobs }) => jobs).sort(byRecency);

  const aiAgentSummary = summarizeAiAgentSignals(jobs);
  const paySummary = summarizePay(jobs);

  onLog(
    `Pay: ${paySummary.paid} paid, ${paySummary.token} token, ${paySummary.unpaid} unpaid, ${paySummary.unstated} unstated`,
  );
  onLog(
    `AI agent signals: ${aiAgentSummary.detectedCount} detected (${aiAgentSummary.highCount} high, ${aiAgentSummary.mediumCount} medium, ${aiAgentSummary.lowCount} low)`,
  );

  return {
    meta: {
      query: query.keywords,
      location: query.location,
      filters: {
        experienceLevel: query.experienceLevel,
        remoteOnly: query.remoteOnly,
        postedWithin: query.postedWithin,
        jobType: query.jobType,
      },
      scrapedAt: new Date().toISOString(),
      source: ok.map(({ runner }) => runner.source).join(','),
      sources: runs,
      count: jobs.length,
      aiAgentSummary,
      paySummary,
    },
    jobs,
  };
}
