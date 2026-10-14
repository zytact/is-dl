import { linkedinSource } from './linkedin/source.ts';
import { runSources, type SourceRunner } from './sources.ts';
import type {
  JobSource,
  LinkedInOptions,
  ScraperOutput,
  SearchMeta,
  SearchQuery,
  UnstopOptions,
  YcombinatorOptions,
} from './types.ts';
import { unstopSource } from './unstop/source.ts';
import { ycombinatorSource } from './ycombinator/source.ts';

export interface ScrapeRequest {
  query: SearchQuery;
  sources: JobSource[];
  linkedin: LinkedInOptions;
  unstop: UnstopOptions;
  ycombinator: YcombinatorOptions;
}

const RUNNERS: Record<JobSource, (request: ScrapeRequest) => SourceRunner> = {
  linkedin: (request) => linkedinSource(request.linkedin),
  unstop: (request) => unstopSource(request.unstop),
  ycombinator: (request) => ycombinatorSource(request.ycombinator),
};

/** The run file records what was asked for, wherever the request kept it. */
function metaFilters(request: ScrapeRequest): SearchMeta['filters'] {
  return {
    experienceLevel: request.linkedin.experienceLevel,
    remoteOnly: request.query.remoteOnly,
    postedWithin: request.linkedin.postedWithin,
    jobType: request.linkedin.jobType,
  };
}

export function runScraper(
  request: ScrapeRequest,
  onLog: (msg: string) => void = console.error,
  signal?: AbortSignal,
): Promise<ScraperOutput> {
  const runners = request.sources.map((source) => RUNNERS[source](request));
  return runSources(request.query, runners, { filters: metaFilters(request), onLog, signal });
}
