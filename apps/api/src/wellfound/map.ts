import { detectAiAgentSignals } from '../ai-agent-detector.ts';
import { detectLocationConflict } from '../location-conflict.ts';
import { relativeDay } from '../normalize.ts';
import { classifyPay, TOKEN_CEILING_INR } from '../pay.ts';
import type { JobListing, PayAmount, PayInfo } from '../types.ts';
import { WF_ORIGIN, type WfListing } from './api.ts';

const CURRENCY: Record<string, string> = { $: 'USD', '£': 'GBP', '€': 'EUR', '₹': 'INR' };

/** `L` is a lakh and `Cr` a crore, the way Wellfound writes rupees. */
const MAGNITUDE: Record<string, number> = { k: 1_000, m: 1_000_000, l: 100_000, cr: 10_000_000 };

/** The part of `compensation` before the bullet, or null when it only names equity. */
export function salaryText(compensation: string | null): string | null {
  const salary = compensation?.split('•')[0]?.trim();
  return salary && /\d/.test(salary) && !salary.includes('%') ? salary : null;
}

/**
 * A yearly salary such as "₹9.6L – ₹12L" or "$40k – $100k". A symbol with
 * letters before it, as in "CA$", names a currency this does not map.
 */
export function parseSalary(salary: string): PayAmount | null {
  const figures = [
    ...salary.replaceAll(',', '').matchAll(/([A-Z]*)([$£€₹])\s*(\d+(?:\.\d+)?)\s*(k|m|l|cr)?\b/gi),
  ];
  const [first, second = first] = figures;
  if (first === undefined || second === undefined || figures.length > 2) return null;

  const value = ([, , , digits = '', magnitude = '']: RegExpExecArray) =>
    Number(digits) * (MAGNITUDE[magnitude.toLowerCase()] ?? 1);
  const [, prefix = '', symbol = ''] = first;
  return {
    min: value(first),
    max: value(second),
    currency: prefix ? 'unknown' : (CURRENCY[symbol] ?? 'unknown'),
    period: 'annually',
  };
}

function classifyWellfoundPay(listing: WfListing): PayInfo {
  const salary = salaryText(listing.compensation);
  if (salary === null) {
    return classifyPay({ descriptionText: listing.description, requirementsText: null });
  }

  const amount = parseSalary(salary);
  const token = amount?.currency === 'INR' && (amount.max ?? 0) / 12 < TOKEN_CEILING_INR;
  return { kind: token ? 'token' : 'paid', evidence: listing.compensation, amount };
}

/** "Bengaluru, Pune / Remote (India; Europe)", the shape the Y Combinator board uses. */
export function locationText(listing: WfListing): string | null {
  const places = listing.locationNames.join(', ');
  if (!listing.remote) return places || null;
  const from = listing.acceptedRemoteLocationNames.join('; ');
  const remote = from ? `Remote (${from})` : 'Remote';
  return places ? `${places} / ${remote}` : remote;
}

function experienceText({ yearsExperienceMin: min, yearsExperienceMax: max }: WfListing) {
  if (min === null) return null;
  if (max !== null && max > min) return `${min}-${max} years`;
  return `${min}+ years`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** The listing's structured facts, one per line, so every client shows them. */
function requirementsText(listing: WfListing): string | null {
  const equity = listing.compensation?.split('•').find((part) => /equity|%/i.test(part));
  const facts: Array<[label: string, value: string | null]> = [
    ['Experience', experienceText(listing)],
    ['Equity', equity?.trim() ?? null],
    ['Company', listing.companyConcept],
  ];
  const lines = facts.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
  return lines.length ? lines.join('\n') : null;
}

export function toJobListing(listing: WfListing, now: Date = new Date()): JobListing {
  const requirements = requirementsText(listing);
  const descriptionText = listing.description;
  const location = locationText(listing);
  const jobType = listing.jobType ? capitalize(listing.jobType) : null;
  const postedAtIso =
    listing.liveStartAt === null ? null : new Date(listing.liveStartAt * 1000).toISOString();

  return {
    source: 'wellfound',
    jobId: listing.id,
    jobUrl: `${WF_ORIGIN}/jobs/${listing.id}-${listing.slug}`,
    title: listing.title,
    companyName: listing.companyName,
    companyUrl: listing.companySlug ? `${WF_ORIGIN}/company/${listing.companySlug}` : null,
    locationText: location,
    postedAtText: relativeDay(postedAtIso, now),
    postedAtIso,
    jobType,
    alumniCount: null,
    descriptionText,
    requirementsText: requirements,
    aiAgentSignals: detectAiAgentSignals({
      title: listing.title,
      descriptionText,
      requirementsText: requirements,
    }),
    pay: classifyWellfoundPay(listing),
    locationConflict: detectLocationConflict({
      workplace: listing.remote ? 'remote' : 'onsite',
      jobType,
      locationText: location,
      descriptionText,
      requirementsText: null,
    }),
  };
}
