import type { Locator, Page } from 'playwright';
import { type ScrapeContext, debugShot } from './context.ts';
import { detectAiAgentSignals, emptyAiAgentSignals } from '../ai-agent-detector.ts';
import { detectLocationConflict } from '../location-conflict.ts';
import { classifyPay, emptyPay } from '../pay.ts';
import { parsePostedTime } from '../normalize.ts';
import type { JobListing } from '../types.ts';

/**
 * The detail pane has no stable class names, so every hook hangs off the job
 * id: the title links to `/jobs/view/<id>/`, the description sits in an
 * id-keyed section, and the top card is the title's nearest ancestor that also
 * holds the company. `apps/api/linkedin-job-selectors.txt` lists every hook.
 */
const titleSelector = (jobId: string) => `a[href*="/jobs/view/${jobId}/"]`;

export const descriptionSelector = (jobId: string) =>
  `#JobDetails_AboutTheJob_${jobId} [data-testid="expandable-text-box"]`;

const COMPANY_SELECTOR = '[aria-label^="Company, "]';

const TOP_CARD_XPATH = `xpath=ancestor::*[.//*[starts-with(@aria-label, "Company, ")]][1]`;

/** Everything here reads a pane that has already loaded, so a miss should cost little. */
const READ_TIMEOUT_MS = 1000;

/** The job the detail pane is showing, which LinkedIn keeps in the URL. */
export function linkedinJobId(currentUrl: string): string | null {
  return currentUrl.match(/[?&]currentJobId=(\d+)(?:&|$)/)?.[1] ?? null;
}

export function linkedinJobUrl(currentUrl: string): string {
  const jobId = linkedinJobId(currentUrl);
  return jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : currentUrl;
}

/** The line under the title, such as "India · 12 hours ago · 79 people clicked apply". */
export function parseTopCardMeta(text: string | null): {
  locationText: string | null;
  postedAtText: string | null;
} {
  const parts = (text ?? '')
    .split('·')
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    locationText: parts[0] ?? null,
    postedAtText: parts.find((part) => /\bago$/i.test(part)) ?? null,
  };
}

export async function extractJobDetailsFromView(
  page: Page,
  jobIndex: number,
  ctx: ScrapeContext,
): Promise<JobListing> {
  if (ctx.debug) {
    ctx.onLog(`Extracting details for job ${jobIndex + 1}...`);
  }

  const currentUrl = page.url();
  const jobId = linkedinJobId(currentUrl);

  try {
    const title = page.locator(titleSelector(jobId ?? '')).first();
    const topCard = title.locator(TOP_CARD_XPATH);
    const companyLink = topCard.locator(COMPANY_SELECTOR).locator('a[href*="/company/"]').first();

    const companyName = await readText(companyLink, ctx);
    const companyUrl = companyName
      ? await companyLink.getAttribute('href', { timeout: READ_TIMEOUT_MS })
      : null;

    const { locationText, postedAtText } = parseTopCardMeta(
      await readText(topCard.locator('p').filter({ hasText: '·' }).first(), ctx),
    );

    // The pills after the title, such as pay, workplace and employment type,
    // are its first non-empty links back to this job.
    const pills = await title
      .locator(`xpath=following::a[contains(@href, "currentJobId=${jobId}")]`)
      .allInnerTexts()
      .catch(() => []);
    const jobType =
      pills
        .map((pill) => pill.trim())
        .filter(Boolean)
        .join(' · ') || null;

    const descriptionText = await readText(
      page.locator(descriptionSelector(jobId ?? '')).first(),
      ctx,
    );
    const titleText = await readText(title, ctx);

    const requirementsText = extractRequirements(descriptionText, ctx);

    return {
      source: 'linkedin',
      jobId,
      jobUrl: linkedinJobUrl(currentUrl),
      title: titleText,
      companyName,
      companyUrl,
      locationText,
      postedAtText,
      postedAtIso: postedAtText ? parsePostedTime(postedAtText) : null,
      jobType,
      alumniCount: await readText(page.getByText(/alumni work here/i).first(), ctx),
      descriptionText,
      requirementsText,
      aiAgentSignals: detectAiAgentSignals({ title: titleText, requirementsText, descriptionText }),
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

    // Return partial data on error
    return {
      source: 'linkedin',
      jobId,
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

/** The visible text of the first match, or null when there is none. */
async function readText(locator: Locator, ctx: ScrapeContext): Promise<string | null> {
  try {
    if ((await locator.count()) === 0) return null;
    const text = await locator.innerText({ timeout: READ_TIMEOUT_MS });
    return text.trim() || null;
  } catch (error) {
    if (ctx.debug) ctx.onLog(`Error reading ${String(locator)}: ${String(error)}`);
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
