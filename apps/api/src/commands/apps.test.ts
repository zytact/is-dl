import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';
import { emptyAiAgentSignals } from '../ai-agent-detector.ts';
import { readApplications } from '../applications.ts';
import type { CliBase } from '../cli-context.ts';
import { listingFile, readListing } from '../listing.ts';
import { resolvePaths } from '../paths.ts';
import { emptyPay } from '../pay.ts';
import { writeRunTo } from '../runs.ts';
import type { JobListing, ScraperOutput } from '../types.ts';
import { appsCommand } from './apps.ts';

const REF = { source: 'unstop', jobId: '4055' } as const;

function listing(overrides: Partial<JobListing> = {}): JobListing {
  return {
    ...REF,
    jobUrl: 'https://unstop.com/jobs/4055',
    title: 'Backend Intern',
    companyName: 'Acme',
    companyUrl: 'https://acme.dev',
    locationText: 'Remote',
    postedAtText: null,
    postedAtIso: null,
    jobType: 'Internship',
    alumniCount: null,
    descriptionText: 'Build the billing API.',
    requirementsText: null,
    aiAgentSignals: emptyAiAgentSignals(),
    pay: emptyPay(),
    locationConflict: null,
    ...overrides,
  };
}

/** A CLI base rooted in a fresh temp data directory, with the given runs saved. */
async function base(runs: Record<string, JobListing[]> = {}): Promise<CliBase> {
  const home = await mkdtemp(join(tmpdir(), 'is-dl-apps-cmd-'));
  const env = { XDG_DATA_HOME: join(home, 'data'), XDG_CONFIG_HOME: join(home, 'config') };
  const paths = resolvePaths(env, home, 'linux');
  for (const [runId, jobs] of Object.entries(runs)) {
    await writeRunTo(paths.runsDir, runId, {
      meta: { scrapedAt: `${runId}T00:00:00.000Z` },
      jobs,
    } as unknown as ScraperOutput);
  }
  return { paths, cwd: home, env, signal: new AbortController().signal };
}

async function stdoutOf(run: () => Promise<void>): Promise<string> {
  let out = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  await run();
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apps add', () => {
  test('stores the listing from the run beside the notes, and show prints it back', async () => {
    const ctx = await base({ '2026-08-01': [listing()] });
    await stdoutOf(() => appsCommand(ctx, ['add', '4055']));

    expect(await readListing(ctx.paths, REF)).toEqual(listing());
    const shown = await stdoutOf(() => appsCommand(ctx, ['show', '4055', '--json']));
    expect(JSON.parse(shown).listing).toEqual(listing());
  });

  test('keeps the first listing when the job is added again', async () => {
    const ctx = await base({ '2026-08-01': [listing()] });
    await stdoutOf(() => appsCommand(ctx, ['add', '4055']));
    await writeRunTo(ctx.paths.runsDir, '2026-08-02', {
      meta: { scrapedAt: '2026-08-02T00:00:00.000Z' },
      jobs: [listing({ descriptionText: 'Reworded later.' })],
    } as unknown as ScraperOutput);
    await stdoutOf(() => appsCommand(ctx, ['add', '4055']));

    expect((await readListing(ctx.paths, REF))?.descriptionText).toBe('Build the billing API.');
  });

  test('refuses a run whose copy lost its title and company, and writes nothing', async () => {
    const ctx = await base({
      '2026-08-01': [listing({ title: null, companyName: null, descriptionText: null })],
    });

    await expect(appsCommand(ctx, ['add', '4055'])).rejects.toMatchObject({ code: 'USAGE' });
    expect(await readApplications(ctx.paths.applicationsLog)).toEqual([]);
  });

  test('takes a hand-written listing for a job no search found', async () => {
    const ctx = await base();
    const file = join(ctx.cwd, 'job.json');
    await writeFile(
      file,
      JSON.stringify({
        title: 'AI Intern',
        companyName: 'Time Seventeen',
        jobUrl: 'mailto:hr@t17',
      }),
    );
    await stdoutOf(() =>
      appsCommand(ctx, ['add', 't17-ai', '--source', 'linkedin', '--listing', file]),
    );

    const [record] = await readApplications(ctx.paths.applicationsLog);
    expect(record).toMatchObject({
      company: 'Time Seventeen',
      title: 'AI Intern',
      source: 'manual',
    });
    const stored = JSON.parse(
      await readFile(listingFile(ctx.paths, { source: 'linkedin', jobId: 't17-ai' }), 'utf-8'),
    );
    expect(stored).toMatchObject({
      source: 'linkedin',
      jobId: 't17-ai',
      pay: { kind: 'unstated' },
    });
  });

  test('names the fields a hand-written listing is missing', async () => {
    const ctx = await base();
    const file = join(ctx.cwd, 'job.json');
    await writeFile(file, JSON.stringify({ title: 'AI Intern' }));

    await expect(
      appsCommand(ctx, ['add', 't17-ai', '--source', 'linkedin', '--listing', file]),
    ).rejects.toThrow(/has no companyName, jobUrl/);
  });

  test('refuses --listing together with --from-run', async () => {
    const ctx = await base({ '2026-08-01': [listing()] });

    await expect(
      appsCommand(ctx, ['add', '4055', '--listing', 'job.json', '--from-run', 'latest']),
    ).rejects.toMatchObject({ code: 'USAGE' });
  });
});
