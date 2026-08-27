import { detectAiAgentSignals } from '../ai-agent-detector.ts';
import { detectLocationConflict } from '../location-conflict.ts';
import { classifyPay, emptyPay, TOKEN_CEILING_INR } from '../pay.ts';
import type { JobListing, PayAmount, PayInfo, PayPeriod, WorkplaceClaim } from '../types.ts';
import type { UnstopItem, UnstopJobDetail } from './api.ts';

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  mdash: '-',
  ndash: '-',
  rarr: '->',
  larr: '<-',
  bull: '-',
  middot: '·',
  deg: '°',
  times: '×',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code =
        body.startsWith('#x') || body.startsWith('#X')
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * `details` is HTML, and pay, location and AI-agent detection all expect prose.
 * List items become dashes so the bullets survive as readable lines.
 */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|ul|ol|h[1-6]|tr|table)\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const APPROVED_DATE =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*(?:GMT)?\s*([+-])(\d{2}):?(\d{2})$/;

/** `approved_date` is "2026-08-27 17:41:42 GMT+0530", which `Date` will not parse. */
export function parseApprovedDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = APPROVED_DATE.exec(value.trim());
  const iso = match ? `${match[1]}T${match[2]}${match[3]}${match[4]}:${match[5]}` : value.trim();
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function relativeDay(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

const WORKPLACE: Record<string, WorkplaceClaim> = {
  wfh: 'remote',
  hybrid: 'hybrid',
  in_office: 'onsite',
  on_field: 'onsite',
};

const WORKPLACE_LABEL: Record<WorkplaceClaim, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
};

function titleCase(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('-');
}

function jobTypeText(detail: UnstopJobDetail | null | undefined): string | null {
  const workplace = detail?.type ? WORKPLACE[detail.type] : undefined;
  const parts = [
    workplace ? WORKPLACE_LABEL[workplace] : null,
    detail?.timing ? titleCase(detail.timing) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' - ') : null;
}

function locationText(item: UnstopItem): string | null {
  const cities = (item.locations ?? [])
    .map((entry) => [entry.city, entry.state, entry.country].filter(Boolean).join(', '))
    .filter(Boolean);
  if (cities.length) return [...new Set(cities)].join(' | ');

  const fallback = (item.jobDetail?.locations ?? []).filter(Boolean);
  if (fallback.length) return fallback.join(' | ');

  return item.jobDetail?.type === 'wfh' ? 'Remote' : null;
}

/** Currency arrives as a FontAwesome class name, not a code. */
const CURRENCY: Record<string, string> = {
  'fa-rupee': 'INR',
  'fa-dollar': 'USD',
  'fa-euro': 'EUR',
  'fa-pound': 'GBP',
};

function period(value: string | null | undefined): PayPeriod {
  if (value === 'monthly' || value === 'annually') return value;
  return 'unknown';
}

/** Only when the employer chose to publish figures. */
function payAmount(detail: UnstopJobDetail): PayAmount | null {
  if (detail.show_salary !== 1 || detail.not_disclosed) return null;
  const min = typeof detail.min_salary === 'number' ? detail.min_salary : null;
  const max = typeof detail.max_salary === 'number' ? detail.max_salary : null;
  if (min === null && max === null) return null;
  return {
    min,
    max,
    currency: CURRENCY[detail.currency ?? ''] ?? detail.currency ?? 'unknown',
    period: period(detail.pay_in),
  };
}

function describeAmount(amount: PayAmount): string {
  const range = [amount.min, amount.max].filter((value) => value !== null);
  const figures =
    range.length === 2 && range[0] !== range[1] ? `${range[0]}-${range[1]}` : String(range[0]);
  const suffix = amount.period === 'unknown' ? '' : ` ${amount.period}`;
  return `${amount.currency} ${figures}${suffix}`;
}

/**
 * Top-level `isPaid` is about registration fees, never compensation. Pay comes
 * from `jobDetail`, and only falls back to the prose classifier when the
 * employer withheld the figures.
 */
export function classifyUnstopPay(
  detail: UnstopJobDetail | null | undefined,
  descriptionText: string | null,
): PayInfo {
  if (!detail) return classifyPay({ descriptionText, requirementsText: null });

  if (detail.paid_unpaid === 'unpaid') {
    return { kind: 'unpaid', evidence: 'jobDetail.paid_unpaid: unpaid', amount: null };
  }

  const amount = payAmount(detail);
  if (amount) {
    const top = amount.max ?? amount.min ?? 0;
    const token = amount.period === 'monthly' && top < TOKEN_CEILING_INR;
    return { kind: token ? 'token' : 'paid', evidence: describeAmount(amount), amount };
  }

  const fromProse = classifyPay({ descriptionText, requirementsText: null });
  if (fromProse.kind !== 'unstated') return fromProse;

  return detail.paid_unpaid === 'paid'
    ? { kind: 'paid', evidence: 'jobDetail.paid_unpaid: paid', amount: null }
    : emptyPay();
}

/**
 * AI-generated skills are Unstop's own guesses. Only employer-stated ones are
 * reported as requirements, so the AI-agent detector never scores a guess.
 */
function requirementsText(item: UnstopItem): string | null {
  const stated = (item.required_skills ?? [])
    .filter((entry) => entry.skill && entry.pivot?.ai_generated !== true)
    .map((entry) => entry.skill as string);
  const unique = [...new Set(stated)];
  return unique.length ? `Skills: ${unique.join(', ')}` : null;
}

export function toJobListing(item: UnstopItem, now: Date = new Date()): JobListing {
  const detail = item.jobDetail ?? null;
  const descriptionText = item.details ? htmlToText(item.details) || null : null;
  const requirements = requirementsText(item);
  const postedAtIso = parseApprovedDate(item.approved_date) ?? item.updated_at ?? null;
  const jobType = jobTypeText(detail);
  const location = locationText(item);

  return {
    source: 'unstop',
    jobId: String(item.id),
    jobUrl: item.seo_url ?? `https://unstop.com/${item.public_url ?? ''}`,
    title: item.title || null,
    companyName: item.organisation?.name || null,
    companyUrl: item.organisation?.public_url
      ? `https://unstop.com/${item.organisation.public_url}`
      : null,
    locationText: location,
    postedAtText: relativeDay(postedAtIso, now),
    postedAtIso,
    jobType,
    alumniCount: null,
    descriptionText,
    requirementsText: requirements,
    aiAgentSignals: detectAiAgentSignals({
      title: item.title || null,
      descriptionText,
      requirementsText: requirements,
    }),
    pay: classifyUnstopPay(detail, descriptionText),
    locationConflict: detectLocationConflict({
      workplace: detail?.type ? (WORKPLACE[detail.type] ?? null) : null,
      jobType,
      locationText: location,
      descriptionText,
      requirementsText: requirements,
    }),
  };
}
