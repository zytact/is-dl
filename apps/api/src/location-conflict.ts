import type { LocationConflict, WorkplaceClaim } from './types.ts';

const TAG_PATTERNS: Array<{ kind: WorkplaceClaim; regex: RegExp }> = [
  { kind: 'hybrid', regex: /\bhybrid\b/i },
  { kind: 'onsite', regex: /\bon[\s-]?site\b/i },
  { kind: 'remote', regex: /\bremote\b/i },
];

/** Description phrases that assert physical attendance despite a Remote tag. */
const ONSITE_CLAIMS = [
  /\bwork(?:ing)?\s+(?:from|in|at)\s+(?:the\s+)?office\b[^.\n]*/i,
  /\bwfo\b[^.\n]*/i,
  /\bin-office\s+(?:work|attendance|presence|role|position)\b[^.\n]*/i,
  /\bon[\s-]?site\b[^.\n]*/i,
  /\bin[\s-]?person\b[^.\n]*/i,
  /\b\d\s*days?\s+(?:a|per)\s+week\s+(?:from|in|at)\s+(?:the\s+)?office\b[^.\n]*/i,
  /\bthis\s+is\s+not\s+a\s+remote\b[^.\n]*/i,
];

const HYBRID_CLAIMS = [/\bhybrid\s+(?:role|model|setup|work)\b[^.\n]*/i];

function tagged(...values: Array<string | null>): WorkplaceClaim | null {
  const text = values.filter(Boolean).join(' ');
  return TAG_PATTERNS.find((pattern) => pattern.regex.test(text))?.kind ?? null;
}

function claim(text: string): { kind: WorkplaceClaim; evidence: string } | null {
  for (const regex of HYBRID_CLAIMS) {
    const match = text.match(regex);
    if (match) return { kind: 'hybrid', evidence: match[0].replace(/\s+/g, ' ').trim() };
  }
  for (const regex of ONSITE_CLAIMS) {
    const match = text.match(regex);
    if (match) return { kind: 'onsite', evidence: match[0].replace(/\s+/g, ' ').trim() };
  }
  return null;
}

/**
 * Only reported when LinkedIn tagged the job Remote and the body text says
 * otherwise. Nothing is filtered on this, it is surfaced for the reader.
 */
export function detectLocationConflict(input: {
  jobType: string | null;
  locationText: string | null;
  descriptionText: string | null;
  requirementsText: string | null;
}): LocationConflict | null {
  if (tagged(input.jobType, input.locationText) !== 'remote') return null;

  const text = [input.descriptionText, input.requirementsText].filter(Boolean).join('\n');
  const claimed = text.trim() ? claim(text) : null;
  return claimed ? { tagged: 'remote', claimed } : null;
}
