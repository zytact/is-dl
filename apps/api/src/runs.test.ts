import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vite-plus/test';
import type { AppPaths } from './paths.ts';
import { ensureDir, listRuns, readRun } from './runs.ts';

/** A temp data directory holding one run file named `legacy.json`. */
async function runsIn(file: unknown): Promise<AppPaths> {
  const data = await mkdtemp(join(tmpdir(), 'is-dl-runs-'));
  const runsDir = join(data, 'runs');
  await ensureDir(runsDir);
  await writeFile(join(runsDir, 'legacy.json'), JSON.stringify(file), 'utf-8');
  return { runsDir, runsIndex: join(runsDir, 'index.json') } as AppPaths;
}

const legacy = {
  meta: {
    query: 'developer',
    location: 'India',
    filters: {},
    scrapedAt: '2026-08-20T10:00:00.000Z',
    source: 'linkedin',
    count: 1,
  },
  jobs: [{ source: 'linkedin', jobId: '1' }],
};

describe('reading a run file written before per-source outcomes', () => {
  test('reports sources as unknown rather than inventing one', async () => {
    const paths = await runsIn(legacy);
    const run = await readRun(paths, 'legacy');
    expect(run.meta.sources).toBeNull();
    expect(run.meta.source).toBe('linkedin');
  });

  test('still summarizes into the run list', async () => {
    const paths = await runsIn(legacy);
    expect(await listRuns(paths)).toMatchObject([
      { runId: 'legacy', query: 'developer', count: 1 },
    ]);
  });

  test('keeps the recorded outcomes when the file has them', async () => {
    const sources = [{ source: 'unstop', status: 'ok', count: 1, error: null }];
    const paths = await runsIn({ ...legacy, meta: { ...legacy.meta, sources } });
    expect((await readRun(paths, 'legacy')).meta.sources).toEqual(sources);
  });
});
