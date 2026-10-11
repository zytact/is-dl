import type { Locator, Page } from 'playwright';
import { type ScrapeContext, debugShot } from './context.ts';
import { detectAiAgentSignals } from '../ai-agent-detector.ts';
import { detectLocationConflict } from '../location-conflict.ts';
import { classifyPay } from '../pay.ts';
import { parsePostedTime } from '../normalize.ts';
import type { JobListing } from '../types.ts';

/**
 * The detail pane has no stable class names, so every hook hangs off the job
 * id or the pane's shape: the title links to `/jobs/view/<id>/`, the
 * description sits in an id-keyed section, and the top card is the title's
 * nearest ancestor that holds the company logo and stops short of the
 * description. `apps/api/linkedin-job-selectors.txt` lists every hook.
 */
const titleSelector = (jobId: string) => `a[href*="/jobs/view/${jobId}/"]`;

const descriptionSectionId = (jobId: string) => `JobDetails_AboutTheJob_${jobId}`;

export const descriptionSelector = (jobId: string) =>
  `#${descriptionSectionId(jobId)} [data-testid="expandable-text-box"]`;

const topCardXPath = (jobId: string) =>
  `xpath=ancestor::*[.//figure][1][not(.//*[@id="${descriptionSectionId(jobId)}"])]`;

/**
 * The pay, workplace and employment type pills are the first row after the top
 * card that holds one link back to the job per cell. Other such links, like
 * "I'm interested", sit elsewhere in the pane.
 */
const pillsXPath = (jobId: string) => {
  const pill = `*/a[contains(@href, "currentJobId=${jobId}")]`;
  return `xpath=following-sibling::*[${pill}][1]/${pill}`;
};

/** The name beside the logo, which is a link only when the company has a LinkedIn page. */
const COMPANY_SELECTOR = 'figure + p';

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
  if (!jobId) throw new Error('The detail pane has no job id in its URL');

  const title = page.locator(titleSelector(jobId)).first();
  const topCard = title.locator(topCardXPath(jobId));

  // A pane with no title never loaded. Returning it would save an empty
  // listing as seen, where failing leaves the job for the next search.
  const titleText = await readText(title, ctx);
  if (!titleText) {
    await debugShot(ctx, page, `debug-job-error-${jobIndex}.png`).catch(() => {});
    throw new Error(`The detail pane for job ${jobId} did not load`);
  }

  const company = topCard.locator(COMPANY_SELECTOR).first();
  const companyName = await readText(company, ctx);
  const companyUrl = await readIfPresent(
    company.locator('a[href*="/company/"]').first(),
    ctx,
    (link) => link.getAttribute('href', { timeout: READ_TIMEOUT_MS }),
  );

  const { locationText, postedAtText } = parseTopCardMeta(
    await readText(topCard.locator('p').filter({ hasText: '·' }).first(), ctx),
  );

  const pills = (
    await topCard
      .locator(pillsXPath(jobId))
      .allInnerTexts()
      .catch(() => [])
  )
    .map((pill) => pill.trim())
    .filter(Boolean);
  const jobType = pills.join(' · ') || null;

  const descriptionText = await readText(page.locator(descriptionSelector(jobId)).first(), ctx);
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
    pay: classifyPay({ pills, descriptionText, requirementsText }),
    locationConflict: detectLocationConflict({
      jobType,
      locationText,
      descriptionText,
      requirementsText,
    }),
  };
}

/** The visible text of the first match, or null when there is none. */
function readText(locator: Locator, ctx: ScrapeContext): Promise<string | null> {
  return readIfPresent(
    locator,
    ctx,
    async (match) => (await match.innerText({ timeout: READ_TIMEOUT_MS })).trim() || null,
  );
}

/** What `read` makes of the match, or null when nothing matches or the read fails. */
async function readIfPresent(
  locator: Locator,
  ctx: ScrapeContext,
  read: (match: Locator) => Promise<string | null>,
): Promise<string | null> {
  try {
    if ((await locator.count()) === 0) return null;
    return await read(locator);
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
