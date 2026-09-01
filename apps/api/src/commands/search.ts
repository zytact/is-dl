import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { currentState, readApplications, seenKey } from '../applications.ts';
import { buildCtx, type CliBase } from '../cli-context.ts';
import { resolveSearch, type SearchLayer } from '../config.ts';
import { CliError } from '../errors.ts';
import { migrateLegacySession } from '../linkedin/browser.ts';
import { summarizePay } from '../pay.ts';
import { knownJobKeys, newRunId, saveRun, writeRunTo } from '../runs.ts';
import { runScraper } from '../scraper.ts';
import { knownJobs, noJobsKnown } from '../seen.ts';
import type { JobSource, KnownJobs, ScraperOutput } from '../types.ts';
import { GLOBAL_OPTIONS, usage } from './shared.ts';

const SEARCH_OPTIONS = {
  keywords: { type: 'string', short: 'k' },
  profile: { type: 'string', short: 'p' },
  location: { type: 'string', short: 'l' },
  limit: { type: 'string' },
  'experience-level': { type: 'string' },
  'job-type': { type: 'string' },
  'posted-within': { type: 'string' },
  'remote-only': { type: 'boolean' },
  'no-remote-only': { type: 'boolean' },
  out: { type: 'string', short: 'o' },
  headless: { type: 'boolean' },
  'no-headless': { type: 'boolean' },
  debug: { type: 'boolean' },
  'no-debug': { type: 'boolean' },
  timeout: { type: 'string' },
  'exclude-unpaid': { type: 'boolean' },
  'exclude-applied': { type: 'boolean' },
  'exclude-seen': { type: 'boolean' },
  source: { type: 'string', short: 's' },
  'unstop-opportunity': { type: 'string' },
  'unstop-roles': { type: 'string' },
} as const;

function toggle(on: boolean | undefined, off: boolean | undefined): boolean | undefined {
  if (off) return false;
  if (on) return true;
  return undefined;
}

function csv(value: string | undefined): string[] | undefined {
  return value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function num(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new CliError('USAGE', `${flag} must be a number.`);
  return parsed;
}

/**
 * `unstated` is never dropped: good listings routinely omit pay entirely.
 *
 * `known` runs again here because a LinkedIn card whose id was unreadable
 * before the click is only identifiable once it has been opened.
 */
function applyTriage(
  output: ScraperOutput,
  options: { excludeUnpaid: boolean; applied: Set<string>; known: KnownJobs },
): { output: ScraperOutput; droppedUnpaid: number; droppedApplied: number; droppedKnown: number } {
  let droppedUnpaid = 0;
  let droppedApplied = 0;
  let droppedKnown = 0;

  const jobs = output.jobs.filter((job) => {
    if (options.excludeUnpaid && (job.pay.kind === 'unpaid' || job.pay.kind === 'token')) {
      droppedUnpaid++;
      return false;
    }
    if (job.jobId !== null && options.applied.has(seenKey(job.source, job.jobId))) {
      droppedApplied++;
      return false;
    }
    if (job.jobId !== null && options.known.has(job.source, job.jobId)) {
      droppedKnown++;
      return false;
    }
    return true;
  });

  return {
    output: {
      meta: { ...output.meta, count: jobs.length, paySummary: summarizePay(jobs) },
      jobs,
    },
    droppedUnpaid,
    droppedApplied,
    droppedKnown,
  };
}

export async function searchCommand(base: CliBase, argv: string[]): Promise<void> {
  const { values } = usage(() =>
    parseArgs({ args: argv, options: { ...GLOBAL_OPTIONS, ...SEARCH_OPTIONS } }),
  );

  const ctx = await buildCtx(base, values);
  const flags: SearchLayer = {
    keywords: values.keywords,
    location: values.location,
    limit: num(values.limit, '--limit'),
    experienceLevel: csv(values['experience-level']),
    jobType: csv(values['job-type']),
    postedWithin: values['posted-within'],
    remoteOnly: toggle(values['remote-only'], values['no-remote-only']),
    headless: toggle(values.headless, values['no-headless']),
    outDir: values.out,
    debug: toggle(values.debug, values['no-debug']),
    timeout: num(values.timeout, '--timeout'),
    sources: csv(values.source) as JobSource[] | undefined,
    unstopOpportunity: values['unstop-opportunity'] as SearchLayer['unstopOpportunity'],
    unstopRoles: csv(values['unstop-roles']),
  };

  const profile = values.profile ?? ctx.env.IS_DL_PROFILE;
  const settings = resolveSearch({ config: ctx.config, env: ctx.env, flags, profile });

  if (!settings.keywords) {
    throw new CliError('USAGE', 'Missing --keywords. Pass -k "..." or --profile <name>.');
  }
  if (!settings.headless && !process.stdin.isTTY) {
    throw new CliError('USAGE', '--no-headless needs an interactive terminal.');
  }

  if (settings.sources.includes('linkedin')) {
    await migrateLegacySession(ctx.paths.sessionFile, ctx.cwd, ctx.log);
  }

  // Resolved before the scrape, not after: the sources page on it so that
  // --limit still yields that many jobs the reader has not already been shown.
  const known = values['exclude-seen'] ? knownJobs(await knownJobKeys(ctx.paths)) : noJobsKnown;

  const scraped = await runScraper(
    {
      query: {
        keywords: settings.keywords,
        location: settings.location,
        limit: settings.limit,
        remoteOnly: settings.remoteOnly,
        known,
      },
      sources: settings.sources,
      linkedin: {
        headless: settings.headless,
        debug: settings.debug,
        timeout: settings.timeout,
        sessionFile: ctx.paths.sessionFile,
        debugDir: ctx.paths.cache,
        experienceLevel: settings.experienceLevel,
        jobType: settings.jobType,
        postedWithin: settings.postedWithin,
      },
      unstop: {
        opportunity: settings.unstopOpportunity,
        roles: settings.unstopRoles,
      },
    },
    ctx.log,
    base.signal,
  );

  for (const run of scraped.meta.sources) {
    if (run.status === 'failed') ctx.log(`Skipped ${run.source}: ${run.error}`);
  }

  const applied = values['exclude-applied']
    ? new Set(currentState(await readApplications(ctx.paths.applicationsLog)).keys())
    : new Set<string>();

  const triaged = applyTriage(scraped, {
    excludeUnpaid: values['exclude-unpaid'] ?? false,
    applied,
    known,
  });
  const output = triaged.output;

  if (triaged.droppedUnpaid) ctx.log(`Dropped ${triaged.droppedUnpaid} unpaid or token listings.`);
  if (triaged.droppedApplied)
    ctx.log(`Dropped ${triaged.droppedApplied} already in the application log.`);
  if (triaged.droppedKnown)
    ctx.log(`Dropped ${triaged.droppedKnown} already surfaced by an earlier run.`);

  const runId = newRunId();
  const outDir = settings.outDir;

  if (outDir === '-') {
    ctx.emit(JSON.stringify(output, null, 2), () => ({ ok: true, runId, path: null, ...output }));
    return;
  }

  const path = outDir
    ? await writeRunTo(resolve(ctx.cwd, outDir), runId, output)
    : await saveRun(ctx.paths, runId, output);

  ctx.emit(`${output.jobs.length} jobs written to ${path}`, () => ({
    ok: true,
    runId,
    path,
    ...output,
  }));
}
