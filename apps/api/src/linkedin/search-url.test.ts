import { describe, expect, test } from 'vite-plus/test';
import type { LinkedInOptions, SearchQuery } from '../types.ts';
import { buildSearchUrl } from './search-url.ts';

const query: SearchQuery = {
  keywords: 'developer',
  location: '',
  limit: 1,
  remoteOnly: true,
};

function searchParams(
  options: Partial<LinkedInOptions>,
  overrides: Partial<SearchQuery> = {},
): URLSearchParams {
  const url = buildSearchUrl(
    { ...query, ...overrides },
    { sessionFile: 'session.json', debugDir: 'cache', timeout: 30_000, ...options },
  );
  return new URL(url).searchParams;
}

describe('buildSearchUrl', () => {
  test('writes known filters into the query text and drops unknown ones', () => {
    const params = searchParams(
      { experienceLevel: ['Internship', 'guru'], jobType: ['internship', 'FULL-TIME'] },
      { location: ' Berlin, Germany ' },
    );

    expect(params.get('keywords')).toBe(
      'developer, internship, full-time, remote, in Berlin, Germany',
    );
  });

  test('keeps the posting age as a URL filter', () => {
    const params = searchParams({ postedWithin: 'Past Week' }, { remoteOnly: false });

    expect(params.get('keywords')).toBe('developer');
    expect(params.get('f_TPR')).toBe('r604800');
  });
});
