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
  outDir: string;
  debug?: boolean;
  headless?: boolean;
}
