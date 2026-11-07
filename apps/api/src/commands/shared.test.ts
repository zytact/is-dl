import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vite-plus/test';
import type { Ctx } from '../cli-context.ts';
import type { AppPaths } from '../paths.ts';
import { writeRunTo } from '../runs.ts';
import type { JobListing, JobSource, ScraperOutput } from '../types.ts';
import { findJob } from './shared.ts';

async function ctxWithRuns(runs: Record<string, JobListing[]>): Promise<Ctx> {
  const data = await mkdtemp(join(tmpdir(), 'is-dl-shared-'));
  const paths = {
    runsDir: join(data, 'runs'),
    runsIndex: join(data, 'runs', 'index.json'),
    seenLog: join(data, 'seen.jsonl'),
  } as AppPaths;

  for (const [runId, jobs] of Object.entries(runs)) {
    await writeRunTo(paths.runsDir, runId, {
      meta: { scrapedAt: `${runId}T00:00:00.000Z` },
      jobs,
    } as unknown as ScraperOutput);
  }
  return { paths } as Ctx;
}

function job(source: JobSource, jobId: string, title: string): JobListing {
  return { source, jobId, title, companyName: `${source} co` } as JobListing;
}

describe('finding the job behind an id', () => {
  test('refuses an id that both boards handed out', async () => {
    const ctx = await ctxWithRuns({
      '2026-08-01': [job('linkedin', '42', 'LinkedIn role')],
      '2026-08-02': [job('unstop', '42', 'Unstop role')],
    });

    await expect(findJob(ctx, '42', undefined, undefined)).rejects.toThrow(
      /42 is a job on .*Pass --source/s,
    );
  });

  test('answers for the named board when the id is shared', async () => {
    const ctx = await ctxWithRuns({
      '2026-08-01': [job('linkedin', '42', 'LinkedIn role')],
      '2026-08-02': [job('unstop', '42', 'Unstop role')],
    });

    expect((await findJob(ctx, '42', undefined, 'unstop'))?.job.title).toBe('Unstop role');
  });

  test('takes the newest run when one board repeats the job', async () => {
    const ctx = await ctxWithRuns({
      '2026-08-01': [job('unstop', '42', 'Old title')],
      '2026-08-02': [job('unstop', '42', 'New title')],
    });

    expect((await findJob(ctx, '42', undefined, undefined))?.job.title).toBe('New title');
  });

  test('takes an older run whose copy kept its description over a newer empty one', async () => {
    const ctx = await ctxWithRuns({
      '2026-08-01': [{ ...job('unstop', '42', 'Full card'), descriptionText: 'Build things.' }],
      '2026-08-02': [job('unstop', '42', 'Failed card')],
    });

    expect((await findJob(ctx, '42', undefined, undefined))?.job.title).toBe('Full card');
  });

  test('takes an older run that kept the title and company over a newer one that only kept the text', async () => {
    const ctx = await ctxWithRuns({
      '2026-08-01': [job('unstop', '42', 'Full card')],
      '2026-08-02': [
        {
          ...job('unstop', '42', 'Half card'),
          companyName: null,
          descriptionText: 'Build things.',
        },
      ],
    });

    expect((await findJob(ctx, '42', undefined, undefined))?.job.title).toBe('Full card');
  });

  test('is null when no run holds the id', async () => {
    const ctx = await ctxWithRuns({ '2026-08-01': [job('unstop', '1', 'Something')] });
    expect(await findJob(ctx, '42', undefined, undefined)).toBeNull();
  });
});
