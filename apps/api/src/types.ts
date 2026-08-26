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

export interface PayInfo {
  kind: PayKind;
  /** The exact snippet the classification came from, so a human can spot-check it. */
  evidence: string | null;
}

export type WorkplaceClaim = 'remote' | 'onsite' | 'hybrid';

export interface LocationConflict {
  /** What the LinkedIn workplace tag says. */
  tagged: WorkplaceClaim;
  /** What the description text asserts, with the snippet that asserts it. */
  claimed: { kind: WorkplaceClaim; evidence: string };
}

export interface JobListing {
  jobId: string | null;
  jobUrl: string;
  title: string | null;
  companyName: string | null;
  companyUrl: string | null;
  locationText: string | null;
  postedAtText: string | null; // "3 days ago"
  postedAtIso: string | null; // best-effort ISO timestamp
  jobType: string | null; // From job details preferences
  alumniCount: string | null; // "X alumni work here"
  descriptionText: string | null;
  requirementsText: string | null;
  aiAgentSignals: AiAgentSignals;
  pay: PayInfo;
  locationConflict: LocationConflict | null;
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
  source: string;
  count: number;
  aiAgentSummary: AiAgentSummary;
  paySummary: Record<PayKind, number>;
}

export interface ScraperOutput {
  meta: SearchMeta;
  jobs: JobListing[];
}

export interface SearchOptions {
  keywords: string;
  location: string;
  limit: number;
  experienceLevel?: string[];
  remoteOnly?: boolean;
  postedWithin?: string;
  jobType?: string[];
  debug?: boolean;
  headless?: boolean;
  timeout: number;
  sessionFile: string;
  /** Where debug screenshots land. Never the current working directory. */
  debugDir: string;
}
