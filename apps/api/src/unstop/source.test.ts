import { afterEach, describe, expect, test, vi } from 'vite-plus/test';
import type { JobListing, SearchQuery } from '../types.ts';
import type { UnstopItem, UnstopPage } from './api.ts';
import { unstopSource } from './source.ts';

const fetchPage = vi.hoisted(() => vi.fn());

vi.mock('./api.ts', () => ({ fetchPage }));

function item(id: number, title: string, details: string): UnstopItem {
  return {
    id,
    title,
    details,
    seo_url: `https://unstop.com/jobs/${id}`,
    approved_date: '2026-08-27 20:26:06 GMT+0530',
    organisation: { name: 'Acme' },
    locations: [{ city: 'Pune', state: 'Maharashtra', country: 'India' }],
  };
}

function page(items: UnstopItem[], currentPage: number, lastPage: number): UnstopPage {
  return { items, currentPage, lastPage, total: 102 };
}

const query: SearchQuery = { keywords: 'typescript', location: '', limit: 50 };

/** Fake timers so the polite delay between pages does not stall the test. */
async function run(
  overrides: Partial<SearchQuery> = {},
): Promise<{ jobs: JobListing[]; logs: string[] }> {
  const logs: string[] = [];
  vi.useFakeTimers();
  const pending = unstopSource({ opportunity: 'jobs' }).run(
    { ...query, ...overrides },
    { onLog: (msg) => logs.push(msg) },
  );
  await vi.advanceTimersByTimeAsync(20000);
  return { jobs: await pending, logs };
}

afterEach(() => {
  vi.useRealTimers();
  fetchPage.mockReset();
});

describe('unstop paging', () => {
  test('keeps paging until enough rows pass the filters', async () => {
    const filler = Array.from({ length: 100 }, (_, i) =>
      item(i + 1, 'Sales Executive', '<p>Cold calling.</p>'),
    );
    const matches = [
      item(101, 'Frontend Engineer', '<p>We write TypeScript all day.</p>'),
      item(102, 'Backend Engineer', '<p>TypeScript and Postgres.</p>'),
    ];
    fetchPage.mockImplementation((_options: unknown, requested: number) =>
      Promise.resolve(requested === 1 ? page(filler, 1, 2) : page(matches, 2, 2)),
    );

    const { jobs, logs } = await run();

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(jobs.map((job) => job.jobId)).toEqual(['101', '102']);
    expect(logs).toContain('Kept 2 of 102 fetched after keyword and location filters.');
  });

  test('pages past jobs an earlier run already showed, so the limit is met in new ones', async () => {
    const matches = (from: number) =>
      Array.from({ length: 100 }, (_, i) =>
        item(from + i, 'Frontend Engineer', '<p>TypeScript.</p>'),
      );
    fetchPage.mockImplementation((_options: unknown, requested: number) =>
      Promise.resolve(requested === 1 ? page(matches(1), 1, 2) : page(matches(101), 2, 2)),
    );

    // Everything on page one has been surfaced before.
    const seen = new Set(Array.from({ length: 100 }, (_, i) => `unstop:${i + 1}`));
    const { jobs, logs } = await run({
      known: { has: (_source, jobId) => jobId !== null && seen.has(`unstop:${jobId}`) },
    });

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(jobs).toHaveLength(50);
    expect(jobs.every((job) => Number(job.jobId) > 100)).toBe(true);
    expect(logs).toContain('Skipped 100 already surfaced by an earlier run.');
  });

  test('a known job does not take a slot from an unseen one', async () => {
    const rows = [
      item(1, 'Frontend Engineer', '<p>TypeScript.</p>'),
      item(2, 'Backend Engineer', '<p>TypeScript.</p>'),
    ];
    fetchPage.mockResolvedValue(page(rows, 1, 1));

    const { jobs } = await run({
      limit: 1,
      known: { has: (_source, jobId) => jobId === '1' },
    });

    expect(jobs.map((job) => job.jobId)).toEqual(['2']);
  });

  test('stops as soon as the limit is met', async () => {
    const matches = Array.from({ length: 100 }, (_, i) =>
      item(i + 1, 'Frontend Engineer', '<p>TypeScript.</p>'),
    );
    fetchPage.mockResolvedValue(page(matches, 1, 4));

    const { jobs, logs } = await run();

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(jobs).toHaveLength(50);
    expect(logs.some((line) => line.startsWith('WARNING:'))).toBe(false);
  });
});
