import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildCtx, type CliBase } from '../cli-context.ts';
import { resolveSearch, type SearchLayer } from '../config.ts';
import { CliError } from '../errors.ts';
import { migrateLegacySession } from '../linkedin/browser.ts';
import { newRunId, saveRun, writeRunTo } from '../runs.ts';
import { search } from '../search.ts';
import type { JobSource } from '../types.ts';
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

  const output = await search(
    ctx.paths,
    settings,
    {
      excludeUnpaid: values['exclude-unpaid'] ?? false,
      excludeApplied: values['exclude-applied'] ?? false,
      excludeSeen: values['exclude-seen'] ?? false,
    },
    ctx.log,
    base.signal,
  );

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
