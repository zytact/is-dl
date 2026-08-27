import { linkedinSource } from './linkedin/source.ts';
import { runSources, type SourceRunner } from './sources.ts';
import type {
  JobSource,
  LinkedInOptions,
  ScraperOutput,
  SearchMeta,
  SearchQuery,
  UnstopOptions,
} from './types.ts';
import { unstopSource } from './unstop/source.ts';

export interface ScrapeRequest {
  query: SearchQuery;
  sources: JobSource[];
  linkedin: LinkedInOptions;
  unstop: UnstopOptions;
}

function buildRunner(source: JobSource, request: ScrapeRequest): SourceRunner {
  return source === 'linkedin' ? linkedinSource(request.linkedin) : unstopSource(request.unstop);
}

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
  const runners = request.sources.map((source) => buildRunner(source, request));
  return runSources(request.query, runners, { filters: metaFilters(request), onLog, signal });
}
