import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';
import type { CliBase } from '../cli-context.ts';
import { resolvePaths } from '../paths.ts';
import { writeRunTo } from '../runs.ts';
import type { JobListing, ScraperOutput } from '../types.ts';
import { runsCommand } from './runs.ts';

/** A CLI base rooted in a fresh temp data directory holding `count` saved runs. */
async function base(count: number): Promise<CliBase> {
  const home = await mkdtemp(join(tmpdir(), 'is-dl-runs-cmd-'));
  const env = { XDG_CONFIG_HOME: join(home, 'config'), XDG_DATA_HOME: join(home, 'data') };
  const paths = resolvePaths(env, home, 'linux');
  for (let index = 1; index <= count; index += 1) {
    const runId = `2026-08-0${index}`;
    await writeRunTo(paths.runsDir, runId, {
      meta: { scrapedAt: `${runId}T00:00:00.000Z`, query: 'developer', location: 'India' },
      jobs: [{ source: 'unstop', jobId: String(index) } as JobListing],
    } as unknown as ScraperOutput);
  }
  return { paths, cwd: home, env, signal: new AbortController().signal };
}

async function stdoutOf(run: () => Promise<void>): Promise<string> {
  let out = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  await run();
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runs list --limit', () => {
  test.each<[string, string[]]>([
    ['a zero limit', ['--limit', '0']],
    ['a negative limit', ['--limit=-1']],
    ['a fractional limit', ['--limit', '3.5']],
    ['an empty limit', ['--limit', '']],
    ['a non-numeric limit', ['--limit', 'abc']],
  ])('refuses %s as a usage error', async (_case, argv) => {
    await expect(runsCommand(await base(2), ['list', ...argv])).rejects.toMatchObject({
      code: 'USAGE',
    });
  });

  test('cuts the list to the newest N runs for a positive integer', async () => {
    const ctx = await base(2);
    const out = await stdoutOf(() => runsCommand(ctx, ['list', '--limit', '1']));
    expect(out.trim().split('\n')).toHaveLength(1);
  });

  test('lists every run when --limit is left out', async () => {
    const ctx = await base(2);
    const out = await stdoutOf(() => runsCommand(ctx, ['list']));
    expect(out.trim().split('\n')).toHaveLength(2);
  });
});
