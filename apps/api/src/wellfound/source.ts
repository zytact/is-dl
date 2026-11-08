import { blockedSummary } from '../blocklist.ts';
import {
  checkAbort,
  sameJobType,
  type SourceContext,
  type SourceRunner,
  waitOrAbort,
} from '../sources.ts';
import type { JobListing, SearchQuery, WellfoundOptions } from '../types.ts';
import { fetchSearchPage, type Place, type WfListing } from './api.ts';
import { toJobListing } from './map.ts';

/** Wellfound guards its site with Cloudflare, so a search reads at most this many pages per role. */
export const MAX_PAGES = 3;

/** `--location` picks Wellfound's own page for that place, so "India" reads /role/l/<role>/india. */
export function placeFor(query: SearchQuery): Place {
  const slug = query.location
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug === 'remote' || (!slug && query.remoteOnly)) return { kind: 'remote' };
  return slug ? { kind: 'location', slug } : { kind: 'everywhere' };
}

/**
 * Every check reads a field the listing publishes. The location page already
 * picked the place, and keywords are not matched: the role page is the category.
 */
function matches(listing: WfListing, query: SearchQuery, options: WellfoundOptions): boolean {
  if (query.remoteOnly && !listing.remote) return false;
  const type = listing.jobType ?? '';
  if (options.jobType?.length && !options.jobType.some((wanted) => sameJobType(wanted, type))) {
    return false;
  }
  if (options.maxExperience === undefined) return true;
  return (listing.yearsExperienceMin ?? 0) <= options.maxExperience;
}

async function scrape(
  query: SearchQuery,
  options: WellfoundOptions,
  { onLog, signal }: SourceContext,
): Promise<JobListing[]> {
  const place = placeFor(query);
  onLog(`Roles: ${options.roles.join(', ')}`);
  onLog(`Place: ${place.kind === 'location' ? place.slug : place.kind}`);
  onLog('Keywords are not matched here. The roles pick the category.');

  const kept: JobListing[] = [];
  const read = new Set<string>();
  let known = 0;
  const blocked: string[] = [];
  let requests = 0;

  for (const role of options.roles) {
    for (let page = 1, pageCount = 1; page <= Math.min(pageCount, MAX_PAGES); page++) {
      if (kept.length >= query.limit) break;
      checkAbort(signal);
      if (requests++) await waitOrAbort(signal, 1000 + Math.random() * 1000);
      const result = await fetchSearchPage(role, place, page, signal);
      pageCount = result.pageCount;
      onLog(`${role} page ${page} of ${pageCount}: ${result.listings.length} listings.`);

      for (const listing of result.listings) {
        if (kept.length >= query.limit) break;
        if (read.has(listing.id)) continue;
        read.add(listing.id);
        if (query.known?.has('wellfound', listing.id)) {
          known++;
          continue;
        }
        if (listing.companyName && query.blocked?.has(listing.companyName)) {
          blocked.push(listing.companyName);
          continue;
        }
        if (matches(listing, query, options)) kept.push(toJobListing(listing));
      }
    }
  }

  onLog(`Kept ${kept.length} of ${read.size} listings read.`);
  if (known) onLog(`Skipped ${known} already seen or applied to.`);
  if (blocked.length) onLog(blockedSummary(blocked));
  return kept;
}

export function wellfoundSource(options: WellfoundOptions): SourceRunner {
  return {
    source: 'wellfound',
    run: (query, ctx) => scrape(query, options, ctx),
  };
}
