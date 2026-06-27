import { summarizeAiAgentSignals } from './ai-agent-detector.ts';
import { closeBrowser, ensureOutDir, launchBrowser } from './linkedin/browser.ts';
import { extractJobDetailsFromView } from './linkedin/job.ts';
import {
  clickJobCard,
  getJobCardCount,
  getPaginationInfo,
  goToNextPage,
} from './linkedin/search.ts';
import { buildSearchUrl } from './linkedin/search-url.ts';
import { writeOutput } from './output.ts';
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
  onLog: (msg: string) => void = console.log,
  signal?: AbortSignal,
): Promise<string> {
  onLog('LinkedIn Internship Scraper\n');

  checkAbort(signal);

  onLog('Search configuration:');
  onLog(`  Keywords: ${options.keywords}`);
  onLog(`  Location: ${options.location || 'Any'}`);
  onLog(`  Limit: ${options.limit}`);
  onLog(`  Remote only: ${options.remoteOnly ? 'Yes' : 'No'}`);
  onLog(`  Output directory: ${options.outDir}\n`);

  // Ensure output directory exists
  await ensureOutDir(options.outDir);

  // Launch browser
  const session = await launchBrowser(options.headless, options.debug, onLog);
  let finalJsonPath = '';

  try {
    // Build search URL
    const searchUrl = buildSearchUrl(options);
    onLog(`\nNavigating to: ${searchUrl}\n`);

    await session.page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    checkAbort(signal);

    await waitOrAbort(signal, 3000);

    if (options.debug) {
      await session.page.screenshot({ path: 'debug-initial-page.png' });
      onLog('Screenshot saved to debug-initial-page.png');
    }

    // Get pagination info
    const paginationInfo = await getPaginationInfo(session.page, options.debug);
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
      const jobCount = await getJobCardCount(
        session.page,
        options.limit - totalProcessed,
        options.debug,
      );

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
          await clickJobCard(session.page, i, options.debug);

          // Extract details from the loaded view
          const jobDetails = await extractJobDetailsFromView(session.page, i, options.debug);
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
          console.error(`Error processing job ${i + 1}:`, errMsg);
        }
      }

      // Check if we need to go to next page
      if (totalProcessed < options.limit) {
        checkAbort(signal);
        onLog('\nAttempting to navigate to next page...');
        const hasNextPage = await goToNextPage(session.page, options.debug);

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

    // Prepare output data
    const output: ScraperOutput = {
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
      },
      jobs,
    };

    // Write output files
    const { jsonPath } = await writeOutput(output, options.outDir);
    finalJsonPath = jsonPath;

    onLog('\nScraping completed successfully!');
    onLog(`Total jobs scraped: ${jobs.length}`);
    onLog(
      `AI agent signals: ${aiAgentSummary.detectedCount} detected (${aiAgentSummary.highCount} high, ${aiAgentSummary.mediumCount} medium, ${aiAgentSummary.lowCount} low)`,
    );
    onLog(`JSON: ${jsonPath}`);
  } catch (err) {
    const errorStr = err instanceof Error ? err.message : String(err);
    onLog(`\nFATAL ERROR: ${errorStr}`);
    throw err;
  } finally {
    // Close browser and save session
    await closeBrowser(session, onLog);
  }

  return finalJsonPath;
}
