import type { LinkedInOptions, SearchQuery } from '../types.ts';

function filterCodes(values: string[], codes: Record<string, string>): string[] {
  return values
    .map((value) => codes[value.trim().toLowerCase()])
    .filter((code): code is string => code !== undefined);
}

export function buildSearchUrl(query: SearchQuery, options: LinkedInOptions): string {
  const baseUrl = 'https://www.linkedin.com/jobs/search/';
  const params = new URLSearchParams();

  // Keywords
  if (query.keywords) {
    params.set('keywords', query.keywords);
  }

  // Location (can be remote, country, city, etc.)
  if (query.location) {
    params.set('location', query.location);
  }

  // Filter: Remote only
  if (query.remoteOnly) {
    params.set('f_WT', '2'); // 2 = Remote
  }

  // Filter: Experience level
  if (options.experienceLevel && options.experienceLevel.length > 0) {
    const experienceLevelMap: Record<string, string> = {
      internship: '1',
      'entry level': '2',
      associate: '3',
      'mid-senior level': '4',
      director: '5',
      executive: '6',
    };

    const codes = filterCodes(options.experienceLevel, experienceLevelMap);

    if (codes.length > 0) {
      params.set('f_E', codes.join(','));
    }
  }

  // Filter: Job type
  if (options.jobType && options.jobType.length > 0) {
    const jobTypeMap: Record<string, string> = {
      'full-time': 'F',
      'part-time': 'P',
      contract: 'C',
      temporary: 'T',
      volunteer: 'V',
      internship: 'I',
      other: 'O',
    };

    const codes = filterCodes(options.jobType, jobTypeMap);

    if (codes.length > 0) {
      params.set('f_JT', codes.join(','));
    }
  }

  // Filter: Posted within
  if (options.postedWithin) {
    const postedWithinMap: Record<string, string> = {
      'past 24 hours': 'r86400',
      'past week': 'r604800',
      'past month': 'r2592000',
    };

    const code = postedWithinMap[options.postedWithin.trim().toLowerCase()];
    if (code) {
      params.set('f_TPR', code);
    }
  }

  // Sort by most recent
  params.set('sortBy', 'DD');

  return `${baseUrl}?${params.toString()}`;
}
