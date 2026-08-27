import type { LinkedInOptions, SearchQuery } from '../types.ts';

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
      Internship: '1',
      'Entry level': '2',
      Associate: '3',
      'Mid-Senior level': '4',
      Director: '5',
      Executive: '6',
    };

    const codes = options.experienceLevel.map((level) => experienceLevelMap[level]).filter(Boolean);

    if (codes.length > 0) {
      params.set('f_E', codes.join(','));
    }
  }

  // Filter: Job type
  if (options.jobType && options.jobType.length > 0) {
    const jobTypeMap: Record<string, string> = {
      'Full-time': 'F',
      'Part-time': 'P',
      Contract: 'C',
      Temporary: 'T',
      Volunteer: 'V',
      Internship: 'I',
      Other: 'O',
    };

    const codes = options.jobType.map((type) => jobTypeMap[type]).filter(Boolean);

    if (codes.length > 0) {
      params.set('f_JT', codes.join(','));
    }
  }

  // Filter: Posted within
  if (options.postedWithin) {
    const postedWithinMap: Record<string, string> = {
      'Past 24 hours': 'r86400',
      'Past week': 'r604800',
      'Past month': 'r2592000',
    };

    const code = postedWithinMap[options.postedWithin];
    if (code) {
      params.set('f_TPR', code);
    }
  }

  // Sort by most recent
  params.set('sortBy', 'DD');

  return `${baseUrl}?${params.toString()}`;
}
