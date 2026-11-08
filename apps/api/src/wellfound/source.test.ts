import { afterEach, describe, expect, test, vi } from 'vite-plus/test';
import type { JobListing, SearchQuery, WellfoundOptions } from '../types.ts';
import type { WfListing, WfPage } from './api.ts';
import { MAX_PAGES, placeFor, wellfoundSource } from './source.ts';

const fetchSearchPage = vi.hoisted(() => vi.fn());

vi.mock('./api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api.ts')>()),
  fetchSearchPage,
}));

function listing(id: number, overrides: Partial<WfListing> = {}): WfListing {
  return {
    id: String(id),
    slug: 'software-engineer',
    title: 'Software Engineer',
    description: null,
    jobType: 'full-time',
    liveStartAt: null,
    locationNames: ['Bengaluru'],
    remote: false,
    acceptedRemoteLocationNames: [],
    compensation: null,
    yearsExperienceMin: 3,
    yearsExperienceMax: null,
    companyName: 'Acme',
    companySlug: 'acme',
    companyConcept: null,
    ...overrides,
  };
}

function pageOf(listings: WfListing[], pageCount = 1): WfPage {
  return { listings, pageCount };
}

const query: SearchQuery = { keywords: 'anything at all', location: 'India', limit: 50 };

/** Fake timers so the polite delay between requests does not stall the test. */
async function run(
  queryOverrides: Partial<SearchQuery> = {},
  options: Partial<WellfoundOptions> = {},
): Promise<{ jobs: JobListing[]; logs: string[] }> {
  const logs: string[] = [];
  vi.useFakeTimers();
  const pending = wellfoundSource({ roles: ['software-engineer'], ...options }).run(
    { ...query, ...queryOverrides },
    { onLog: (msg) => logs.push(msg) },
  );
  await vi.advanceTimersByTimeAsync(120000);
  return { jobs: await pending, logs };
}

afterEach(() => {
  vi.useRealTimers();
  fetchSearchPage.mockReset();
});

describe('wellfound source', () => {
  const listings = [
    listing(1),
    listing(2, { jobType: 'internship', yearsExperienceMin: null }),
    listing(3, { yearsExperienceMin: 0, remote: true }),
    listing(4, { yearsExperienceMin: 1 }),
  ];

  test.each<[string, Partial<SearchQuery>, Partial<WellfoundOptions>, string[]]>([
    ['keywords alone filter nothing', {}, {}, ['1', '2', '3', '4']],
    ['a ceiling on experience', {}, { maxExperience: 1 }, ['2', '3', '4']],
    ['the listing type', {}, { jobType: ['Internship'] }, ['2']],
    ['remote', { remoteOnly: true }, {}, ['3']],
  ])('filters on the listing fields: %s', async (_name, asked, options, expected) => {
    fetchSearchPage.mockResolvedValue(pageOf(listings));
    const { jobs } = await run(asked, options);
    expect(jobs.map((job) => job.jobId)).toEqual(expected);
  });

  test.each<[Partial<SearchQuery>, ReturnType<typeof placeFor>]>([
    [{ location: 'India' }, { kind: 'location', slug: 'india' }],
    [{ location: ' New York ' }, { kind: 'location', slug: 'new-york' }],
    [{ location: 'Remote' }, { kind: 'remote' }],
    [{ location: '', remoteOnly: true }, { kind: 'remote' }],
    [{ location: '' }, { kind: 'everywhere' }],
  ])('--location picks the page: %o', (asked, place) => {
    expect(placeFor({ ...query, ...asked })).toEqual(place);
  });

  test('pages until the limit is met', async () => {
    fetchSearchPage
      .mockResolvedValueOnce(pageOf([listing(1), listing(2)], 10))
      .mockResolvedValueOnce(pageOf([listing(3), listing(4)], 10));

    const { jobs } = await run({ limit: 3 });

    expect(jobs.map((job) => job.jobId)).toEqual(['1', '2', '3']);
    expect(fetchSearchPage).toHaveBeenCalledTimes(2);
    expect(fetchSearchPage).toHaveBeenLastCalledWith(
      'software-engineer',
      { kind: 'location', slug: 'india' },
      2,
      undefined,
    );
  });

  test('reads no more than the page cap, or the pages that exist', async () => {
    let id = 0;
    fetchSearchPage.mockImplementation(async () => pageOf([listing(++id)], 10));
    await run();
    expect(fetchSearchPage).toHaveBeenCalledTimes(MAX_PAGES);

    fetchSearchPage.mockReset();
    fetchSearchPage.mockResolvedValue(pageOf([listing(1)], 1));
    await run();
    expect(fetchSearchPage).toHaveBeenCalledTimes(1);
  });

  test('skips known jobs and blocked companies, and counts each listing once', async () => {
    fetchSearchPage.mockResolvedValue(
      pageOf([listing(1), listing(2, { companyName: 'Mill' }), listing(3)]),
    );

    const { jobs, logs } = await run(
      {
        known: { has: (source, jobId) => source === 'wellfound' && jobId === '1' },
        blocked: { has: (company) => company === 'Mill' },
      },
      { roles: ['software-engineer', 'full-stack-engineer'] },
    );

    expect(jobs.map((job) => job.jobId)).toEqual(['3']);
    expect(logs).toContain('Skipped 1 already seen or applied to.');
    expect(logs).toContain('Skipped 1 from blocked companies: Mill.');
  });

  test('a page that fails fails the source', async () => {
    fetchSearchPage.mockRejectedValue(new Error('Wellfound blocked the request'));
    await expect(
      wellfoundSource({ roles: ['software-engineer'] }).run(query, { onLog: () => {} }),
    ).rejects.toThrow('blocked');
  });
});
