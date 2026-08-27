import type { Page } from 'playwright';
import { type ScrapeContext, debugShot } from './context.ts';
import { detectAiAgentSignals, emptyAiAgentSignals } from '../ai-agent-detector.ts';
import { detectLocationConflict } from '../location-conflict.ts';
import { classifyPay, emptyPay } from '../pay.ts';
import { parsePostedTime } from '../normalize.ts';
import type { JobListing } from '../types.ts';

// Selectors from selectors.txt
const SELECTORS = {
  description: '#job-details > div > p',
  location:
    '#main > div > div.scaffold-layout__list-detail-inner.scaffold-layout__list-detail-inner--grow > div.scaffold-layout__detail.overflow-x-hidden.jobs-search__job-details > div > div.jobs-search__job-details--container > div > div.job-view-layout.jobs-details > div:nth-child(1) > div > div:nth-child(1) > div > div.relative.job-details-jobs-unified-top-card__container--two-pane > div > div.job-details-jobs-unified-top-card__primary-description-container > div > span > span:nth-child(1)',
  companyName:
    '#main > div > div.scaffold-layout__list-detail-inner.scaffold-layout__list-detail-inner--grow > div.scaffold-layout__detail.overflow-x-hidden.jobs-search__job-details > div > div.jobs-search__job-details--container > div > div.job-view-layout.jobs-details > div:nth-child(1) > div > div:nth-child(1) > div > div.relative.job-details-jobs-unified-top-card__container--two-pane > div > div.display-flex.align-items-center > div.display-flex.align-items-center.flex-1 > div > a',
  jobType:
    '#main > div > div.scaffold-layout__list-detail-inner.scaffold-layout__list-detail-inner--grow > div.scaffold-layout__detail.overflow-x-hidden.jobs-search__job-details > div > div.jobs-search__job-details--container > div > div.job-view-layout.jobs-details > div:nth-child(1) > div > div:nth-child(1) > div > div.relative.job-details-jobs-unified-top-card__container--two-pane > div > div.job-details-fit-level-preferences',
  postedAgo:
    '#main > div > div.scaffold-layout__list-detail-inner.scaffold-layout__list-detail-inner--grow > div.scaffold-layout__detail.overflow-x-hidden.jobs-search__job-details > div > div.jobs-search__job-details--container > div > div.job-view-layout.jobs-details > div:nth-child(1) > div > div:nth-child(1) > div > div.relative.job-details-jobs-unified-top-card__container--two-pane > div > div.job-details-jobs-unified-top-card__primary-description-container > div > span > span.tvm__text.tvm__text--positive > strong > span',
};

function linkedinJobId(currentUrl: string): string | null {
  return currentUrl.match(/[?&]currentJobId=(\d+)(?:&|$)/)?.[1] ?? null;
}

export function linkedinJobUrl(currentUrl: string): string {
  const jobId = linkedinJobId(currentUrl);
  return jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : currentUrl;
}

export async function extractJobDetailsFromView(
  page: Page,
  jobIndex: number,
  ctx: ScrapeContext,
): Promise<JobListing> {
  if (ctx.debug) {
    ctx.onLog(`Extracting details for job ${jobIndex + 1}...`);
  }

  try {
    // Get current URL to extract job ID
    const currentUrl = page.url();
    const jobId = linkedinJobId(currentUrl);

    // Extract title - try to find the job title
    const title = await extractText(page, '.job-details-jobs-unified-top-card__job-title', ctx);

    // Extract company name and URL
    const companyNameElement = await page.$(SELECTORS.companyName);
    const companyName = companyNameElement ? await companyNameElement.textContent() : null;
    const companyUrl = companyNameElement ? await companyNameElement.getAttribute('href') : null;

    // Extract location
    const locationText = await extractText(page, SELECTORS.location, ctx);

    // Extract posted time
    let postedAtText = await extractText(page, SELECTORS.postedAgo, ctx);

    // Fallback: try other selectors
    if (!postedAtText) {
      postedAtText = await extractPostedTime(page, ctx);
    }

    const postedAtIso = postedAtText ? parsePostedTime(postedAtText) : null;

    // Extract job type/preferences
    const jobType = await extractText(page, SELECTORS.jobType, ctx);

    // Extract alumni count (if exists)
    const alumniCount = await extractAlumniCount(page, ctx);

    // Extract job description
    let descriptionText = await extractText(page, SELECTORS.description, ctx);

    // Fallback: try alternative description selector
    if (!descriptionText) {
      descriptionText = await extractText(page, '.jobs-description__content', ctx);
    }

    // Try to expand description if "Show more" button exists
    try {
      const showMoreButton = await page.$(
        'button[aria-label="Show more, visually expands previously read content above"]',
      );
      if (showMoreButton) {
        await showMoreButton.click();
        await page.waitForTimeout(500);
        // Re-extract description after expanding
        descriptionText = await extractText(page, SELECTORS.description, ctx);
        if (!descriptionText) {
          descriptionText = await extractText(page, '.jobs-description__content', ctx);
        }
      }
    } catch {
      // Button might not exist or already expanded
    }

    // Extract requirements (heuristic from description)
    const requirementsText = extractRequirements(descriptionText, ctx);
    const aiAgentSignals = detectAiAgentSignals({
      title,
      requirementsText,
      descriptionText,
    });

    return {
      source: 'linkedin',
      jobId,
      jobUrl: linkedinJobUrl(currentUrl),
      title: title?.trim() || null,
      companyName: companyName?.trim() || null,
      companyUrl,
      locationText: locationText?.trim() || null,
      postedAtText,
      postedAtIso,
      jobType: jobType?.trim() || null,
      alumniCount,
      descriptionText: descriptionText?.trim() || null,
      requirementsText,
      aiAgentSignals,
      pay: classifyPay({ descriptionText, requirementsText }),
      locationConflict: detectLocationConflict({
        jobType,
        locationText,
        descriptionText,
        requirementsText,
      }),
    };
  } catch (error) {
    if (ctx.debug) {
      ctx.onLog(`Error extracting job details: ${String(error)}`);
      await debugShot(ctx, page, `debug-job-error-${jobIndex}.png`);
    }

    const currentUrl = page.url();

    // Return partial data on error
    return {
      source: 'linkedin',
      jobId: linkedinJobId(currentUrl),
      jobUrl: linkedinJobUrl(currentUrl),
      title: null,
      companyName: null,
      companyUrl: null,
      locationText: null,
      postedAtText: null,
      postedAtIso: null,
      jobType: null,
      alumniCount: null,
      descriptionText: null,
      requirementsText: null,
      aiAgentSignals: emptyAiAgentSignals(),
      pay: emptyPay(),
      locationConflict: null,
    };
  }
}

async function extractText(
  page: Page,
  selector: string,
  ctx: ScrapeContext,
): Promise<string | null> {
  try {
    const element = await page.$(selector);
    if (!element) return null;

    const text = await element.textContent();
    return text?.trim() || null;
  } catch (error) {
    if (ctx.debug) {
      ctx.onLog(`Error extracting text for selector ${selector}:: ${String(error)}`);
    }
    return null;
  }
}

async function extractPostedTime(page: Page, ctx: ScrapeContext): Promise<string | null> {
  try {
    // Try multiple selectors for posted time
    const selectors = [
      '.job-details-jobs-unified-top-card__posted-date',
      '.jobs-unified-top-card__posted-date',
      '[class*="posted"]',
    ];

    for (const selector of selectors) {
      const text = await extractText(page, selector, ctx);
      if (text?.includes('ago')) {
        return text;
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function extractAlumniCount(page: Page, ctx: ScrapeContext): Promise<string | null> {
  try {
    // Look for alumni information - try multiple patterns
    const selectors = [
      '.job-card-container__job-insight-text',
      '[class*="alumni"]',
      '[class*="insight"]',
    ];

    for (const selector of selectors) {
      const elements = await page.$$(selector);
      for (const element of elements) {
        const text = await element.textContent();
        if (text?.toLowerCase().includes('alumni')) {
          return text.trim();
        }
      }
    }

    return null;
  } catch (error) {
    if (ctx.debug) {
      ctx.onLog(`Error extracting alumni count: ${String(error)}`);
    }
    return null;
  }
}

function extractRequirements(descriptionText: string | null, ctx: ScrapeContext): string | null {
  if (!descriptionText) return null;

  try {
    // Look for common requirement section headers
    const patterns = [
      /requirements:?\s*/i,
      /qualifications:?\s*/i,
      /what you'll need:?\s*/i,
      /minimum qualifications:?\s*/i,
      /required qualifications:?\s*/i,
    ];

    for (const pattern of patterns) {
      const match = descriptionText.match(pattern);
      if (match && typeof match.index === 'number' && match[0]) {
        // Extract text after the header (up to next major section or end)
        const startIndex = match.index + match[0].length;
        const remainingText = descriptionText.substring(startIndex);

        // Try to find next major section
        const nextSectionMatch = remainingText.match(/\n\n[A-Z][a-z]+:?\s*\n/);
        const endIndex =
          nextSectionMatch && typeof nextSectionMatch.index === 'number'
            ? nextSectionMatch.index
            : Math.min(remainingText.length, 1000);

        return remainingText.substring(0, endIndex).trim();
      }
    }

    return null;
  } catch (error) {
    if (ctx.debug) {
      ctx.onLog(`Error extracting requirements: ${String(error)}`);
    }
    return null;
  }
}
