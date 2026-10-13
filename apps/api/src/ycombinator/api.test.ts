import { describe, expect, test } from 'vite-plus/test';
import { parseListingPage, parseRolePage, rolePageUrl } from './api.ts';

const URL = 'https://www.ycombinator.com/jobs/role/software-engineer';

/** The attribute as the server writes it: JSON with its quotes and ampersands escaped. */
function page(props: unknown): string {
  const json = JSON.stringify({ component: 'WaasJobListingsPage', props })
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
  return `<html><body><div id="app" data-page="${json}"></div></body></html>`;
}

describe('role page', () => {
  test('reads the listings out of data-page', () => {
    const postings = parseRolePage(
      page({ jobPostings: [{ id: 116081, url: '/companies/a/jobs/x', title: 'R&D "Lead"' }] }),
      URL,
    );
    expect(postings).toMatchObject([
      { id: 116081, url: '/companies/a/jobs/x', title: 'R&D "Lead"', skills: [], visa: null },
    ]);
  });

  test('remote-only searches read the role page for remote listings', () => {
    expect(rolePageUrl('designer', false)).toBe('https://www.ycombinator.com/jobs/role/designer');
    expect(rolePageUrl('designer', true)).toBe(
      'https://www.ycombinator.com/jobs/role/designer/remote',
    );
  });

  test.each([
    ['<html><body>Sign in</body></html>', '"data-page" attribute'],
    ['<div data-page="{not json"></div>', 'readable JSON in "data-page"'],
    [page({ jobs: [] }), '"jobPostings" list'],
    [page({ jobPostings: [{ title: 'No id' }] }), '"id" and "url" on every listing'],
    [page({ jobPostings: [{ id: 1, url: '@evil.example/x' }] }), '"id" and "url" on every listing'],
  ])('names what is missing when the page format changes', (html, missing) => {
    expect(() => parseRolePage(html, URL)).toThrow(
      `Y Combinator's page at ${URL} has no ${missing}. Y Combinator may have changed its page format.`,
    );
  });

  test('a field of the wrong type is read as missing', () => {
    const [posting] = parseRolePage(
      page({
        jobPostings: [
          { id: 1, url: '/x', skills: 'Python', salaryRange: 150000, applyUrl: 'javascript:x' },
        ],
      }),
      URL,
    );
    expect(posting).toMatchObject({ skills: [], salaryRange: null, applyUrl: null });
  });
});

describe('listing page', () => {
  test('returns the description', () => {
    expect(
      parseListingPage(page({ job: { id: 1, description: '### Overview\n\nBuild.\n' } }), URL),
    ).toBe('### Overview\n\nBuild.');
  });

  test('a listing without a description is not a format change', () => {
    expect(parseListingPage(page({ job: { id: 1 } }), URL)).toBeNull();
    expect(() => parseListingPage(page({}), URL)).toThrow('has no "job" object');
  });
});
