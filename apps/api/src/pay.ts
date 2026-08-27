import type { JobListing, PayInfo, PayKind } from './types.ts';

/** Below this, a monthly stipend is a token, not pay. */
export const TOKEN_CEILING_INR = 10000;

const AMBIGUOUS = /\bunpaid\s*(?:\/|\||\bor\b)\s*paid\b|\bpaid\s*(?:\/|\||\bor\b)\s*unpaid\b/i;

const UNPAID = [
  /\b(?:stipend|compensation|salary|remuneration|type)\s*[:-]\s*unpaid\b/i,
  /\bthis\s+(?:is|internship\s+is)\s+an?\s+unpaid\b[^.\n]*/i,
  /\bunpaid\s+(?:internship|role|position|opportunity|training)\b/i,
  /\b(?:stipend|compensation)\s*[:-]\s*(?:none|nil|not\s+provided|no)\b/i,
  /\bno\s+stipend\b[^.\n]*/i,
];

/** A number written as 7500, 7,500, 7.5k or 7500/-. */
const AMOUNT = String.raw`(?:\d[\d,]*(?:\.\d+)?\s*[kK]?)`;

const CURRENCY = String.raw`(?:₹|\brs\.?|\binr\b|\busd\b|\$)`;

const TOKEN = [
  new RegExp(
    String.raw`\bperformance[\s-]*based\s+stipend[^.\n]{0,40}?${CURRENCY}?\s*(${AMOUNT})`,
    'i',
  ),
  new RegExp(
    String.raw`\bstipend[^.\n]{0,40}?performance[\s-]*based[^.\n]{0,40}?${CURRENCY}?\s*(${AMOUNT})`,
    'i',
  ),
];

const CURRENCY_FIRST = String.raw`${CURRENCY}\s*${AMOUNT}(?:\s*(?:lakhs?|lpa)\b)?`;
const CURRENCY_LAST = String.raw`${AMOUNT}\s*(?:inr|usd|lpa|lakhs?)\b`;
const MONEY = new RegExp(
  String.raw`(?:${CURRENCY_FIRST}|${CURRENCY_LAST})(?:\s*(?:-|–|to)\s*(?:${CURRENCY_FIRST}|${CURRENCY_LAST}))?(?:\s*(?:\/|per\s+|p\.?)\s*(?:month|mo\b|year|yr\b|annum|week|hour|hr\b))?`,
  'i',
);

const PAY_CONTEXT = /\b(?:stipend|salary|compensation|ctc|remuneration|package|pay|paid)\b/i;

const PAID_CLAIMS = [
  /\bcompetitive\s+stipend\b[^.\n]*/i,
  /\bthe\s+paid\s+internship\b[^.\n]*/i,
  /\bpaid\s+internship\b/i,
  /\b(?:stipend|compensation)\s*[:-]\s*(?:paid|yes)\b/i,
];

function snippet(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + length + 60);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function clean(match: string): string {
  return match.replace(/\s+/g, ' ').trim();
}

function toInr(raw: string): number {
  const digits = raw.replace(/[,\s]/g, '');
  const value = Number.parseFloat(digits);
  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  return /k$/i.test(digits) ? value * 1000 : value;
}

function firstMatch(text: string, patterns: RegExp[]): RegExpMatchArray | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
}

/**
 * Rules run in order: explicit unpaid, then token stipends, then a concrete
 * figure or an unambiguous paid claim. Anything else is unstated, which is
 * labelled but never filtered.
 */
export function classifyPay(input: {
  descriptionText: string | null;
  requirementsText: string | null;
}): PayInfo {
  const text = [input.descriptionText, input.requirementsText].filter(Boolean).join('\n');
  if (!text.trim()) return emptyPay();

  const ambiguous = text.match(AMBIGUOUS);
  if (ambiguous) return { kind: 'unstated', evidence: clean(ambiguous[0]), amount: null };

  const unpaid = firstMatch(text, UNPAID);
  if (unpaid) return { kind: 'unpaid', evidence: clean(unpaid[0]), amount: null };

  const token = firstMatch(text, TOKEN);
  if (token) {
    const amount = toInr(token[1] ?? '');
    return {
      kind: amount < TOKEN_CEILING_INR ? 'token' : 'paid',
      evidence: clean(token[0]),
      amount: null,
    };
  }

  const money = text.match(MONEY);
  if (money?.index !== undefined) {
    const around = snippet(text, money.index, money[0].length);
    if (PAY_CONTEXT.test(around)) return { kind: 'paid', evidence: around, amount: null };
  }

  const claim = firstMatch(text, PAID_CLAIMS);
  if (claim) return { kind: 'paid', evidence: clean(claim[0]), amount: null };

  return emptyPay();
}

export function emptyPay(): PayInfo {
  return { kind: 'unstated', evidence: null, amount: null };
}

export function summarizePay(jobs: JobListing[]): Record<PayKind, number> {
  const summary: Record<PayKind, number> = { paid: 0, token: 0, unpaid: 0, unstated: 0 };
  for (const job of jobs) summary[job.pay?.kind ?? 'unstated'] += 1;
  return summary;
}
