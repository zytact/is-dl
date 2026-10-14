import { afterEach, describe, expect, test, vi } from 'vite-plus/test';
import type { JobListing, SearchQuery, YcombinatorOptions } from '../types.ts';
import type { YcPosting } from './api.ts';
import { ycombinatorSource } from './source.ts';

const fetchRolePage = vi.hoisted(() => vi.fn());
const fetchDescription = vi.hoisted(() => vi.fn());

vi.mock('./api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api.ts')>()),
  fetchRolePage,
  fetchDescription,
}));

function posting(id: number, overrides: Partial<YcPosting> = {}): YcPosting {
  return {
    id,
    url: `/companies/acme/jobs/${id}`,
    title: 'Founding Engineer',
    applyUrl: null,
    companyName: 'Acme',
    companyUrl: null,
    companyBatchName: null,
    location: 'San Francisco, CA, US / Remote (US)',
    type: 'Full-time',
    minExperience: '3+ years',
    visa: 'US citizen/visa only',
    salaryRange: '$150K - $200K',
    equityRange: null,
    skills: [],
    createdAt: '2 days',
    lastActive: null,
    ...overrides,
  };
}

const query: SearchQuery = { keywords: 'anything at all', location: '', limit: 50 };

/** Fake timers so the polite delay between requests does not stall the test. */
async function run(
  queryOverrides: Partial<SearchQuery> = {},
  options: Partial<YcombinatorOptions> = {},
): Promise<{ jobs: JobListing[]; logs: string[] }> {
  const logs: string[] = [];
  vi.useFakeTimers();
  const pending = ycombinatorSource({ roles: ['software-engineer'], ...options }).run(
    { ...query, ...queryOverrides },
    { onLog: (msg) => logs.push(msg) },
  );
  await vi.advanceTimersByTimeAsync(120000);
  return { jobs: await pending, logs };
}

afterEach(() => {
  vi.useRealTimers();
  fetchRolePage.mockReset();
  fetchDescription.mockReset();
});

describe('ycombinator source', () => {
  const listings = [
    posting(1),
    posting(2, { type: 'Internship', minExperience: null, visa: 'Will sponsor' }),
    posting(3, { minExperience: 'Any (new grads ok)', visa: 'US citizenship/visa not required' }),
    posting(4, { minExperience: '6+ years', visa: 'US citizenship/visa not required' }),
    posting(5, { location: 'London, England, GB', visa: 'Will sponsor', minExperience: null }),
  ];

  test.each<[string, Partial<SearchQuery>, Partial<YcombinatorOptions>, string[]]>([
    ['keywords alone filter nothing', {}, {}, ['1', '2', '3', '4', '5']],
    ['US-only visas', {}, { skipUsOnly: true }, ['2', '3', '4', '5']],
    ['a ceiling on experience', {}, { maxExperience: 1 }, ['2', '3', '5']],
    ['the listing type', {}, { jobType: ['internship'] }, ['2']],
    ['a country by name', { location: 'United Kingdom' }, {}, ['5']],
    ['remote', { remoteOnly: true }, {}, ['1', '2', '3', '4']],
  ])('filters on the listing fields: %s', async (_name, asked, options, expected) => {
    fetchRolePage.mockResolvedValue(listings);
    fetchDescription.mockResolvedValue('Build.');

    const { jobs } = await run(asked, options);

    expect(jobs.map((job) => job.jobId)).toEqual(expected);
    expect(fetchRolePage).toHaveBeenCalledWith(
      'software-engineer',
      asked.remoteOnly ?? false,
      undefined,
    );
  });

  test('only a listing that is kept costs a description request', async () => {
    fetchRolePage.mockResolvedValue([
      posting(1),
      posting(2, { companyName: 'Mill' }),
      posting(3),
      posting(4),
    ]);
    fetchDescription.mockResolvedValue('Build.');

    const { jobs, logs } = await run({
      limit: 1,
      known: { has: (_source, jobId) => jobId === '1' },
      blocked: { has: (company) => company === 'Mill' },
    });

    expect(jobs.map((job) => job.jobId)).toEqual(['3']);
    expect(fetchDescription).toHaveBeenCalledTimes(1);
    expect(logs).toContain('Skipped 1 already seen or applied to.');
    expect(logs).toContain('Skipped 1 from blocked companies: Mill.');
  });

  test('a listing shared by two roles is returned once', async () => {
    fetchRolePage.mockResolvedValue([posting(1)]);
    fetchDescription.mockResolvedValue(null);

    const { jobs } = await run({}, { roles: ['software-engineer', 'designer'] });

    expect(fetchRolePage).toHaveBeenCalledTimes(2);
    expect(jobs).toHaveLength(1);
  });

  test('stops asking for descriptions once listing pages keep failing', async () => {
    fetchRolePage.mockResolvedValue([1, 2, 3, 4, 5].map((id) => posting(id)));
    fetchDescription.mockRejectedValue(new Error('Y Combinator returned 429 Too Many Requests'));

    const { jobs, logs } = await run();

    expect(jobs).toHaveLength(5);
    expect(jobs.every((job) => job.descriptionText === null)).toBe(true);
    expect(fetchDescription).toHaveBeenCalledTimes(3);
    expect(logs).toContain(
      'WARNING: no description for listing 1: Y Combinator returned 429 Too Many Requests',
    );
  });

  test('a role page that fails fails the source', async () => {
    fetchRolePage.mockRejectedValue(new Error('Y Combinator returned 404 Not Found'));
    await expect(
      ycombinatorSource({ roles: ['nope'] }).run(query, { onLog: () => {} }),
    ).rejects.toThrow('404 Not Found');
  });
});
