import { describe, expect, test } from 'vite-plus/test';
import { linkedinJobUrl, parseTopCardMeta } from './job.ts';

describe('linkedinJobUrl', () => {
  test('builds a stable permalink when the search URL has a job id', () => {
    expect(
      linkedinJobUrl('https://www.linkedin.com/jobs/search/?currentJobId=4457951321&f_JT=I&f_WT=2'),
    ).toBe('https://www.linkedin.com/jobs/view/4457951321/');
  });

  test('keeps the current URL when LinkedIn provides no job id', () => {
    const currentUrl = 'https://www.linkedin.com/jobs/search/?keywords=developer';
    expect(linkedinJobUrl(currentUrl)).toBe(currentUrl);
  });
});

describe('parseTopCardMeta', () => {
  test('reads the location and posting age from the line under the title', () => {
    expect(
      parseTopCardMeta(
        'Shillong, Meghalaya, India · Reposted 3 months ago · Over 100 people clicked apply',
      ),
    ).toEqual({
      locationText: 'Shillong, Meghalaya, India',
      postedAtText: 'Reposted 3 months ago',
    });
  });
});
