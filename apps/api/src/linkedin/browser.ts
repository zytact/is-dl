import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import type { Browser, BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright';

const SESSION_FILE = './storageState.json';

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export async function launchBrowser(
  headless: boolean = true,
  debug: boolean = false,
  onLog: (msg: string) => void = console.log,
): Promise<BrowserSession> {
  onLog('Launching browser...');

  const browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const hasSession = existsSync(SESSION_FILE);

  const contextOptions = hasSession
    ? { storageState: SESSION_FILE }
    : {
        viewport: { width: 1280, height: 720 },
        userAgent:
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  if (debug) {
    page.on('console', (msg) => onLog(`[Browser] ${msg.text()}`));
  }

  if (!hasSession) {
    onLog('\nNo session found. Opening LinkedIn login page...');
    await page.goto('https://www.linkedin.com/login', {
      waitUntil: 'domcontentloaded',
    });
    onLog('\nPlease log in manually in the browser window that just opened.');
    onLog('After logging in, press Enter to continue...');

    await waitForEnter();

    // Save session state
    await context.storageState({ path: SESSION_FILE });
    onLog(`Session saved to ${SESSION_FILE}`);
  } else {
    onLog('Existing session found, reusing authentication.');
  }

  return { browser, context, page };
}

export async function closeBrowser(
  session: BrowserSession,
  onLog: (msg: string) => void = console.log,
): Promise<void> {
  // Save session state before closing
  await session.context.storageState({ path: SESSION_FILE });
  await session.browser.close();
  onLog('Browser closed and session saved.');
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.once('data', () => {
      resolve();
    });
  });
}

export async function ensureOutDir(outDir: string): Promise<void> {
  if (!existsSync(outDir)) {
    await mkdir(outDir, { recursive: true });
  }
}
