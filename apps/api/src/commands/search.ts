import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { currentState, readApplications } from '../applications.ts';
import { buildCtx, type CliBase } from '../cli-context.ts';
import { resolveSearch, type SearchLayer } from '../config.ts';
import { CliError } from '../errors.ts';
import { migrateLegacySession } from '../linkedin/browser.ts';
import { summarizePay } from '../pay.ts';
import { newRunId, saveRun, writeRunTo } from '../runs.ts';
import { runScraper } from '../scraper.ts';
import type { ScraperOutput } from '../types.ts';
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
  'exclude-seen': { type: 'boolean' },
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
 */
function applyTriage(
  output: ScraperOutput,
  options: { excludeUnpaid: boolean; seen: Set<string> },
): { output: ScraperOutput; droppedUnpaid: number; droppedSeen: number } {
  let droppedUnpaid = 0;
  let droppedSeen = 0;

  const jobs = output.jobs.filter((job) => {
    if (options.excludeUnpaid && (job.pay.kind === 'unpaid' || job.pay.kind === 'token')) {
      droppedUnpaid++;
      return false;
    }
    if (job.jobId && options.seen.has(job.jobId)) {
      droppedSeen++;
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
    droppedSeen,
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
  };

  const profile = values.profile ?? ctx.env.IS_DL_PROFILE;
  const settings = resolveSearch({ config: ctx.config, env: ctx.env, flags, profile });

  if (!settings.keywords) {
    throw new CliError('USAGE', 'Missing --keywords. Pass -k "..." or --profile <name>.');
  }
  if (!settings.headless && !process.stdin.isTTY) {
    throw new CliError('USAGE', '--no-headless needs an interactive terminal.');
  }

  await migrateLegacySession(ctx.paths.sessionFile, ctx.cwd, ctx.log);

  const scraped = await runScraper(
    {
      keywords: settings.keywords,
      location: settings.location,
      limit: settings.limit,
      experienceLevel: settings.experienceLevel,
      jobType: settings.jobType,
      postedWithin: settings.postedWithin,
      remoteOnly: settings.remoteOnly,
      headless: settings.headless,
      debug: settings.debug,
      timeout: settings.timeout,
      sessionFile: ctx.paths.sessionFile,
      debugDir: ctx.paths.cache,
    },
    ctx.log,
    base.signal,
  );

  const seen = values['exclude-seen']
    ? new Set(
        [...currentState(await readApplications(ctx.paths.applicationsLog)).keys()].filter(Boolean),
      )
    : new Set<string>();

  const triaged = applyTriage(scraped, {
    excludeUnpaid: values['exclude-unpaid'] ?? false,
    seen,
  });
  const output = triaged.output;

  if (triaged.droppedUnpaid) ctx.log(`Dropped ${triaged.droppedUnpaid} unpaid or token listings.`);
  if (triaged.droppedSeen)
    ctx.log(`Dropped ${triaged.droppedSeen} already in the application log.`);

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
