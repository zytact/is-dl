import type { Page } from 'playwright';
import { type ScrapeContext, debugShot } from './context.ts';
import { linkedinJobId } from './job.ts';

const JOB_LIST_SELECTOR =
  '#main > div > div.scaffold-layout__list-detail-inner.scaffold-layout__list-detail-inner--grow > div.scaffold-layout__list > div > ul';

const PAGINATION_INFO_SELECTOR =
  '#jobs-search-results-footer > div.jobs-search-pagination.jobs-search-results-list__pagination.p4 > p';

const JOB_TITLE_SELECTOR = '.job-details-jobs-unified-top-card__job-title';

/** How long a click or a page turn has to show its result before we give up on it. */
const READY_TIMEOUT_MS = 15000;

const POLL_INTERVAL_MS = 100;

/**
 * The job ids of every card on the page, in card order, so the caller can skip
 * a job before paying for the click and the detail fetch.
 *
 * An entry is null when neither attribute is on the card. That is not fatal:
 * the caller opens the job and reads the id from the URL as it always has, and
 * only loses the chance to skip it early.
 */
export async function getJobCardIds(page: Page, ctx: ScrapeContext): Promise<(string | null)[]> {
  ctx.onLog('Getting job cards...');

  try {
    if (ctx.debug) {
      ctx.onLog('Waiting for job list to load...');
      await debugShot(ctx, page, 'debug-search-page.png');
    }

    // Wait for the job list container
    await page.waitForSelector(JOB_LIST_SELECTOR, { timeout: 15000 });

    if (ctx.debug) {
      ctx.onLog('Found job list container');
    }

    // Get all job cards (li elements)
    const jobCards = await page.$$(`${JOB_LIST_SELECTOR} > li`);
    const ids = await Promise.all(jobCards.map((card) => cardJobId(card)));

    ctx.onLog(`Found ${jobCards.length} job cards on current page`);

    return ids;
  } catch (error) {
    ctx.onLog(`Error getting job cards: ${String(error)}`);
    throw error;
  }
}

/** Whatever `page.$$` hands back, without naming DOM types this project has no lib for. */
type JobCard = Awaited<ReturnType<Page['$$']>>[number];

/** LinkedIn puts the id on the list item, or on the card div inside it. */
async function cardJobId(card: JobCard): Promise<string | null> {
  try {
    const own = await card.getAttribute('data-occludable-job-id');
    if (own?.trim()) return own.trim();
    const inner = await card.$('[data-job-id]');
    const nested = await inner?.getAttribute('data-job-id');
    return nested?.trim() ? nested.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Polls `ready` from Node rather than injecting a page function, which keeps
 * this project free of DOM types. Returns false on timeout; every caller
 * carries on regardless, so a slow page costs a wait and not a job.
 */
async function pollUntil(ready: () => Promise<boolean>, page: Page): Promise<boolean> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    if (await ready()) return true;
    if (Date.now() >= deadline) return false;
    await page.waitForTimeout(POLL_INTERVAL_MS);
  }
}

/**
 * Blocks until the detail pane is showing the job that was just clicked, rather
 * than for a fixed interval that is either too long or, on a slow load, wrong.
 *
 * `expected` is the id read off the card. Without one, the best available
 * signal is that the pane moved off whatever it was showing before the click.
 */
async function waitForJobDetails(
  page: Page,
  expected: string | null,
  before: string | null,
  ctx: ScrapeContext,
): Promise<void> {
  const settled = await pollUntil(() => {
    const shown = linkedinJobId(page.url());
    return Promise.resolve(
      expected === null ? shown !== null && shown !== before : shown === expected,
    );
  }, page);

  if (!settled) {
    // The extractor reads the pane either way and reports what it found.
    // Failing here would turn a slow load into a lost job.
    if (ctx.debug) ctx.onLog(`Detail pane never settled on job ${expected ?? 'unknown'}`);
    return;
  }

  await page.waitForSelector(JOB_TITLE_SELECTOR, { timeout: READY_TIMEOUT_MS }).catch(() => {
    if (ctx.debug) ctx.onLog('Job title never appeared in the detail pane');
  });
}

export async function clickJobCard(
  page: Page,
  index: number,
  ctx: ScrapeContext,
  expectedJobId: string | null = null,
): Promise<void> {
  try {
    const jobCards = await page.$$(`${JOB_LIST_SELECTOR} > li`);
    const card = jobCards[index];

    if (!card) {
      throw new Error(`Job card at index ${index} not found`);
    }

    const before = linkedinJobId(page.url());

    // Find and click the job title within the card
    // The title is in a strong tag, but we need to click the clickable element
    await card.click();

    await waitForJobDetails(page, expectedJobId, before, ctx);

    if (ctx.debug) {
      ctx.onLog(`Clicked job card ${index + 1}`);
    }
  } catch (error) {
    if (ctx.debug) {
      ctx.onLog(`Error clicking job card ${index}: ${String(error)}`);
    }
    throw error;
  }
}

export async function getPaginationInfo(
  page: Page,
  ctx: ScrapeContext,
): Promise<{ current: number; total: number } | null> {
  try {
    const paginationElement = await page.$(PAGINATION_INFO_SELECTOR);
    if (!paginationElement) return null;

    const text = await paginationElement.textContent();
    if (!text) return null;

    // Parse text like "Page 1 of 5" or "1 of 5"
    const match = text.match(/(\d+)\s+of\s+(\d+)/);
    if (match?.[1] && match?.[2]) {
      return {
        current: Number.parseInt(match[1], 10),
        total: Number.parseInt(match[2], 10),
      };
    }

    return null;
  } catch (error) {
    if (ctx.debug) {
      ctx.onLog(`Error getting pagination info: ${String(error)}`);
    }
    return null;
  }
}

/** The id of the topmost card, which is what tells one results page from the next. */
async function firstCardId(page: Page): Promise<string | null> {
  try {
    const first = await page.$(`${JOB_LIST_SELECTOR} > li`);
    return first ? await cardJobId(first) : null;
  } catch {
    return null;
  }
}

/**
 * Blocks until the results list has been replaced. `previous` is the id of the
 * card that was at the top before the click; a list still showing it is the old
 * page, however many cards it now has.
 */
async function waitForNewResults(
  page: Page,
  previous: string | null,
  ctx: ScrapeContext,
): Promise<void> {
  const turned = await pollUntil(async () => {
    const id = await firstCardId(page);
    return previous === null ? id !== null : id !== previous;
  }, page);

  // A page that never turns over shows up as a repeat of the cards we just
  // read, and those are skipped on their ids, so carrying on is safe.
  if (!turned && ctx.debug) ctx.onLog('Next page never replaced the results list');
}

export async function goToNextPage(page: Page, ctx: ScrapeContext): Promise<boolean> {
  try {
    // Look for next page button - the selector from selectors.txt has dynamic ID
    // We'll use a more stable selector
    const nextButton = await page.$('button[aria-label="View next page"]');

    if (!nextButton) {
      if (ctx.debug) {
        ctx.onLog('No next page button found');
      }
      return false;
    }

    // Check if button is disabled
    const isDisabled = await nextButton.getAttribute('disabled');
    if (isDisabled !== null) {
      if (ctx.debug) {
        ctx.onLog('Next page button is disabled');
      }
      return false;
    }

    // The first card of the outgoing page, so the wait below can tell a loaded
    // page from the one still on screen.
    const firstCard = await firstCardId(page);

    // Click the button
    await nextButton.click();

    await waitForNewResults(page, firstCard, ctx);

    if (ctx.debug) {
      ctx.onLog('Navigated to next page');
    }

    return true;
  } catch (error) {
    if (ctx.debug) {
      ctx.onLog(`Error going to next page: ${String(error)}`);
    }
    return false;
  }
}
