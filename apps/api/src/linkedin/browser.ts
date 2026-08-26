import { existsSync } from 'node:fs';
import { chmod, mkdir, rename } from 'node:fs/promises';
import { platform } from 'node:os';
import { dirname, resolve } from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright';
import { CliError } from '../errors.ts';

const LEGACY_SESSION_FILE = 'storageState.json';

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export interface LaunchOptions {
  sessionFile: string;
  headless?: boolean;
  debug?: boolean;
  onLog?: (msg: string) => void;
  /** Only `is-dl login` may open the manual login flow. */
  interactive?: boolean;
}

export function chromiumExecutable(): string | null {
  try {
    const path = chromium.executablePath();
    return existsSync(path) ? path : null;
  } catch {
    return null;
  }
}

function requireChromium(): void {
  if (!chromiumExecutable()) {
    throw new CliError(
      'DEPENDENCY',
      'Playwright Chromium is not installed. Run: npx playwright install chromium',
    );
  }
}

/** Session files hold LinkedIn cookies. Windows has no chmod equivalent. */
async function restrictPermissions(filePath: string): Promise<void> {
  if (platform() === 'win32') return;
  await chmod(filePath, 0o600);
}

async function saveSession(context: BrowserContext, sessionFile: string): Promise<void> {
  await mkdir(dirname(sessionFile), { recursive: true });
  await context.storageState({ path: sessionFile });
  await restrictPermissions(sessionFile);
}

/** One-time move of a pre-CLI `./storageState.json` into the state directory. */
export async function migrateLegacySession(
  sessionFile: string,
  cwd: string,
  onLog: (msg: string) => void,
): Promise<void> {
  const legacy = resolve(cwd, LEGACY_SESSION_FILE);
  if (existsSync(sessionFile) || !existsSync(legacy)) return;
  await mkdir(dirname(sessionFile), { recursive: true });
  await rename(legacy, sessionFile);
  await restrictPermissions(sessionFile);
  onLog(`Moved existing session from ${legacy} to ${sessionFile}`);
}

export async function launchBrowser(options: LaunchOptions): Promise<BrowserSession> {
  const { sessionFile, headless = true, debug = false, interactive = false } = options;
  const onLog = options.onLog ?? console.error;
  const hasSession = existsSync(sessionFile);

  if (!hasSession && !interactive) {
    throw new CliError('AUTH_REQUIRED', 'No LinkedIn session. Run: is-dl login');
  }
  if (!hasSession && !process.stdin.isTTY) {
    throw new CliError(
      'AUTH_REQUIRED',
      'Logging in needs an interactive terminal. Run: is-dl login from a terminal.',
    );
  }

  requireChromium();
  onLog('Launching browser...');

  const browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const contextOptions = hasSession
    ? { storageState: sessionFile }
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

  if (hasSession) {
    onLog('Existing session found, reusing authentication.');
    return { browser, context, page };
  }

  onLog('\nNo session found. Opening LinkedIn login page...');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
  onLog('\nPlease log in manually in the browser window that just opened.');
  onLog('After logging in, press Enter to continue...');

  await waitForEnter();
  await saveSession(context, sessionFile);
  onLog(`Session saved to ${sessionFile}`);

  return { browser, context, page };
}

export async function closeBrowser(
  session: BrowserSession,
  sessionFile: string,
  onLog: (msg: string) => void = console.error,
): Promise<void> {
  await saveSession(session.context, sessionFile);
  await session.browser.close();
  onLog('Browser closed and session saved.');
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}
