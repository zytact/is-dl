export const JOB_SOURCES = ['linkedin', 'unstop'] as const;

export type JobSource = (typeof JOB_SOURCES)[number];

export const UNSTOP_OPPORTUNITIES = ['jobs', 'internships', 'hackathons', 'competitions'] as const;

export type UnstopOpportunity = (typeof UNSTOP_OPPORTUNITIES)[number];

/** Work function slugs Unstop actually publishes enough listings under. */
export const UNSTOP_ROLES = [
  'software-development',
  'frontend-development',
  'full-stack-development',
  'backend-development',
] as const;

export type PayKind = 'paid' | 'token' | 'unpaid' | 'unstated';

export type PayPeriod = 'monthly' | 'annually' | 'unknown';

export interface PayAmount {
  min: number | null;
  max: number | null;
  currency: string;
  period: PayPeriod;
}

export interface PayInfo {
  kind: PayKind;
  evidence: string | null;
  amount: PayAmount | null;
}

/** One board's outcome. A failure here does not fail the whole search. */
export interface SourceRun {
  source: JobSource;
  status: 'ok' | 'failed';
  count: number;
  error: string | null;
}

export const SOURCE_LABELS: Record<JobSource, string> = {
  linkedin: 'LinkedIn',
  unstop: 'Unstop',
};

export function isJobSource(value: string): value is JobSource {
  return (JOB_SOURCES as readonly string[]).includes(value);
}

export function roleLabel(slug: string): string {
  return slug.replace(/-/g, ' ');
}
