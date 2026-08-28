/**
 * The board contracts come from the CLI, which owns them. Only the browser-side
 * presentation of those contracts lives here.
 */
export {
  isJobSource,
  JOB_SOURCES,
  type JobSource,
  type PayAmount,
  type PayInfo,
  type PayKind,
  type PayPeriod,
  type SourceRun,
  UNSTOP_OPPORTUNITIES,
  type UnstopOpportunity,
} from '../../api/src/types.ts';
import type { JobSource } from '../../api/src/types.ts';

/** Work function slugs Unstop actually publishes enough listings under. */
export const UNSTOP_ROLES = [
  'software-development',
  'frontend-development',
  'full-stack-development',
  'backend-development',
] as const;

export const SOURCE_LABELS: Record<JobSource, string> = {
  linkedin: 'LinkedIn',
  unstop: 'Unstop',
};

export function roleLabel(slug: string): string {
  return slug.replace(/-/g, ' ');
}
