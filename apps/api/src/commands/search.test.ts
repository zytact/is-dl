import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';
import type { ApplicationRecord } from '../applications.ts';
import type { CliBase } from '../cli-context.ts';
import { ensureDir } from '../fs.ts';
import { resolvePaths } from '../paths.ts';
import type { ScrapeRequest } from '../scraper.ts';
import type { ScraperOutput } from '../types.ts';
import { searchCommand } from './search.ts';

const runScraper = vi.hoisted(() => vi.fn());

vi.mock('../scraper.ts', () => ({ runScraper }));
vi.mock('../linkedin/browser.ts', () => ({ migrateLegacySession: vi.fn() }));

function output(): ScraperOutput {
  return {
    meta: {
      query: 'developer',
      location: '',
      filters: {},
      scrapedAt: '2026-09-01T10:00:00.000Z',
      source: 'unstop',
      sources: [{ source: 'unstop', status: 'ok', count: 0, error: null }],
      count: 0,
      aiAgentSummary: { detectedCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 },
      paySummary: { paid: 0, token: 0, unpaid: 0, unstated: 0 },
    },
    jobs: [],
  };
}

const applied: ApplicationRecord = {
  jobId: '7',
  jobSource: 'unstop',
  company: null,
  title: null,
  url: null,
  variant: null,
  appliedAt: '2026-08-01T10:00:00.000Z',
  recordedAt: '2026-08-01T10:00:00.000Z',
  source: 'manual',
  status: 'applied',
};

/** A CLI base rooted in a fresh temp data directory holding one application. */
async function base(): Promise<CliBase> {
  const home = await mkdtemp(join(tmpdir(), 'is-dl-search-'));
  const env = {
    XDG_CONFIG_HOME: join(home, 'config'),
    XDG_DATA_HOME: join(home, 'data'),
    XDG_STATE_HOME: join(home, 'state'),
    XDG_CACHE_HOME: join(home, 'cache'),
  } satisfies NodeJS.ProcessEnv;

  const paths = resolvePaths(env, home, 'linux');
  await ensureDir(paths.data);
  await writeFile(paths.applicationsLog, `${JSON.stringify(applied)}\n`, 'utf-8');

  return { paths, cwd: home, env, signal: new AbortController().signal };
}

/** The query the command handed to the sources. */
async function search(argv: string[]): Promise<ScrapeRequest['query']> {
  runScraper.mockResolvedValue(output());
  await searchCommand(await base(), argv);
  const [request] = runScraper.mock.calls[0] as [ScrapeRequest];
  return request.query;
}

afterEach(() => {
  runScraper.mockReset();
});

describe('--exclude-applied', () => {
  test('reaches the sources, so a logged job is never opened', async () => {
    const { known } = await search(['-k', 'developer', '--exclude-applied', '--quiet']);
    expect(known?.has('unstop', '7')).toBe(true);
    expect(known?.has('unstop', '8')).toBe(false);
  });

  test('does not filter the sources when it was not asked for', async () => {
    const { known } = await search(['-k', 'developer', '--quiet']);
    expect(known?.has('unstop', '7')).toBe(false);
  });
});
