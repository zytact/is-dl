import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const LATEST_RELEASE_URL = 'https://github.com/zytact/is-dl/releases/latest';
const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_TIMEOUT_MS = 1_500;
const CLAIM_PREFIX = 'update-claim-';

/** Where install.sh and the release tarball download from. `IS_DL_RELEASE_URL` overrides it. */
export function releaseDownloadUrl(env: NodeJS.ProcessEnv): string {
  return env.IS_DL_RELEASE_URL || `${LATEST_RELEASE_URL}/download`;
}

/** Reads the latest release version from GitHub's redirect, which costs no API rate limit. */
async function fetchLatestVersion(): Promise<string | undefined> {
  const response = await fetch(LATEST_RELEASE_URL, {
    method: 'HEAD',
    redirect: 'manual',
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  return response.headers.get('location')?.match(/\/tag\/v(\d+\.\d+\.\d+)$/u)?.[1];
}

export function isNewer(candidate: string, current: string): boolean {
  const [a, b] = [candidate, current].map((value) => value.split('.').map(Number));
  for (let index = 0; index < 3; index++) {
    const difference = (a?.[index] ?? 0) - (b?.[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

async function readLatest(cacheFile: string): Promise<string | undefined> {
  try {
    const raw: unknown = JSON.parse(await readFile(cacheFile, 'utf8'));
    return typeof raw === 'object' &&
      raw !== null &&
      'latest' in raw &&
      typeof raw.latest === 'string'
      ? raw.latest
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Creating the day's claim file succeeds for exactly one process, so concurrent commands ask
 * GitHub once. Earlier days' claims are removed by the winner.
 */
async function claimToday(directory: string, now: number): Promise<boolean> {
  const claim = `${CLAIM_PREFIX}${Math.floor(now / DAY_MS)}`;
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(join(directory, claim), '', { flag: 'wx' });
  } catch {
    return false;
  }
  const stale = (await readdir(directory)).filter(
    (name) => name.startsWith(CLAIM_PREFIX) && name !== claim,
  );
  await Promise.all(stale.map((name) => rm(join(directory, name), { force: true })));
  return true;
}

interface UpdateNoticeOptions {
  readonly current: string;
  readonly cacheDirectory: string;
  readonly now?: number;
  readonly fetchLatest?: () => Promise<string | undefined>;
}

/** Returns a notice when a newer release exists, asking GitHub at most once per UTC day. */
export async function updateNotice({
  current,
  cacheDirectory,
  now = Date.now(),
  fetchLatest = fetchLatestVersion,
}: UpdateNoticeOptions): Promise<string | undefined> {
  const cacheFile = join(cacheDirectory, 'update-check.json');
  let latest = await readLatest(cacheFile);
  if (await claimToday(cacheDirectory, now).catch(() => false)) {
    latest = (await fetchLatest().catch(() => undefined)) ?? latest;
    if (latest) await writeFile(cacheFile, JSON.stringify({ latest })).catch(() => undefined);
  }
  if (!latest || !isNewer(latest, current)) return undefined;
  return `Update available: ${current} → ${latest}. Run "is-dl update".\n`;
}
