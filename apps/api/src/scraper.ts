import { linkedinSource } from './linkedin/source.ts';
import { runSources, type SourceRunner } from './sources.ts';
import type {
  JobSource,
  LinkedInOptions,
  ScraperOutput,
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

export function runScraper(
  request: ScrapeRequest,
  onLog: (msg: string) => void = console.error,
  signal?: AbortSignal,
): Promise<ScraperOutput> {
  const runners = request.sources.map((source) => buildRunner(source, request));
  return runSources(request.query, runners, onLog, signal);
}
