import { afterEach, describe, expect, test, vi } from 'vite-plus/test';
import type { JobListing, LinkedInOptions, SearchQuery } from '../types.ts';
import { linkedinSource } from './source.ts';

const mocks = vi.hoisted(() => ({
  getJobCardIds: vi.fn(),
  clickJobCard: vi.fn(),
  extractJobDetailsFromView: vi.fn(),
  goToNextPage: vi.fn(),
  getPaginationInfo: vi.fn(),
  launchBrowser: vi.fn(),
  closeBrowser: vi.fn(),
}));

vi.mock('./search.ts', () => ({
  getJobCardIds: mocks.getJobCardIds,
  clickJobCard: mocks.clickJobCard,
  goToNextPage: mocks.goToNextPage,
  getPaginationInfo: mocks.getPaginationInfo,
}));

vi.mock('./job.ts', () => ({ extractJobDetailsFromView: mocks.extractJobDetailsFromView }));

vi.mock('./browser.ts', () => ({
  launchBrowser: mocks.launchBrowser,
  closeBrowser: mocks.closeBrowser,
}));

const options: LinkedInOptions = {
  timeout: 1000,
  sessionFile: '/tmp/session.json',
  debugDir: '/tmp/debug',
};

const query: SearchQuery = { keywords: 'developer', location: '', limit: 2 };

/** Fake timers so the rate-limit sleep between jobs does not stall the test. */
async function run(
  overrides: Partial<SearchQuery> = {},
): Promise<{ jobs: JobListing[]; logs: string[] }> {
  const logs: string[] = [];
  vi.useFakeTimers();
  const pending = linkedinSource(options).run(
    { ...query, ...overrides },
    { onLog: (msg) => logs.push(msg) },
  );
  await vi.advanceTimersByTimeAsync(60000);
  return { jobs: await pending, logs };
}

afterEach(() => {
  vi.useRealTimers();
  for (const mock of Object.values(mocks)) mock.mockReset();
});

/** The job the detail pane yields, identified by the card that was clicked. */
function detailsFrom(cardIds: (string | null)[]): void {
  mocks.launchBrowser.mockResolvedValue({ page: { goto: vi.fn(), screenshot: vi.fn() } });
  mocks.getPaginationInfo.mockResolvedValue(null);
  mocks.goToNextPage.mockResolvedValue(false);
  mocks.getJobCardIds.mockResolvedValue(cardIds);
  mocks.extractJobDetailsFromView.mockImplementation((_page: unknown, index: number) =>
    Promise.resolve({ source: 'linkedin', jobId: cardIds[index] } as JobListing),
  );
}

describe('linkedin card processing', () => {
  test('opens every card when nothing is known', async () => {
    detailsFrom(['1', '2']);

    const { jobs } = await run();

    expect(jobs.map((job) => job.jobId)).toEqual(['1', '2']);
    expect(mocks.clickJobCard).toHaveBeenCalledTimes(2);
  });

  test('never opens a card an earlier run already showed', async () => {
    detailsFrom(['1', '2', '3']);

    const { jobs, logs } = await run({
      known: { has: (_source, jobId) => jobId === '1' || jobId === '2' },
    });

    expect(jobs.map((job) => job.jobId)).toEqual(['3']);
    expect(mocks.clickJobCard).toHaveBeenCalledTimes(1);
    expect(mocks.clickJobCard).toHaveBeenCalledWith(expect.anything(), 2, expect.anything());
    expect(logs).toContain('Skipped 2 already surfaced by an earlier run.');
  });

  test('a skipped card does not use up the limit', async () => {
    detailsFrom(['1', '2', '3']);

    const { jobs } = await run({ known: { has: (_source, jobId) => jobId === '1' } });

    expect(jobs.map((job) => job.jobId)).toEqual(['2', '3']);
  });

  test('opens a card whose id could not be read, and lets triage catch it later', async () => {
    detailsFrom([null, '2']);

    const { jobs } = await run({ known: { has: () => true } });

    expect(jobs.map((job) => job.jobId)).toEqual([null]);
    expect(mocks.clickJobCard).toHaveBeenCalledTimes(1);
  });

  test('a card that fails to open does not use up the limit either', async () => {
    detailsFrom(['1', '2', '3']);
    mocks.clickJobCard.mockRejectedValueOnce(new Error('detached'));

    const { jobs } = await run();

    expect(jobs.map((job) => job.jobId)).toEqual(['2', '3']);
  });

  test('stops rather than walking every page when nothing can be extracted', async () => {
    // What a DOM change looks like: cards are found, none of them open.
    detailsFrom(Array.from({ length: 40 }, (_, i) => String(i + 1)));
    mocks.clickJobCard.mockRejectedValue(new Error('detached'));
    mocks.goToNextPage.mockResolvedValue(true);

    const { jobs, logs } = await run({ limit: 25 });

    expect(jobs).toEqual([]);
    expect(mocks.clickJobCard).toHaveBeenCalledTimes(5);
    expect(logs).toContain('Giving up after 5 jobs in a row failed to open.');
  });
});
