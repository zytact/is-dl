import { blockedSummary } from '../blocklist.ts';
import { checkAbort, type SourceContext, type SourceRunner, waitOrAbort } from '../sources.ts';
import type { JobListing, SearchQuery, YcombinatorOptions } from '../types.ts';
import { fetchDescription, fetchRolePage, type YcPosting } from './api.ts';
import { locationSearchText, minExperienceYears, toJobListing } from './map.ts';

/** After this many listing pages fail in a row, the rest keep a null description. */
const MAX_DESCRIPTION_FAILURES = 3;

function sameType(a: string, b: string): boolean {
  const plain = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '');
  return plain(a) === plain(b);
}

/**
 * Every check reads a field the listing publishes. Keywords are not matched:
 * the role page is the category, and the description only arrives with a
 * second request per listing.
 */
function matches(posting: YcPosting, query: SearchQuery, options: YcombinatorOptions): boolean {
  const location = posting.location ?? '';
  if (query.remoteOnly && !/\bremote\b/i.test(location)) return false;
  if (!locationSearchText(location).includes(query.location.trim().toLowerCase())) return false;

  const type = posting.type ?? '';
  if (options.jobType?.length && !options.jobType.some((wanted) => sameType(wanted, type))) {
    return false;
  }
  if (options.skipUsOnly && /\bonly\b/i.test(posting.visa ?? '')) return false;
  if (options.maxExperience === undefined) return true;
  return (minExperienceYears(posting.minExperience) ?? 0) <= options.maxExperience;
}

async function scrape(
  query: SearchQuery,
  options: YcombinatorOptions,
  { onLog, signal }: SourceContext,
): Promise<JobListing[]> {
  onLog(`Roles: ${options.roles.join(', ')}`);
  onLog('Keywords are not matched here. The roles pick the category.');

  const postings = new Map<number, YcPosting>();
  for (const [index, role] of options.roles.entries()) {
    checkAbort(signal);
    if (index) await waitOrAbort(signal, 500 + Math.random() * 1000);
    const page = await fetchRolePage(role, query.remoteOnly ?? false, signal);
    for (const posting of page) if (!postings.has(posting.id)) postings.set(posting.id, posting);
    onLog(`${role}: ${page.length} listings.`);
  }

  const kept: JobListing[] = [];
  let known = 0;
  let failures = 0;
  const blocked: string[] = [];

  for (const posting of postings.values()) {
    if (kept.length >= query.limit) break;
    if (query.known?.has('ycombinator', String(posting.id))) {
      known++;
      continue;
    }
    if (posting.companyName && query.blocked?.has(posting.companyName)) {
      blocked.push(posting.companyName);
      continue;
    }
    if (!matches(posting, query, options)) continue;

    // Only a listing that is being kept costs a second request.
    let description: string | null = null;
    if (failures < MAX_DESCRIPTION_FAILURES) {
      await waitOrAbort(signal, 500 + Math.random() * 1000);
      try {
        description = await fetchDescription(posting, signal);
        failures = 0;
      } catch (error) {
        checkAbort(signal);
        failures++;
        const reason = error instanceof Error ? error.message : String(error);
        onLog(`WARNING: no description for listing ${posting.id}: ${reason}`);
        if (failures === MAX_DESCRIPTION_FAILURES) {
          onLog('WARNING: listing pages keep failing, so the rest get no description.');
        }
      }
    }
    kept.push(toJobListing(posting, description));
  }

  onLog(`Kept ${kept.length} of ${postings.size} listings.`);
  if (known) onLog(`Skipped ${known} already seen or applied to.`);
  if (blocked.length) onLog(blockedSummary(blocked));
  return kept;
}

export function ycombinatorSource(options: YcombinatorOptions): SourceRunner {
  return {
    source: 'ycombinator',
    run: (query, ctx) => scrape(query, options, ctx),
  };
}
