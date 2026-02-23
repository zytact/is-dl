import type { Page } from 'playwright';

const JOB_LIST_SELECTOR =
  '#main > div > div.scaffold-layout__list-detail-inner.scaffold-layout__list-detail-inner--grow > div.scaffold-layout__list > div > ul';

const PAGINATION_INFO_SELECTOR =
  '#jobs-search-results-footer > div.jobs-search-pagination.jobs-search-results-list__pagination.p4 > p';

export async function getJobCardCount(
  page: Page,
  limit: number,
  debug: boolean = false,
): Promise<number> {
  console.log(`Getting job cards (limit: ${limit})...`);

  try {
    if (debug) {
      console.log('Waiting for job list to load...');
      await page.screenshot({ path: 'debug-search-page.png' });
    }

    // Wait for the job list container
    await page.waitForSelector(JOB_LIST_SELECTOR, { timeout: 15000 });

    if (debug) {
      console.log('Found job list container');
    }

    // Get all job cards (li elements)
    const jobCards = await page.$$(`${JOB_LIST_SELECTOR} > li`);
    const jobCount = Math.min(jobCards.length, limit);

    console.log(`Found ${jobCards.length} job cards on current page`);

    return jobCount;
  } catch (error) {
    console.error('Error getting job cards:', error);
    throw error;
  }
}

export async function clickJobCard(
  page: Page,
  index: number,
  debug: boolean = false,
): Promise<void> {
  try {
    const jobCards = await page.$$(`${JOB_LIST_SELECTOR} > li`);
    const card = jobCards[index];

    if (!card) {
      throw new Error(`Job card at index ${index} not found`);
    }

    // Find and click the job title within the card
    // The title is in a strong tag, but we need to click the clickable element
    await card.click();

    // Wait for job details to load
    await page.waitForTimeout(1500);

    if (debug) {
      console.log(`Clicked job card ${index + 1}`);
    }
  } catch (error) {
    if (debug) {
      console.error(`Error clicking job card ${index}:`, error);
    }
    throw error;
  }
}

export async function getPaginationInfo(
  page: Page,
  debug: boolean = false,
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
    if (debug) {
      console.error('Error getting pagination info:', error);
    }
    return null;
  }
}

export async function goToNextPage(
  page: Page,
  debug: boolean = false,
): Promise<boolean> {
  try {
    // Look for next page button - the selector from selectors.txt has dynamic ID
    // We'll use a more stable selector
    const nextButton = await page.$('button[aria-label="View next page"]');

    if (!nextButton) {
      if (debug) {
        console.log('No next page button found');
      }
      return false;
    }

    // Check if button is disabled
    const isDisabled = await nextButton.getAttribute('disabled');
    if (isDisabled !== null) {
      if (debug) {
        console.log('Next page button is disabled');
      }
      return false;
    }

    // Click the button
    await nextButton.click();

    // Wait for new page to load
    await page.waitForTimeout(3000);

    if (debug) {
      console.log('Navigated to next page');
    }

    return true;
  } catch (error) {
    if (debug) {
      console.error('Error going to next page:', error);
    }
    return false;
  }
}
