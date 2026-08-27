import { checkAbort, type SourceContext, type SourceRunner, waitOrAbort } from '../sources.ts';
import type { JobListing, SearchQuery, UnstopOptions } from '../types.ts';
import { fetchPage, type UnstopItem } from './api.ts';
import { toJobListing } from './map.ts';

/**
 * `searchTerm` on the endpoint matches titles only and returns nothing for most
 * tech terms, so keywords are matched here instead, against the title, skills
 * and the full description Unstop already ships with every row.
 */
function matchesKeywords(job: JobListing, keywords: string): boolean {
  const tokens = keywords.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = [job.title, job.requirementsText, job.descriptionText]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

function matchesLocation(job: JobListing, location: string): boolean {
  if (!location.trim()) return true;
  return (job.locationText ?? '').toLowerCase().includes(location.trim().toLowerCase());
}

function matches(job: JobListing, query: SearchQuery): boolean {
  if (query.remoteOnly && !/\bremote\b/i.test(job.jobType ?? '')) return false;
  return matchesKeywords(job, query.keywords) && matchesLocation(job, query.location);
}

async function scrape(
  query: SearchQuery,
  options: UnstopOptions,
  { onLog, signal }: SourceContext,
): Promise<JobListing[]> {
  onLog(`Opportunity: ${options.opportunity}`);
  if (options.roles?.length) onLog(`Roles: ${options.roles.join(', ')}`);

  const seen = new Set<number>();
  const items: UnstopItem[] = [];
  let page = 1;
  let lastPage = 1;
  let total = 0;

  while (page <= lastPage) {
    checkAbort(signal);
    const result = await fetchPage(options, page, signal);
    lastPage = result.lastPage;
    total = result.total;

    for (const item of result.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }

    onLog(`Page ${page}/${lastPage}: ${seen.size} unique of ${total} reported.`);
    if (seen.size >= query.limit || page >= lastPage) break;
    page++;
    // Rate limiting: the endpoint is public and unauthenticated, so be polite.
    await waitOrAbort(signal, 1000 + Math.random() * 2000);
  }

  // Offset pagination on this endpoint repeats and skips rows across the full
  // corpus. Say so rather than implying the whole set was seen.
  if (page >= lastPage && seen.size < total) {
    onLog(`WARNING: walked every page but saw ${seen.size} unique of ${total} reported.`);
  }

  const jobs = items.map((item) => toJobListing(item));
  const kept = jobs.filter((job) => matches(job, query)).slice(0, query.limit);
  onLog(`Kept ${kept.length} of ${jobs.length} after keyword and location filters.`);
  return kept;
}

export function unstopSource(options: UnstopOptions): SourceRunner {
  return {
    source: 'unstop',
    run: (query, ctx) => scrape(query, options, ctx),
  };
}
