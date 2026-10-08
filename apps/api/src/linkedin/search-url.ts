import type { LinkedInOptions, SearchQuery } from '../types.ts';

const EXPERIENCE_LEVELS = [
  'internship',
  'entry level',
  'associate',
  'mid-senior level',
  'director',
  'executive',
];

const JOB_TYPES = ['full-time', 'part-time', 'contract', 'temporary', 'volunteer', 'internship'];

const POSTED_WITHIN: Record<string, string> = {
  'past 24 hours': 'r86400',
  'past week': 'r604800',
  'past month': 'r2592000',
};

function knownFilters(values: string[] | undefined, names: string[]): string[] {
  return (values ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter((value) => names.includes(value));
}

/**
 * LinkedIn's search reads location, workplace, experience level and job type
 * from the query text and drops the old `location`, `f_WT`, `f_E`, `f_JT` and
 * `sortBy` parameters, so the filters become phrases. Without a location in
 * the text it falls back to the account's last searched location.
 */
export function searchKeywords(query: SearchQuery, options: LinkedInOptions): string {
  const phrases = new Set([
    query.keywords.trim(),
    ...knownFilters(options.experienceLevel, EXPERIENCE_LEVELS),
    ...knownFilters(options.jobType, JOB_TYPES),
  ]);
  if (query.remoteOnly) phrases.add('remote');
  if (query.location.trim()) phrases.add(`in ${query.location.trim()}`);
  phrases.delete('');
  return [...phrases].join(', ');
}

export function buildSearchUrl(query: SearchQuery, options: LinkedInOptions): string {
  const params = new URLSearchParams({ keywords: searchKeywords(query, options) });

  const posted = POSTED_WITHIN[options.postedWithin?.trim().toLowerCase() ?? ''];
  if (posted) params.set('f_TPR', posted);

  return `https://www.linkedin.com/jobs/search-results/?${params.toString()}`;
}
