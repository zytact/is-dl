import { detectAiAgentSignals } from '../ai-agent-detector.ts';
import { detectLocationConflict } from '../location-conflict.ts';
import { classifyPay, TOKEN_CEILING_INR } from '../pay.ts';
import type { JobListing, PayAmount, PayInfo, PayPeriod } from '../types.ts';
import { YC_ORIGIN, type YcPosting } from './api.ts';

const CURRENCY: Record<string, string> = { $: 'USD', '£': 'GBP', '€': 'EUR', '₹': 'INR' };

const MAGNITUDE: Record<string, number> = { K: 1_000, M: 1_000_000 };

function salaryPeriod(text: string | undefined): PayPeriod {
  // YC names the period only when it is not a yearly salary.
  if (text === undefined) return 'annually';
  if (/month/i.test(text)) return 'monthly';
  return /year|annual/i.test(text) ? 'annually' : 'unknown';
}

/** `salaryRange` is "$150K - $200K", "£80K - £90K GBP" or "₹25K - ₹75K INR / monthly". */
export function parseSalaryRange(text: string): PayAmount | null {
  const [range = '', period] = text.split('/').map((part) => part.trim());
  const figures = [...range.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*([KM])?\b/gi)].map(
    ([, digits = '', magnitude]) =>
      Number(digits.replaceAll(',', '')) * (MAGNITUDE[magnitude?.toUpperCase() ?? ''] ?? 1),
  );
  const [min, max = min] = figures;
  if (min === undefined || max === undefined || figures.length > 2) return null;

  const symbol = /[$£€₹]/.exec(range)?.[0];
  return {
    min,
    max,
    currency:
      /\b[A-Z]{3}\b/.exec(range)?.[0] ?? (symbol ? CURRENCY[symbol] : undefined) ?? 'unknown',
    period: salaryPeriod(period),
  };
}

function classifyYcPay(posting: YcPosting, descriptionText: string | null): PayInfo {
  const evidence = posting.salaryRange;
  if (!evidence) return classifyPay({ descriptionText, requirementsText: null });

  const amount = parseSalaryRange(evidence);
  const token =
    amount?.period === 'monthly' &&
    amount.currency === 'INR' &&
    (amount.max ?? 0) < TOKEN_CEILING_INR;
  return { kind: token ? 'token' : 'paid', evidence, amount };
}

/**
 * The years `minExperience` asks for. "Any (new grads ok)" and an internship's
 * missing value are zero, and text with no number in it is unknown.
 */
export function minExperienceYears(text: string | null): number | null {
  if (!text || /^any\b/i.test(text)) return 0;
  const years = /(\d+)\+?\s*years?/i.exec(text)?.[1];
  return years === undefined ? null : Number(years);
}

const UNIT_MS: Record<string, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
};

/** `createdAt` is an age such as "about 7 hours" or "over 1 year", so the date is approximate. */
export function postedAtIso(age: string | null, now: Date): string | null {
  const match = /(\d+)\s+(minute|hour|day|month|year)s?\b/i.exec(age ?? '');
  if (!match) return null;
  const elapsed = Number(match[1]) * UNIT_MS[match[2]!.toLowerCase()]!;
  return new Date(now.getTime() - elapsed).toISOString();
}

const COUNTRY_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });

/**
 * `location` names countries by code, as in "Bengaluru, KA, IN / Remote (US; CA)".
 * The code closes each place, so those are spelled out and `--location India`
 * matches the way it does on the other boards.
 */
export function locationSearchText(location: string): string {
  const countries = location
    .split(/[/;()]/)
    .map((place) => place.split(',').at(-1)!.trim())
    .filter((code) => /^[A-Z]{2}$/.test(code))
    .map((code) => COUNTRY_NAMES.of(code));
  return [location, ...new Set(countries)].join(' ').toLowerCase();
}

/** The listing's structured facts, one per line, so every client shows them. */
function requirementsText(posting: YcPosting): string | null {
  const facts: Array<[label: string, value: string | null]> = [
    ['Experience', posting.minExperience],
    ['Visa', posting.visa],
    ['Skills', posting.skills.join(', ')],
    ['Equity', posting.equityRange],
    ['YC batch', posting.companyBatchName],
    ['Last active', posting.lastActive ? `${posting.lastActive} ago` : null],
  ];
  const lines = facts.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
  return lines.length ? lines.join('\n') : null;
}

export function toJobListing(
  posting: YcPosting,
  descriptionText: string | null,
  now: Date = new Date(),
): JobListing {
  const requirements = requirementsText(posting);
  const { type: jobType, location: locationText } = posting;

  return {
    source: 'ycombinator',
    jobId: String(posting.id),
    jobUrl: `${YC_ORIGIN}${posting.url}`,
    ...(posting.applyUrl ? { applyUrl: posting.applyUrl } : {}),
    title: posting.title,
    companyName: posting.companyName,
    companyUrl: posting.companyUrl ? `${YC_ORIGIN}${posting.companyUrl}` : null,
    locationText,
    postedAtText: posting.createdAt ? `${posting.createdAt} ago` : null,
    postedAtIso: postedAtIso(posting.createdAt, now),
    jobType,
    alumniCount: null,
    descriptionText,
    requirementsText: requirements,
    aiAgentSignals: detectAiAgentSignals({
      title: posting.title,
      descriptionText,
      requirementsText: requirements,
    }),
    pay: classifyYcPay(posting, descriptionText),
    locationConflict: detectLocationConflict({
      jobType,
      locationText,
      descriptionText,
      requirementsText: requirements,
    }),
  };
}
