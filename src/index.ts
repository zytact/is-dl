import { parseArgs } from './cli.ts';
import {
  closeBrowser,
  ensureOutDir,
  launchBrowser,
} from './linkedin/browser.ts';
import { extractJobDetailsFromView } from './linkedin/job.ts';
import {
  clickJobCard,
  getJobCardCount,
  getPaginationInfo,
  goToNextPage,
} from './linkedin/search.ts';
import { buildSearchUrl } from './linkedin/search-url.ts';
import { writeOutput } from './output.ts';
import type { JobListing, ScraperOutput } from './types.ts';

async function main() {
  console.log('LinkedIn Internship Scraper\n');

  // Parse command-line arguments
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  console.log('Search configuration:');
  console.log(`  Keywords: ${options.keywords}`);
  console.log(`  Location: ${options.location || 'Any'}`);
  console.log(`  Limit: ${options.limit}`);
  console.log(`  Remote only: ${options.remoteOnly ? 'Yes' : 'No'}`);
  console.log(`  Output directory: ${options.outDir}\n`);

  // Ensure output directory exists
  await ensureOutDir(options.outDir);

  // Launch browser
  const session = await launchBrowser(options.headless, options.debug);

  try {
    // Build search URL
    const searchUrl = buildSearchUrl(options);
    console.log(`\nNavigating to: ${searchUrl}\n`);

    await session.page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait a bit for dynamic content to load
    await session.page.waitForTimeout(3000);

    if (options.debug) {
      await session.page.screenshot({ path: 'debug-initial-page.png' });
      console.log('Screenshot saved to debug-initial-page.png');
    }

    // Get pagination info
    const paginationInfo = await getPaginationInfo(session.page, options.debug);
    if (paginationInfo) {
      console.log(
        `Pagination: Page ${paginationInfo.current} of ${paginationInfo.total}`,
      );
    }

    // Extract details for jobs across multiple pages
    const jobs: JobListing[] = [];
    let currentPage = 1;
    let totalProcessed = 0;

    while (totalProcessed < options.limit) {
      console.log(`\n=== Processing Page ${currentPage} ===\n`);

      // Get the count of available job cards on current page
      const jobCount = await getJobCardCount(
        session.page,
        options.limit - totalProcessed,
        options.debug,
      );

      if (jobCount === 0) {
        console.log('No more jobs found.');
        break;
      }

      // Process jobs on current page
      for (let i = 0; i < jobCount && totalProcessed < options.limit; i++) {
        totalProcessed++;
        console.log(
          `[${totalProcessed}/${options.limit}] Processing job ${i + 1} on page ${currentPage}...`,
        );

        try {
          // Click on the job card to load its details
          await clickJobCard(session.page, i, options.debug);

          // Extract details from the loaded view
          const jobDetails = await extractJobDetailsFromView(
            session.page,
            i,
            options.debug,
          );
          jobs.push(jobDetails);

          if (options.debug) {
            console.log(
              `  Title: ${jobDetails.title}, Company: ${jobDetails.companyName}`,
            );
          }

          // Rate limiting: wait between requests
          const delay = 1000 + Math.random() * 2000; // 1-3 seconds
          await new Promise((resolve) => setTimeout(resolve, delay));
        } catch (error) {
          console.error(
            `Error processing job ${i + 1}:`,
            error instanceof Error ? error.message : error,
          );
          // Continue with next job
        }
      }

      // Check if we need to go to next page
      if (totalProcessed < options.limit) {
        console.log('\nAttempting to navigate to next page...');
        const hasNextPage = await goToNextPage(session.page, options.debug);

        if (!hasNextPage) {
          console.log('No more pages available.');
          break;
        }

        currentPage++;
        // Wait for new page to fully load
        await session.page.waitForTimeout(2000);
      } else {
        break;
      }
    }

    console.log(`\nSuccessfully extracted ${jobs.length} jobs.\n`);

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
      },
      jobs,
    };

    // Write output files
    const { jsonPath, toonPath } = await writeOutput(output, options.outDir);

    console.log('\nScraping completed successfully!');
    console.log(`Total jobs scraped: ${jobs.length}`);
    console.log(`JSON: ${jsonPath}`);
    console.log(`TOON: ${toonPath}`);
  } finally {
    // Close browser and save session
    await closeBrowser(session);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
