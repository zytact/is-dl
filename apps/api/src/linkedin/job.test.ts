import { describe, expect, test } from 'vite-plus/test';
import { linkedinJobUrl } from './job.ts';

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
