export type AiAgentConfidence = 'high' | 'medium' | 'low';

export type AiAgentRequirementStrength = 'required' | 'preferred' | 'mentioned';

export type AiAgentSignalCategory =
  | 'tool'
  | 'agentic_workflow'
  | 'llm_dev_workflow'
  | 'prompting_for_code'
  | 'generic_ai_tooling';

export type AiAgentSignalSource = 'title' | 'requirements' | 'description';

export interface AiAgentSnippet {
  source: AiAgentSignalSource;
  text: string;
}

export interface AiAgentSignals {
  detected: boolean;
  confidence: AiAgentConfidence | null;
  requirementStrength: AiAgentRequirementStrength | null;
  tools: string[];
  categories: AiAgentSignalCategory[];
  snippets: AiAgentSnippet[];
}

export interface AiAgentSummary {
  detectedCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

export type PayKind = 'paid' | 'token' | 'unpaid' | 'unstated';

export type PayPeriod = 'monthly' | 'annually' | 'unknown';

/** Figures a source published as data, never numbers parsed out of prose. */
export interface PayAmount {
  min: number | null;
  max: number | null;
  currency: string;
  period: PayPeriod;
}

export interface PayInfo {
  kind: PayKind;
  /** The exact snippet the classification came from, so a human can spot-check it. */
  evidence: string | null;
  /** Null when the source only offered prose, or withheld the figures. */
  amount: PayAmount | null;
}

export type WorkplaceClaim = 'remote' | 'onsite' | 'hybrid';

export interface LocationConflict {
  /** What the source's own workplace tag or field says. */
  tagged: WorkplaceClaim;
  /** What the description text asserts, with the snippet that asserts it. */
  claimed: { kind: WorkplaceClaim; evidence: string };
}

export const JOB_SOURCES = ['linkedin', 'unstop'] as const;

export type JobSource = (typeof JOB_SOURCES)[number];

export function isJobSource(value: string): value is JobSource {
  return (JOB_SOURCES as readonly string[]).includes(value);
}

export interface JobListing {
  source: JobSource;
  jobId: string | null;
  jobUrl: string;
  title: string | null;
  companyName: string | null;
  companyUrl: string | null;
  locationText: string | null;
  postedAtText: string | null; // "3 days ago"
  postedAtIso: string | null; // best-effort ISO timestamp
  jobType: string | null; // From job details preferences
  alumniCount: string | null; // "X alumni work here", LinkedIn only
  descriptionText: string | null;
  requirementsText: string | null;
  aiAgentSignals: AiAgentSignals;
  pay: PayInfo;
  locationConflict: LocationConflict | null;
}

/** One source's outcome. A failure here does not fail the whole search. */
export interface SourceRun {
  source: JobSource;
  status: 'ok' | 'failed';
  count: number;
  /** The failure message, null when the source succeeded. */
  error: string | null;
}

export interface SearchMeta {
  query: string;
  location: string;
  filters: {
    experienceLevel?: string[];
    remoteOnly?: boolean;
    postedWithin?: string;
    jobType?: string[];
  };
  scrapedAt: string;
  /** Comma-joined names of the sources that returned jobs. */
  source: string;
  sources: SourceRun[];
  count: number;
  aiAgentSummary: AiAgentSummary;
  paySummary: Record<PayKind, number>;
}

export interface ScraperOutput {
  meta: SearchMeta;
  jobs: JobListing[];
}

export interface PersistedMeta extends Omit<SearchMeta, 'sources'> {
  /**
   * Null in run files written before per-source outcomes were recorded. Nothing
   * can reconstruct them afterwards: the file never knew which sources ran.
   */
  sources: SourceRun[] | null;
}

/** A run file as it is on disk, which is not always what the current code writes. */
export interface PersistedRun {
  meta: PersistedMeta;
  jobs: JobListing[];
}

/**
 * Whether a job is one the reader is done with: surfaced by an earlier run, or
 * already in the application log. Sources consult this while paging, so
 * `--limit` counts jobs worth reading instead of counting rows and then
 * dropping most of them.
 */
export interface KnownJobs {
  has(source: JobSource, jobId: string): boolean;
}

/** What every source is asked for. Nothing source-specific belongs here. */
export interface SearchQuery {
  keywords: string;
  location: string;
  /** Per source, not across all of them, and counted in jobs `known` let through. */
  limit: number;
  remoteOnly?: boolean;
  /**
   * Jobs the reader has already been shown or already applied to. A source
   * skips these while paging so `--limit` still yields that many jobs worth
   * reading. Absent means filter nothing.
   */
  known?: KnownJobs;
}

/**
 * Playwright, a stored session and the search-URL filters, all needed by
 * LinkedIn and nothing else. `experienceLevel`, `postedWithin` and `jobType`
 * are LinkedIn's own taxonomy and become `f_E`, `f_TPR` and `f_JT`.
 */
export interface LinkedInOptions {
  debug?: boolean;
  headless?: boolean;
  timeout: number;
  sessionFile: string;
  /** Where debug screenshots land. Never the current working directory. */
  debugDir: string;
  experienceLevel?: string[];
  postedWithin?: string;
  jobType?: string[];
}

export const UNSTOP_OPPORTUNITIES = ['jobs', 'internships', 'hackathons', 'competitions'] as const;

export type UnstopOpportunity = (typeof UNSTOP_OPPORTUNITIES)[number];

export function isUnstopOpportunity(value: string): value is UnstopOpportunity {
  return (UNSTOP_OPPORTUNITIES as readonly string[]).includes(value);
}

/** Plain HTTP against a public endpoint. No browser, no session. */
export interface UnstopOptions {
  opportunity: UnstopOpportunity;
  /** Work function slugs, for example "software-development". */
  roles?: string[];
}
