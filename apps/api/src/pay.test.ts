import { describe, expect, test } from 'vite-plus/test';
import { detectLocationConflict } from './location-conflict.ts';
import { classifyPay } from './pay.ts';
import type { PayKind } from './types.ts';

function kind(description: string): PayKind {
  return classifyPay({ descriptionText: description, requirementsText: null }).kind;
}

describe('pay classification', () => {
  // Every string here was seen verbatim in a real LinkedIn scrape.
  const cases: Array<[PayKind, string]> = [
    ['unpaid', 'Stipend: Unpaid'],
    ['unpaid', 'Type: Unpaid'],
    ['unpaid', 'Compensation: Unpaid'],
    ['unpaid', 'This is an unpaid internship for students.'],
    ['unpaid', 'We are hiring for an unpaid internship role.'],
    ['token', 'Performance based stipend up-to 7500.00'],
    ['token', 'Performance-based stipend of up to ₹7,500'],
    ['paid', 'Stipend: ₹25,000/month for the duration.'],
    ['paid', 'Compensation is 240K INR/yr - 360K INR/yr depending on experience.'],
    ['paid', 'We offer a competitive stipend as compensation.'],
    ['paid', 'The paid internship will be for six months.'],
    ['unstated', 'Stipend: Unpaid / Paid'],
    ['unstated', 'Great learning opportunity with a fast growing team.'],
    ['unstated', 'You will work 8 hours a day across 5 days a week.'],
  ];

  for (const [expected, text] of cases) {
    test(`${expected}: ${text.slice(0, 45)}`, () => {
      expect(kind(text)).toBe(expected);
    });
  }

  test('a performance-based stipend above the ceiling is real pay', () => {
    expect(kind('Performance based stipend up-to 45,000 per month')).toBe('paid');
  });

  test('evidence is the snippet the decision came from', () => {
    const pay = classifyPay({
      descriptionText: 'About us. Stipend: Unpaid. Apply now.',
      requirementsText: null,
    });
    expect(pay.evidence).toBe('Stipend: Unpaid');
  });

  test('unstated carries no evidence', () => {
    expect(classifyPay({ descriptionText: 'Join our team.', requirementsText: null })).toEqual({
      kind: 'unstated',
      evidence: null,
    });
  });

  test('hours and years do not read as rupees', () => {
    expect(kind('Stipend discussed later. Expect 40 hours a week and 2 years of growth.')).toBe(
      'unstated',
    );
  });
});

describe('location conflict', () => {
  test('remote tag plus an office mandate is reported with both claims', () => {
    const conflict = detectLocationConflict({
      jobType: 'Remote',
      locationText: 'Bengaluru, India',
      descriptionText: 'Location: Bengaluru, work from office, 5 days a week',
      requirementsText: null,
    });
    expect(conflict).toEqual({
      tagged: 'remote',
      claimed: { kind: 'onsite', evidence: 'work from office, 5 days a week' },
    });
  });

  test('an on-site tag is not a conflict', () => {
    expect(
      detectLocationConflict({
        jobType: 'On-site',
        locationText: 'Guwahati',
        descriptionText: 'Work from office every day.',
        requirementsText: null,
      }),
    ).toBeNull();
  });

  test('a genuinely remote listing reports nothing', () => {
    expect(
      detectLocationConflict({
        jobType: 'Remote',
        locationText: 'India',
        descriptionText: 'Fully distributed team, we use office software daily.',
        requirementsText: null,
      }),
    ).toBeNull();
  });
});
