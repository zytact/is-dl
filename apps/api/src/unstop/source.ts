import { checkAbort, type SourceContext, type SourceRunner, waitOrAbort } from '../sources.ts';
import type { JobListing, SearchQuery, UnstopOptions } from '../types.ts';
import { fetchPage } from './api.ts';
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

  const fetched = new Set<number>();
  const kept: JobListing[] = [];
  let page = 1;
  let lastPage = 1;
  let total = 0;
  let known = 0;

  // The filters run here, not on the endpoint, so paging has to continue until
  // enough rows have passed them. Counting fetched rows stops on page one and
  // never sees the matches further in.
  while (page <= lastPage) {
    checkAbort(signal);
    const result = await fetchPage(options, page, signal);
    lastPage = result.lastPage;
    total = result.total;

    for (const item of result.items) {
      if (kept.length >= query.limit) break;
      if (fetched.has(item.id)) continue;
      fetched.add(item.id);
      // Ahead of `toJobListing`, which decodes the whole description and runs
      // the pay, location and AI-agent classifiers. A row the reader is done
      // with is worth none of that, and it never counted against the limit
      // anyway, so asking for 25 jobs still pages past it.
      if (query.known?.has('unstop', String(item.id))) {
        known++;
        continue;
      }
      const job = toJobListing(item);
      if (!matches(job, query)) continue;
      kept.push(job);
    }

    onLog(
      `Page ${page}/${lastPage}: ${fetched.size} unique of ${total} fetched, ${kept.length} kept.`,
    );
    if (kept.length >= query.limit || page >= lastPage) break;
    page++;
    // Rate limiting: the endpoint is public and unauthenticated, so be polite.
    await waitOrAbort(signal, 1000 + Math.random() * 2000);
  }

  // Offset pagination on this endpoint repeats and skips rows across the full
  // corpus. Say so rather than implying the whole set was seen.
  if (page >= lastPage && kept.length < query.limit && fetched.size < total) {
    onLog(`WARNING: walked every page but saw ${fetched.size} unique of ${total} reported.`);
  }

  const jobs = kept.slice(0, query.limit);
  onLog(`Kept ${jobs.length} of ${fetched.size} fetched after keyword and location filters.`);
  if (known) onLog(`Skipped ${known} already seen or applied to.`);
  return jobs;
}

export function unstopSource(options: UnstopOptions): SourceRunner {
  return {
    source: 'unstop',
    run: (query, ctx) => scrape(query, options, ctx),
  };
}
