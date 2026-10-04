import { currentState, readApplications, seenKey } from './applications.ts';
import { camel, SEARCH_FIELDS, type SearchLayer, type SearchSettings } from './config.ts';
import { CliError } from './errors.ts';
import { summarizePay } from './pay.ts';
import type { AppPaths } from './paths.ts';
import { knownJobKeys } from './runs.ts';
import { runScraper } from './scraper.ts';
import { knownJobs, noJobsKnown } from './seen.ts';
import type { ScraperOutput } from './types.ts';

/** What a search drops from its results. Not config: each search asks for it. */
export interface Triage {
  excludeUnpaid: boolean;
  excludeApplied: boolean;
  excludeSeen: boolean;
}

export const NO_TRIAGE: Triage = {
  excludeUnpaid: false,
  excludeApplied: false,
  excludeSeen: false,
};

const TRIAGE_KEYS = Object.keys(NO_TRIAGE) as (keyof Triage)[];

/**
 * `out-dir` is the CLI's alone: the server always writes to the run store.
 * `debug` is a flag the config file does not take.
 */
const BODY_FIELDS = [
  ...Object.entries(SEARCH_FIELDS).filter(([key]) => key !== 'out-dir'),
  ['debug', 'boolean'],
] as const;

/**
 * Reads a `/api/scrape` body. The search keys are the config keys camelCased, so
 * an option added to the config table reaches the API without a second parser.
 * List fields take an array or a comma-joined string. A field that is present
 * counts even when empty, so a blank form field clears a configured default the
 * way an empty CLI flag does. Only an omitted field inherits.
 */
export function readSearchBody(body: unknown): { flags: SearchLayer; triage: Triage } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new CliError('USAGE', 'The request body must be a JSON object.');
  }
  const raw = body as Record<string, unknown>;
  const known = new Set<string>(TRIAGE_KEYS);
  const flags: Record<string, unknown> = {};

  for (const [key, type] of BODY_FIELDS) {
    const name = camel(key);
    known.add(name);
    const value = raw[name];
    if (value === undefined) continue;

    const list = type === 'string[]' && typeof value === 'string' ? value.split(',') : value;
    const valid =
      type === 'string[]'
        ? Array.isArray(list) && list.every((item) => typeof item === 'string')
        : typeof value === type;
    if (!valid) throw new CliError('USAGE', `"${name}" must be a ${type}.`);

    if (Array.isArray(list)) {
      flags[name] = list.map((item: string) => item.trim()).filter(Boolean);
    } else {
      flags[name] = value;
    }
  }

  const unknown = Object.keys(raw).filter((key) => !known.has(key));
  if (unknown.length) {
    throw new CliError(
      'USAGE',
      `Unknown field "${unknown[0]}". Known fields: ${[...known].join(', ')}`,
    );
  }

  const triage = { ...NO_TRIAGE };
  for (const key of TRIAGE_KEYS) {
    const value = raw[key];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') throw new CliError('USAGE', `"${key}" must be a boolean.`);
    triage[key] = value;
  }

  return { flags: flags as SearchLayer, triage };
}

/**
 * `unstated` is never dropped: good listings routinely omit pay entirely.
 *
 * `applied` and `seen` run again here because a LinkedIn card whose id was
 * unreadable before the click is only identifiable once it has been opened.
 */
function applyTriage(
  output: ScraperOutput,
  options: { excludeUnpaid: boolean; applied: ReadonlySet<string>; seen: ReadonlySet<string> },
): { output: ScraperOutput; droppedUnpaid: number; droppedApplied: number; droppedKnown: number } {
  let droppedUnpaid = 0;
  let droppedApplied = 0;
  let droppedKnown = 0;

  const jobs = output.jobs.filter((job) => {
    if (options.excludeUnpaid && (job.pay.kind === 'unpaid' || job.pay.kind === 'token')) {
      droppedUnpaid++;
      return false;
    }
    const key = job.jobId === null ? null : seenKey(job.source, job.jobId);
    if (key !== null && options.applied.has(key)) {
      droppedApplied++;
      return false;
    }
    if (key !== null && options.seen.has(key)) {
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

const EMPTY_KEYS: ReadonlySet<string> = new Set();

/** The whole search, shared by `is-dl search` and `/api/scrape`. Writing the result is the caller's. */
export async function search(
  paths: AppPaths,
  settings: SearchSettings,
  triage: Triage,
  log: (msg: string) => void,
  signal?: AbortSignal,
): Promise<ScraperOutput> {
  // Both sets are resolved before the scrape, not after: the sources page on
  // them so that --limit still yields that many jobs worth reading, rather than
  // that many rows minus whatever gets thrown away here.
  const seen = triage.excludeSeen ? await knownJobKeys(paths) : EMPTY_KEYS;
  const applied = triage.excludeApplied
    ? new Set(currentState(await readApplications(paths.applicationsLog)).keys())
    : EMPTY_KEYS;
  const skip = new Set([...seen, ...applied]);
  const known = skip.size ? knownJobs(skip) : noJobsKnown;

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
        sessionFile: paths.sessionFile,
        debugDir: paths.cache,
        experienceLevel: settings.experienceLevel,
        jobType: settings.jobType,
        postedWithin: settings.postedWithin,
      },
      unstop: {
        opportunity: settings.unstopOpportunity,
        roles: settings.unstopRoles,
      },
    },
    log,
    signal,
  );

  for (const run of scraped.meta.sources) {
    if (run.status === 'failed') log(`Skipped ${run.source}: ${run.error}`);
  }

  const triaged = applyTriage(scraped, { excludeUnpaid: triage.excludeUnpaid, applied, seen });

  if (triaged.droppedUnpaid) log(`Dropped ${triaged.droppedUnpaid} unpaid or token listings.`);
  if (triaged.droppedApplied)
    log(`Dropped ${triaged.droppedApplied} already in the application log.`);
  if (triaged.droppedKnown)
    log(`Dropped ${triaged.droppedKnown} already surfaced by an earlier run.`);

  return triaged.output;
}
