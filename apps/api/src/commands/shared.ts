import type { Ctx } from '../cli-context.ts';
import { CliError } from '../errors.ts';
import { listRuns, readRun, resolveRunId } from '../runs.ts';
import { isJobSource, JOB_SOURCES, type JobListing, type JobSource } from '../types.ts';

export const GLOBAL_OPTIONS = {
  json: { type: 'boolean' },
  quiet: { type: 'boolean', short: 'q' },
  verbose: { type: 'boolean' },
  config: { type: 'string' },
  'no-config': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'V' },
} as const;

/** Turns a parseArgs rejection into the documented usage exit code. */
export function usage<T>(parse: () => T): T {
  try {
    return parse();
  } catch (err) {
    throw new CliError('USAGE', err instanceof Error ? err.message : String(err));
  }
}

export function readSourceFlag(value: string | undefined): JobSource | undefined {
  if (value === undefined) return undefined;
  if (!isJobSource(value)) {
    throw new CliError(
      'USAGE',
      `Unknown --source "${value}". Use one of: ${JOB_SOURCES.join(', ')}`,
    );
  }
  return value;
}

export async function findJob(
  ctx: Ctx,
  jobId: string,
  fromRun: string | undefined,
  source: JobSource | undefined,
): Promise<{ job: JobListing; runId: string } | null> {
  const runIds = fromRun
    ? [await resolveRunId(ctx.paths, fromRun)]
    : (await listRuns(ctx.paths)).map((run) => run.runId);

  let match: { job: JobListing; runId: string } | null = null;
  const boards = new Set<JobSource>();

  for (const runId of runIds) {
    const output = await readRun(ctx.paths, runId);
    for (const job of output.jobs) {
      if (job.jobId !== jobId) continue;
      if (source && job.source !== source) continue;
      boards.add(job.source);
      match ??= { job, runId };
    }
  }

  if (boards.size > 1) {
    throw new CliError(
      'USAGE',
      `${jobId} is a job on ${[...boards].join(' and ')}. Pass --source to pick one.`,
    );
  }
  return match;
}
