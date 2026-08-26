import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from 'playwright';

/**
 * Logging and debug-artifact plumbing for the page-level scraper helpers.
 * `onLog` must never write to stdout, which is reserved for `--json` output.
 */
export interface ScrapeContext {
  debug: boolean;
  onLog: (msg: string) => void;
  debugDir: string;
}

export function silentContext(): ScrapeContext {
  return { debug: false, onLog: () => {}, debugDir: '' };
}

/** Screenshots go under the resolved debug directory, never the working directory. */
export async function debugShot(ctx: ScrapeContext, page: Page, name: string): Promise<void> {
  if (!ctx.debug || !ctx.debugDir) return;
  await mkdir(ctx.debugDir, { recursive: true });
  const path = join(ctx.debugDir, name);
  await page.screenshot({ path });
  ctx.onLog(`Screenshot saved to ${path}`);
}
