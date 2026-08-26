import { join } from 'node:path';
import { summarizeAiAgentSignals } from './ai-agent-detector.ts';
import { closeBrowser, launchBrowser } from './linkedin/browser.ts';
import type { ScrapeContext } from './linkedin/context.ts';
import { extractJobDetailsFromView } from './linkedin/job.ts';
import {
  clickJobCard,
  getJobCardCount,
  getPaginationInfo,
  goToNextPage,
} from './linkedin/search.ts';
import { buildSearchUrl } from './linkedin/search-url.ts';
import { summarizePay } from './pay.ts';
import { ensureDir } from './runs.ts';
import type { JobListing, ScraperOutput, SearchOptions } from './types.ts';

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Scrape aborted');
  }
}

function waitOrAbort(signal: AbortSignal | undefined, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!signal) {
      setTimeout(resolve, ms);
      return;
    }
    if (signal.aborted) {
      reject(new Error('Scrape aborted'));
      return;
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timeout);
      reject(new Error('Scrape aborted'));
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function runScraper(
  options: SearchOptions,
  onLog: (msg: string) => void = console.error,
  signal?: AbortSignal,
): Promise<ScraperOutput> {
  const ctx: ScrapeContext = {
    debug: options.debug ?? false,
    onLog,
    debugDir: options.debugDir,
  };

  onLog('LinkedIn Internship Scraper\n');

  checkAbort(signal);

  onLog('Search configuration:');
  onLog(`  Keywords: ${options.keywords}`);
  onLog(`  Location: ${options.location || 'Any'}`);
  onLog(`  Limit: ${options.limit}`);
  onLog(`  Remote only: ${options.remoteOnly ? 'Yes' : 'No'}\n`);

  const session = await launchBrowser({
    sessionFile: options.sessionFile,
    headless: options.headless,
    debug: options.debug,
    onLog,
  });
  let output: ScraperOutput;

  try {
    // Build search URL
    const searchUrl = buildSearchUrl(options);
    onLog(`\nNavigating to: ${searchUrl}\n`);

    await session.page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeout,
    });

    checkAbort(signal);

    await waitOrAbort(signal, 3000);

    if (options.debug) {
      await ensureDir(options.debugDir);
      const shotPath = join(options.debugDir, 'debug-initial-page.png');
      await session.page.screenshot({ path: shotPath });
      onLog(`Screenshot saved to ${shotPath}`);
    }

    // Get pagination info
    const paginationInfo = await getPaginationInfo(session.page, ctx);
    if (paginationInfo) {
      onLog(`Pagination: Page ${paginationInfo.current} of ${paginationInfo.total}`);
    }

    checkAbort(signal);

    // Extract details for jobs across multiple pages
    const jobs: JobListing[] = [];
    let currentPage = 1;
    let totalProcessed = 0;

    while (totalProcessed < options.limit) {
      checkAbort(signal);
      onLog(`\n=== Processing Page ${currentPage} ===\n`);

      // Get the count of available job cards on current page
      const jobCount = await getJobCardCount(session.page, options.limit - totalProcessed, ctx);

      onLog(`Found ${jobCount} jobs on page ${currentPage}`);

      if (jobCount === 0) {
        onLog('No more jobs found.');
        break;
      }

      // Process jobs on current page
      for (let i = 0; i < jobCount && totalProcessed < options.limit; i++) {
        checkAbort(signal);
        totalProcessed++;
        onLog(
          `[${totalProcessed}/${options.limit}] Processing job ${i + 1} on page ${currentPage}...`,
        );

        try {
          // Click on the job card to load its details
          await clickJobCard(session.page, i, ctx);

          // Extract details from the loaded view
          const jobDetails = await extractJobDetailsFromView(session.page, i, ctx);
          jobs.push(jobDetails);

          if (options.debug) {
            onLog(`  Title: ${jobDetails.title}, Company: ${jobDetails.companyName}`);
          }

          // Rate limiting: wait between requests
          const delay = 1000 + Math.random() * 2000;
          await waitOrAbort(signal, delay);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          onLog(`Error processing job ${i + 1}: ${errMsg}`);
        }
      }

      // Check if we need to go to next page
      if (totalProcessed < options.limit) {
        checkAbort(signal);
        onLog('\nAttempting to navigate to next page...');
        const hasNextPage = await goToNextPage(session.page, ctx);

        if (!hasNextPage) {
          onLog('No more pages available.');
          break;
        }

        currentPage++;
        await waitOrAbort(signal, 2000);
      } else {
        break;
      }
    }

    onLog(`\nSuccessfully extracted ${jobs.length} jobs.\n`);
    const aiAgentSummary = summarizeAiAgentSignals(jobs);
    const paySummary = summarizePay(jobs);

    output = {
      meta: {
        query: options.keywords,
        location: options.location,
        filters: {
          experienceLevel: options.experienceLevel,
          remoteOnly: options.remoteOnly,
          postedWithin: options.postedWithin,
          jobType: options.jobType,
        },
        scrapedAt: new Date().toISOString(),
        source: 'linkedin',
        count: jobs.length,
        aiAgentSummary,
        paySummary,
      },
      jobs,
    };

    onLog('\nScraping completed successfully!');
    onLog(`Total jobs scraped: ${jobs.length}`);
    onLog(
      `Pay: ${paySummary.paid} paid, ${paySummary.token} token, ${paySummary.unpaid} unpaid, ${paySummary.unstated} unstated`,
    );
    onLog(
      `AI agent signals: ${aiAgentSummary.detectedCount} detected (${aiAgentSummary.highCount} high, ${aiAgentSummary.mediumCount} medium, ${aiAgentSummary.lowCount} low)`,
    );
  } catch (err) {
    const errorStr = err instanceof Error ? err.message : String(err);
    onLog(`\nFATAL ERROR: ${errorStr}`);
    throw err;
  } finally {
    await closeBrowser(session, options.sessionFile, onLog);
  }

  return output;
}
