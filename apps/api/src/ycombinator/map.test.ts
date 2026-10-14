import { describe, expect, test } from 'vite-plus/test';
import type { YcPosting } from './api.ts';
import {
  locationSearchText,
  minExperienceYears,
  parseSalaryRange,
  postedAtIso,
  toJobListing,
} from './map.ts';

const NOW = new Date('2026-10-14T00:00:00.000Z');

/** Hand-trimmed from a live listing, keeping only the fields the mapper reads. */
function posting(overrides: Partial<YcPosting> = {}): YcPosting {
  return {
    id: 113568,
    title: 'Software Engineering Intern',
    url: '/companies/ressl-ai/jobs/D1H6F29-software-engineering-intern',
    applyUrl: 'https://account.ycombinator.com/authenticate?continue=x',
    location: 'Bengaluru, KA, IN / Remote (IN)',
    type: 'Internship',
    salaryRange: '₹25K - ₹75K INR / monthly',
    equityRange: null,
    minExperience: null,
    visa: 'US citizenship/visa not required',
    skills: ['Python'],
    companyName: 'Ressl AI',
    companyUrl: '/companies/ressl-ai',
    companyBatchName: 'W26',
    createdAt: '11 days',
    lastActive: '6 days',
    ...overrides,
  };
}

describe('salaryRange', () => {
  test.each([
    ['$150K - $200K', { min: 150000, max: 200000, currency: 'USD', period: 'annually' }],
    ['£80K - £90K GBP', { min: 80000, max: 90000, currency: 'GBP', period: 'annually' }],
    ['₹3M - ₹8M INR', { min: 3000000, max: 8000000, currency: 'INR', period: 'annually' }],
    ['₹25K - ₹75K INR / monthly', { min: 25000, max: 75000, currency: 'INR', period: 'monthly' }],
    ['$1,500 - $2,000 / monthly', { min: 1500, max: 2000, currency: 'USD', period: 'monthly' }],
    ['$40 / hourly', { min: 40, max: 40, currency: 'USD', period: 'unknown' }],
  ])('%s', (text, amount) => {
    expect(parseSalaryRange(text)).toEqual(amount);
  });

  test('text with no figure in it has no amount', () => {
    expect(parseSalaryRange('Competitive')).toBeNull();
  });
});

describe('minExperience', () => {
  test.each([
    ['Any (new grads ok)', 0],
    [null, 0],
    ['1+ years', 1],
    ['6+ years', 6],
    ['Senior', null],
  ])('%s', (text, years) => {
    expect(minExperienceYears(text)).toBe(years);
  });
});

describe('createdAt', () => {
  test.each([
    ['about 7 hours', '2026-10-13T17:00:00.000Z'],
    ['11 days', '2026-10-03T00:00:00.000Z'],
    ['over 1 year', '2025-10-14T00:00:00.000Z'],
    [null, null],
  ])('%s', (age, iso) => {
    expect(postedAtIso(age, NOW)).toBe(iso);
  });
});

describe('location', () => {
  test('spells out the country codes so a country name matches', () => {
    expect(locationSearchText('Bengaluru, KA, IN / Remote (IN)')).toContain('india');
    expect(locationSearchText('PDE / Remote (US; CA)')).toContain('united states canada');
    expect(locationSearchText('San Francisco, CA, US')).not.toContain('canada');
  });
});

describe('toJobListing', () => {
  test('carries the structured facts and the apply link', () => {
    const job = toJobListing(posting(), 'Build agents.', NOW);

    expect(job).toMatchObject({
      source: 'ycombinator',
      jobId: '113568',
      jobUrl:
        'https://www.ycombinator.com/companies/ressl-ai/jobs/D1H6F29-software-engineering-intern',
      applyUrl: 'https://account.ycombinator.com/authenticate?continue=x',
      companyUrl: 'https://www.ycombinator.com/companies/ressl-ai',
      locationText: 'Bengaluru, KA, IN / Remote (IN)',
      postedAtText: '11 days ago',
      jobType: 'Internship',
      descriptionText: 'Build agents.',
      requirementsText:
        'Visa: US citizenship/visa not required\nSkills: Python\nYC batch: W26\nLast active: 6 days ago',
    });
    expect(job.pay).toEqual({
      kind: 'paid',
      evidence: '₹25K - ₹75K INR / monthly',
      amount: { min: 25000, max: 75000, currency: 'INR', period: 'monthly' },
    });
  });

  test('a monthly rupee stipend under the ceiling is a token', () => {
    expect(toJobListing(posting({ salaryRange: '₹5K - ₹8K INR / monthly' }), null).pay.kind).toBe(
      'token',
    );
  });

  test('pay falls back to the description when the listing publishes no range', () => {
    const job = toJobListing(posting({ salaryRange: null }), 'This is an unpaid internship.');
    expect(job.pay.kind).toBe('unpaid');
    expect(job.pay.amount).toBeNull();
  });

  test('a remote listing whose description wants the office is flagged', () => {
    const job = toJobListing(posting(), 'You will work from the office in Bengaluru.');
    expect(job.locationConflict?.claimed.kind).toBe('onsite');
  });
});
