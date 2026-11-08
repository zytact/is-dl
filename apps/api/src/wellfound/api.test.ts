import { afterEach, describe, expect, test, vi } from 'vite-plus/test';
import { fetchSearchPage, parseSearchPage, searchPageUrl } from './api.ts';

const URL = 'https://wellfound.com/role/l/software-engineer/india';

/** A search page as Wellfound renders it: the Apollo cache inside `__NEXT_DATA__`. */
function page(state: Record<string, unknown>): string {
  const data = { props: { pageProps: { apolloState: { data: state } } } };
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
}

function results(startups: string[], pageCount = 4) {
  return {
    ROOT_QUERY: {
      talent: {
        'seoLandingPageJobSearchResults({"location":"india","page":1,"role":"software-engineer"})':
          {
            pageCount,
            startups: startups.map((id) => ({ __ref: `StartupResult:${id}` })),
          },
      },
    },
  };
}

describe('search page', () => {
  test('reads each startup with its listings', () => {
    const parsed = parseSearchPage(
      page({
        ...results(['9']),
        'StartupResult:9': {
          name: 'Fuze',
          slug: 'fuzehq',
          highConcept: 'Digital assets',
          highlightedJobListings: [{ __ref: 'JobListingSearchResult:1' }],
        },
        'JobListingSearchResult:1': {
          id: '1',
          slug: 'software-engineer',
          title: 'Software Engineer',
          locationNames: ['Bengaluru', 'Dubai', 'Bengaluru'],
          remote: true,
          yearsExperienceMin: 2,
          liveStartAt: 1793169764,
        },
      }),
      URL,
    );

    expect(parsed.pageCount).toBe(4);
    expect(parsed.listings).toMatchObject([
      {
        id: '1',
        slug: 'software-engineer',
        locationNames: ['Bengaluru', 'Dubai'],
        remote: true,
        yearsExperienceMin: 2,
        yearsExperienceMax: null,
        companyName: 'Fuze',
        companySlug: 'fuzehq',
        companyConcept: 'Digital assets',
      },
    ]);
  });

  test.each([
    ['<html>Sign in</html>', '"__NEXT_DATA__" script'],
    ['<script id="__NEXT_DATA__">{oops</script>', 'readable JSON in "__NEXT_DATA__"'],
    [page({ ROOT_QUERY: { talent: {} } }), 'job search results'],
    [page(results(['9'])), 'startup behind every result'],
    [
      page({
        ...results(['9']),
        'StartupResult:9': { highlightedJobListings: [{ __ref: 'JobListingSearchResult:1' }] },
        'JobListingSearchResult:1': { id: '1', slug: '../../x' },
      }),
      '"id" and "slug" on every listing',
    ],
  ])('names what is missing when the page format changes', (html, missing) => {
    expect(() => parseSearchPage(html, URL)).toThrow(
      `Wellfound's page at ${URL} has no ${missing}. Wellfound may have changed its page format.`,
    );
  });

  test('a Cloudflare challenge reads as a block, not a format change', () => {
    expect(() => parseSearchPage('<title>Just a moment...</title>', URL)).toThrow(
      'Wellfound blocked the request',
    );
  });

  test('the place picks the page', () => {
    expect(searchPageUrl('software-engineer', { kind: 'location', slug: 'india' }, 1)).toBe(URL);
    expect(searchPageUrl('designer', { kind: 'remote' }, 2)).toBe(
      'https://wellfound.com/role/r/designer?page=2',
    );
    expect(searchPageUrl('designer', { kind: 'everywhere' }, 1)).toBe(
      'https://wellfound.com/role/designer',
    );
  });
});

describe('fetching', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respond(status: number, headers: Record<string, string> = {}) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status, headers })),
    );
  }

  test('an unknown role or place fails instead of following the redirect', async () => {
    respond(303, { location: 'https://wellfound.com/role/software-engineer' });
    await expect(
      fetchSearchPage('software-engineer', { kind: 'location', slug: 'atlantis' }, 1),
    ).rejects.toThrow('it redirects to https://wellfound.com/role/software-engineer');
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  test.each([[403], [429]])('HTTP %i is a block', async (status) => {
    respond(status);
    await expect(fetchSearchPage('software-engineer', { kind: 'remote' }, 1)).rejects.toThrow(
      `Wellfound blocked the request for https://wellfound.com/role/r/software-engineer (HTTP ${status})`,
    );
  });
});
