import { join } from 'node:path';
import { ensureDir } from '../fs.ts';
import { checkAbort, type SourceContext, type SourceRunner, waitOrAbort } from '../sources.ts';
import type { JobListing, LinkedInOptions, SearchQuery } from '../types.ts';
import { closeBrowser, launchBrowser } from './browser.ts';
import type { ScrapeContext } from './context.ts';
import { extractJobDetailsFromView } from './job.ts';
import { clickJobCard, getJobCardIds, getPaginationInfo, goToNextPage } from './search.ts';
import { buildSearchUrl } from './search-url.ts';

async function scrape(
  query: SearchQuery,
  options: LinkedInOptions,
  { onLog, signal }: SourceContext,
): Promise<JobListing[]> {
  const ctx: ScrapeContext = {
    debug: options.debug ?? false,
    onLog,
    debugDir: options.debugDir,
  };

  checkAbort(signal);

  const session = await launchBrowser({
    sessionFile: options.sessionFile,
    headless: options.headless,
    debug: options.debug,
    onLog,
  });

  try {
    const searchUrl = buildSearchUrl(query, options);
    onLog(`Navigating to: ${searchUrl}`);

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

    const paginationInfo = await getPaginationInfo(session.page, ctx);
    if (paginationInfo) {
      onLog(`Pagination: Page ${paginationInfo.current} of ${paginationInfo.total}`);
    }

    checkAbort(signal);

    const jobs: JobListing[] = [];
    let currentPage = 1;
    let known = 0;

    while (jobs.length < query.limit) {
      checkAbort(signal);
      onLog(`=== Processing Page ${currentPage} ===`);

      const cardIds = await getJobCardIds(session.page, ctx);
      onLog(`Found ${cardIds.length} jobs on page ${currentPage}`);

      if (cardIds.length === 0) {
        onLog('No more jobs found.');
        break;
      }

      for (let i = 0; i < cardIds.length && jobs.length < query.limit; i++) {
        checkAbort(signal);

        // Skipping here rather than after the fact is the whole point: an
        // already-seen job costs neither a click nor a slot under the limit.
        const cardId = cardIds[i] ?? null;
        if (cardId !== null && query.known?.has('linkedin', cardId)) {
          known++;
          continue;
        }

        onLog(
          `[${jobs.length + 1}/${query.limit}] Processing job ${i + 1} on page ${currentPage}...`,
        );

        try {
          await clickJobCard(session.page, i, ctx);
          const jobDetails = await extractJobDetailsFromView(session.page, i, ctx);
          jobs.push(jobDetails);

          if (options.debug) {
            onLog(`  Title: ${jobDetails.title}, Company: ${jobDetails.companyName}`);
          }

          // Rate limiting: wait between requests
          await waitOrAbort(signal, 1000 + Math.random() * 2000);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          onLog(`Error processing job ${i + 1}: ${errMsg}`);
        }
      }

      if (jobs.length >= query.limit) break;

      checkAbort(signal);
      onLog('Attempting to navigate to next page...');
      if (!(await goToNextPage(session.page, ctx))) {
        onLog('No more pages available.');
        break;
      }
      currentPage++;
      await waitOrAbort(signal, 2000);
    }

    onLog(`Successfully extracted ${jobs.length} jobs.`);
    if (known) onLog(`Skipped ${known} already surfaced by an earlier run.`);
    return jobs;
  } finally {
    await closeBrowser(session, options.sessionFile, onLog);
  }
}

export function linkedinSource(options: LinkedInOptions): SourceRunner {
  return {
    source: 'linkedin',
    run: (query, ctx) => scrape(query, options, ctx),
  };
}
