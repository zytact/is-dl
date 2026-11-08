import { describe, expect, test } from 'vite-plus/test';
import type { WfListing } from './api.ts';
import { parseSalary, salaryText, toJobListing } from './map.ts';

function listing(overrides: Partial<WfListing> = {}): WfListing {
  return {
    id: '4970038',
    slug: 'software-engineer',
    title: 'Software Engineer',
    description: 'Comfort working full-time on-site in Gurugram.',
    jobType: 'full-time',
    liveStartAt: Date.parse('2026-11-01T00:00:00Z') / 1000,
    locationNames: ['Gurgaon'],
    remote: false,
    acceptedRemoteLocationNames: [],
    compensation: '₹9.6L – ₹12L • No equity',
    yearsExperienceMin: 1,
    yearsExperienceMax: null,
    companyName: 'ARPM',
    companySlug: 'arpm',
    companyConcept: 'Visual programming for AEC',
    ...overrides,
  };
}

describe('compensation', () => {
  test.each([
    ['₹9.6L – ₹12L', { min: 960_000, max: 1_200_000, currency: 'INR' }],
    ['$40k – $100k', { min: 40_000, max: 100_000, currency: 'USD' }],
    ['₹1Cr – ₹1.5Cr', { min: 10_000_000, max: 15_000_000, currency: 'INR' }],
    ['₹6,00,000 – ₹8,00,000', { min: 600_000, max: 800_000, currency: 'INR' }],
    ['CA$90k – CA$120k', { min: 90_000, max: 120_000, currency: 'unknown' }],
  ])('reads %s as a yearly range', (text, expected) => {
    expect(parseSalary(text)).toEqual({ ...expected, period: 'annually' });
  });

  test.each([
    ['₹9.6L – ₹12L • No equity', '₹9.6L – ₹12L'],
    ['No equity', null],
    ['1.0% – 2.0%', null],
    [null, null],
  ])('the salary in %s is %s', (compensation, expected) => {
    expect(salaryText(compensation)).toBe(expected);
  });
});

describe('toJobListing', () => {
  const now = new Date('2026-11-09T12:00:00Z');

  test('maps the listing onto the shared shape', () => {
    expect(toJobListing(listing(), now)).toMatchObject({
      source: 'wellfound',
      jobId: '4970038',
      jobUrl: 'https://wellfound.com/jobs/4970038-software-engineer',
      companyName: 'ARPM',
      companyUrl: 'https://wellfound.com/company/arpm',
      locationText: 'Gurgaon',
      postedAtText: '8 days ago',
      postedAtIso: '2026-11-01T00:00:00.000Z',
      jobType: 'Full-time',
      requirementsText:
        'Experience: 1+ years\nEquity: No equity\nCompany: Visual programming for AEC',
      pay: {
        kind: 'paid',
        evidence: '₹9.6L – ₹12L • No equity',
        amount: { min: 960_000, max: 1_200_000, currency: 'INR', period: 'annually' },
      },
      locationConflict: null,
    });
  });

  test('a remote listing names where it hires from, and an office claim is a conflict', () => {
    const job = toJobListing(
      listing({ remote: true, acceptedRemoteLocationNames: ['India', 'Europe'] }),
      now,
    );
    expect(job.locationText).toBe('Gurgaon / Remote (India; Europe)');
    expect(job.locationConflict?.claimed.kind).toBe('onsite');
  });

  test('a yearly rupee figure under the monthly token ceiling is a token', () => {
    expect(toJobListing(listing({ compensation: '₹50k – ₹1L' }), now).pay.kind).toBe('token');
  });

  test('without a salary, pay comes from the description', () => {
    const pay = toJobListing(
      listing({ compensation: 'No equity', description: 'This is an unpaid internship.' }),
      now,
    ).pay;
    expect(pay.kind).toBe('unpaid');
  });
});
