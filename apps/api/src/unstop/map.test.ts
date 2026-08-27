import { describe, expect, test } from 'vite-plus/test';
import type { UnstopItem } from './api.ts';
import { classifyUnstopPay, htmlToText, parseApprovedDate, toJobListing } from './map.ts';

/** Hand-trimmed from a live row, keeping only the fields the mapper reads. */
function item(overrides: Partial<UnstopItem> = {}): UnstopItem {
  return {
    id: 1744984,
    title: 'Full Stack Developer',
    details: '<p>Build things.</p>',
    seo_url: 'https://unstop.com/jobs/full-stack-developer-jazz-beats-llp-1744984',
    public_url: 'jobs/full-stack-developer-jazz-beats-llp-1744984',
    approved_date: '2026-08-27 20:26:06 GMT+0530',
    updated_at: '2026-08-27T20:26:06+05:30',
    organisation: { name: 'Jazz Beats LLP', public_url: 'c/jazz-beats-llp-2048427' },
    locations: [{ city: 'Pune', state: 'Maharashtra', country: 'India' }],
    required_skills: [
      { skill: 'React.js', pivot: { ai_generated: false } },
      { skill: 'Kubernetes', pivot: { ai_generated: true } },
    ],
    jobDetail: {
      min_salary: 20000,
      max_salary: 30000,
      currency: 'fa-rupee',
      pay_in: 'monthly',
      paid_unpaid: 'paid',
      show_salary: 1,
      not_disclosed: false,
      type: 'in_office',
      timing: 'full_time',
      locations: ['Pune'],
    },
    ...overrides,
  };
}

describe('approved_date', () => {
  test('parses the GMT+0530 form Date rejects', () => {
    expect(parseApprovedDate('2026-08-27 17:41:42 GMT+0530')).toBe('2026-08-27T12:11:42.000Z');
  });

  test('parses a negative offset', () => {
    expect(parseApprovedDate('2026-08-27 17:41:42 GMT-0400')).toBe('2026-08-27T21:41:42.000Z');
  });

  test('returns null for junk and for nothing', () => {
    expect(parseApprovedDate('not a date')).toBeNull();
    expect(parseApprovedDate(null)).toBeNull();
  });
});

describe('htmlToText', () => {
  test('turns list items into dashed lines', () => {
    expect(htmlToText('<ul><li>One</li><li>Two</li></ul>')).toBe('- One\n- Two');
  });

  test('decodes entities and drops tags', () => {
    expect(htmlToText('<p><strong>R&amp;D</strong> &rsquo;25</p>')).toBe('R&D ’25');
    expect(htmlToText('&#8377;25,000')).toBe('₹25,000');
  });

  test('collapses runs of blank lines', () => {
    expect(htmlToText('<p>A</p><p></p><p></p><p>B</p>')).toBe('A\n\nB');
  });
});

describe('unstop pay', () => {
  test('reads jobDetail, not the top-level isPaid registration-fee flag', () => {
    const job = toJobListing(item({ isPaid: false }));
    expect(job.pay.kind).toBe('paid');
    expect(job.pay.amount).toEqual({
      min: 20000,
      max: 30000,
      currency: 'INR',
      period: 'monthly',
    });
  });

  test('withheld figures never become an amount', () => {
    const pay = classifyUnstopPay(
      { show_salary: 0, min_salary: 20000, max_salary: 30000, paid_unpaid: 'paid' },
      null,
    );
    expect(pay.amount).toBeNull();
    expect(pay.evidence).toBe('jobDetail.paid_unpaid: paid');
  });

  test('not_disclosed beats a published figure', () => {
    const pay = classifyUnstopPay(
      { show_salary: 1, min_salary: 20000, not_disclosed: true, paid_unpaid: 'paid' },
      null,
    );
    expect(pay.amount).toBeNull();
  });

  test('unpaid is taken from the field', () => {
    const pay = classifyUnstopPay({ paid_unpaid: 'unpaid', show_salary: 0 }, 'Great learning.');
    expect(pay.kind).toBe('unpaid');
  });

  test('a small monthly stipend is a token', () => {
    const pay = classifyUnstopPay(
      {
        show_salary: 1,
        min_salary: 5000,
        max_salary: 8000,
        pay_in: 'monthly',
        currency: 'fa-rupee',
      },
      null,
    );
    expect(pay.kind).toBe('token');
  });

  test('an annual figure below the monthly ceiling is still pay', () => {
    const pay = classifyUnstopPay(
      { show_salary: 1, min_salary: 8000, pay_in: 'annually', currency: 'fa-dollar' },
      null,
    );
    expect(pay.kind).toBe('paid');
    expect(pay.amount?.currency).toBe('USD');
  });

  test('prose wins over a bare paid flag', () => {
    const pay = classifyUnstopPay(
      { paid_unpaid: 'paid', show_salary: 0 },
      'Stipend: ₹25,000/month',
    );
    expect(pay.kind).toBe('paid');
    expect(pay.evidence).toContain('25,000');
  });
});

describe('toJobListing', () => {
  test('maps the fields the rest of the pipeline reads', () => {
    const job = toJobListing(item(), new Date('2026-08-30T00:00:00Z'));
    expect(job.source).toBe('unstop');
    expect(job.jobId).toBe('1744984');
    expect(job.companyUrl).toBe('https://unstop.com/c/jazz-beats-llp-2048427');
    expect(job.locationText).toBe('Pune, Maharashtra, India');
    expect(job.jobType).toBe('On-site - Full-Time');
    expect(job.postedAtIso).toBe('2026-08-27T14:56:06.000Z');
    expect(job.postedAtText).toBe('2 days ago');
    expect(job.alumniCount).toBeNull();
  });

  test('reports only employer-stated skills as requirements', () => {
    expect(toJobListing(item()).requirementsText).toBe('Skills: React.js');
  });

  test('a remote row whose body demands office time is flagged', () => {
    const job = toJobListing(
      item({
        jobDetail: { type: 'wfh', paid_unpaid: 'paid', show_salary: 0 },
        locations: [],
        details: '<p>Remote role. You will be working from the office 3 days a week.</p>',
      }),
    );
    expect(job.locationText).toBe('Remote');
    expect(job.locationConflict?.tagged).toBe('remote');
    expect(job.locationConflict?.claimed.kind).toBe('onsite');
  });

  test('falls back to public_url when seo_url is missing', () => {
    const job = toJobListing(item({ seo_url: null }));
    expect(job.jobUrl).toBe('https://unstop.com/jobs/full-stack-developer-jazz-beats-llp-1744984');
  });
});
