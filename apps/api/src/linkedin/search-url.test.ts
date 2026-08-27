import { describe, expect, test } from 'vite-plus/test';
import type { LinkedInOptions, SearchQuery } from '../types.ts';
import { buildSearchUrl } from './search-url.ts';

const query: SearchQuery = {
  keywords: 'developer',
  location: '',
  limit: 1,
  remoteOnly: true,
};

function searchParams(options: Partial<LinkedInOptions>): URLSearchParams {
  const url = buildSearchUrl(query, {
    sessionFile: 'session.json',
    debugDir: 'cache',
    timeout: 30_000,
    ...options,
  });
  return new URL(url).searchParams;
}

describe('buildSearchUrl', () => {
  test('normalizes job type names before applying them', () => {
    const params = searchParams({ jobType: ['internship', 'FULL-TIME'] });

    expect(params.get('f_JT')).toBe('I,F');
    expect(params.get('f_WT')).toBe('2');
  });

  test('keeps job type and experience level as separate filters', () => {
    const params = searchParams({
      jobType: ['Internship'],
      experienceLevel: ['internship'],
    });

    expect(params.get('f_JT')).toBe('I');
    expect(params.get('f_E')).toBe('1');
  });
});
