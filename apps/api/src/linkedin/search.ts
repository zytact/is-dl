import type { Page } from 'playwright';
import { CliError } from '../errors.ts';
import { type ScrapeContext, debugShot } from './context.ts';
import { descriptionSelector, linkedinJobId } from './job.ts';

/** LinkedIn keys every card with the job id, which is also how `cardJobId` reads it. */
const JOB_CARD_SELECTOR = 'div[role="button"][componentkey^="job-card-component-ref-"]';

const CARD_KEY_PREFIX = 'job-card-component-ref-';

const NEXT_PAGE_SELECTOR = '[data-testid="pagination-controls-next-button-visible"]';

/** How long a click or a page turn has to show its result before we give up on it. */
const READY_TIMEOUT_MS = 15000;

const POLL_INTERVAL_MS = 100;

/**
 * The job ids of every card on the page, in card order, so the caller can skip
 * a job before paying for the click and the detail fetch.
 *
 * An entry is null when a card has no id in its key. That is not fatal:
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

    // An empty search is a valid answer, so it settles the wait as well as a card does.
    await page
      .locator(JOB_CARD_SELECTOR)
      .or(page.getByText('No results found'))
      .first()
      .waitFor({ timeout: READY_TIMEOUT_MS })
      .catch(() => {
        throw layoutChanged('job list', JOB_CARD_SELECTOR);
      });

    const jobCards = await page.$$(JOB_CARD_SELECTOR);
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

async function cardJobId(card: JobCard): Promise<string | null> {
  try {
    const key = await card.getAttribute('componentkey');
    return key?.startsWith(CARD_KEY_PREFIX) ? key.slice(CARD_KEY_PREFIX.length) || null : null;
  } catch {
    return null;
  }
}

/** A hook that never appears means LinkedIn moved its markup, not that the search failed. */
function layoutChanged(name: string, selector: string): CliError {
  return new CliError(
    'ERROR',
    `LinkedIn's ${name} did not appear within ${READY_TIMEOUT_MS / 1000}s (selector: ${selector}). LinkedIn may have changed its page layout.`,
  );
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

  // The description loads last, so it is the sign the pane is complete.
  const shown = linkedinJobId(page.url()) ?? '';
  await page
    .waitForSelector(descriptionSelector(shown), { timeout: READY_TIMEOUT_MS })
    .catch(() => {
      if (ctx.debug) ctx.onLog('Job description never appeared in the detail pane');
    });
}

export async function clickJobCard(
  page: Page,
  index: number,
  ctx: ScrapeContext,
  expectedJobId: string | null = null,
): Promise<void> {
  try {
    const jobCards = await page.$$(JOB_CARD_SELECTOR);
    const card = jobCards[index];

    if (!card) {
      throw new Error(`Job card at index ${index} not found`);
    }

    const before = linkedinJobId(page.url());

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

/** The id of the topmost card, which is what tells one results page from the next. */
async function firstCardId(page: Page): Promise<string | null> {
  try {
    const first = await page.$(JOB_CARD_SELECTOR);
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
    // LinkedIn swaps in a "-hidden" test id on the last page.
    const nextButton = await page.$(NEXT_PAGE_SELECTOR);

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
