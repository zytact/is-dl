import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, rename } from 'node:fs/promises';
import { platform } from 'node:os';
import { dirname, resolve } from 'node:path';
import type { Browser, BrowserContext, Cookie, Page } from 'playwright';
import { chromium } from 'playwright';
import { CliError } from '../errors.ts';
import type { LinkedInBrowser } from '../types.ts';

const LEGACY_SESSION_FILE = 'storageState.json';

const LINKEDIN_URL = 'https://www.linkedin.com';

export interface BrowserSession {
  page: Page;
  /** Saves and quits a launched browser. On an attached one, closes only `page`. */
  close(): Promise<void>;
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

/** `li_at` is LinkedIn's login cookie. LinkedIn deletes it when it revokes a session. */
export function hasLinkedInLogin(
  cookies: readonly Pick<Cookie, 'name' | 'domain' | 'expires'>[],
  now: number = Date.now(),
): boolean {
  return cookies.some(
    (cookie) =>
      cookie.name === 'li_at' &&
      (cookie.domain === 'linkedin.com' || cookie.domain.endsWith('.linkedin.com')) &&
      (cookie.expires === -1 || cookie.expires * 1000 > now),
  );
}

/**
 * Whether the session file `is-dl login` wrote still holds a LinkedIn login. A
 * missing or unreadable file holds none, so `is-dl login` can replace it.
 */
export async function storedLogin(sessionFile: string): Promise<boolean> {
  try {
    const state = JSON.parse(await readFile(sessionFile, 'utf8')) as { cookies: Cookie[] };
    return hasLinkedInLogin(state.cookies);
  } catch {
    return false;
  }
}

async function signedIn(context: BrowserContext): Promise<boolean> {
  return hasLinkedInLogin(await context.cookies(LINKEDIN_URL));
}

/** Quits or disconnects `browser` when `use` throws, so a failed setup leaves nothing running. */
async function closeOnError<T>(browser: Browser, use: () => Promise<T>): Promise<T> {
  try {
    return await use();
  } catch (error) {
    await browser.close();
    throw error;
  }
}

/** A bare port means a browser on this machine. */
function cdpUrl(endpoint: string): string {
  return /^\d+$/.test(endpoint) ? `http://127.0.0.1:${endpoint}` : endpoint;
}

async function connect(endpoint: string): Promise<{ browser: Browser; context: BrowserContext }> {
  const browser = await chromium.connectOverCDP(cdpUrl(endpoint)).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
    throw new CliError(
      'DEPENDENCY',
      `No browser answered at ${endpoint} (${reason}). Start it with a DevTools port, or unset cdp.`,
    );
  });
  const context = browser.contexts()[0];
  if (!context) {
    await browser.close();
    throw new CliError('DEPENDENCY', `The browser at ${endpoint} has no open profile.`);
  }
  return { browser, context };
}

/** Whether the browser at `endpoint` is signed in to LinkedIn. Reads cookies, opens nothing. */
export async function attachedLogin(endpoint: string): Promise<boolean> {
  const { browser, context } = await connect(endpoint);
  try {
    return await signedIn(context);
  } finally {
    await browser.close();
  }
}

/**
 * Login and search have to look like the same browser to LinkedIn, or it treats
 * the session as stolen and revokes it. So both run the full Chromium build,
 * never the headless shell, and present its headed user agent.
 */
async function startChromium(
  headless: boolean,
  storageState?: string,
): Promise<{ browser: Browser; context: BrowserContext }> {
  requireChromium();
  const browser = await chromium.launch({
    channel: 'chromium',
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  return closeOnError(browser, async () => {
    const cdp = await browser.newBrowserCDPSession();
    const { userAgent } = await cdp.send('Browser.getVersion');
    await cdp.detach();
    const context = await browser.newContext({
      storageState,
      userAgent: userAgent.replace('HeadlessChrome/', 'Chrome/'),
    });
    return { browser, context };
  });
}

/** The browser a search drives. Fails with AUTH_REQUIRED before any page loads if LinkedIn is signed out. */
export async function openBrowser(
  target: LinkedInBrowser,
  onLog: (msg: string) => void,
): Promise<BrowserSession> {
  if (target.kind === 'cdp') {
    onLog(`Attaching to the browser at ${target.endpoint}...`);
    const { browser, context } = await connect(target.endpoint);
    return closeOnError(browser, async () => {
      if (!(await signedIn(context))) {
        throw new CliError(
          'AUTH_REQUIRED',
          `The browser at ${target.endpoint} is not signed in to LinkedIn. Sign in there.`,
        );
      }
      const page = await context.newPage();
      return {
        page,
        close: async () => {
          try {
            await page.close();
          } finally {
            await browser.close();
          }
          onLog('Closed the tab and left the browser running.');
        },
      };
    });
  }

  const { sessionFile, headless } = target;
  if (!(await storedLogin(sessionFile))) {
    throw new CliError('AUTH_REQUIRED', 'No LinkedIn login stored. Run: is-dl login');
  }
  onLog('Launching browser...');
  const { browser, context } = await startChromium(headless, sessionFile);
  const page = await closeOnError(browser, () => context.newPage());
  return {
    page,
    close: async () => {
      try {
        await saveSession(context, sessionFile);
      } finally {
        await browser.close();
      }
      onLog('Browser closed and session saved.');
    },
  };
}

/** Opens LinkedIn's login form for a person and stores the session once they press Enter. */
export async function login(
  sessionFile: string,
  headless: boolean,
  onLog: (msg: string) => void,
): Promise<void> {
  const { browser, context } = await startChromium(headless);
  try {
    const page = await context.newPage();
    await page.goto(`${LINKEDIN_URL}/login`, { waitUntil: 'domcontentloaded' });
    onLog('\nPlease log in manually in the browser window that just opened.');
    onLog('After logging in, press Enter to continue...');
    await waitForEnter();

    if (!(await signedIn(context))) {
      throw new CliError('AUTH_REQUIRED', 'LinkedIn is not signed in yet. Run is-dl login again.');
    }
    await saveSession(context, sessionFile);
    onLog(`Session saved to ${sessionFile}`);
  } finally {
    await browser.close();
  }
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}
