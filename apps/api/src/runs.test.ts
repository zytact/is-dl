import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vite-plus/test';
import { ensureDir } from './fs.ts';
import type { AppPaths } from './paths.ts';
import { knownJobKeys, listRuns, readRun, rebuildSeen, saveRun } from './runs.ts';
import { readSeen } from './seen.ts';
import type { ScraperOutput } from './types.ts';

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

/** An empty data directory with the run store and ledger paths wired up. */
async function emptyStore(): Promise<AppPaths> {
  const data = await mkdtemp(join(tmpdir(), 'is-dl-store-'));
  return {
    runsDir: join(data, 'runs'),
    runsIndex: join(data, 'runs', 'index.json'),
    seenLog: join(data, 'seen.jsonl'),
  } as AppPaths;
}

function output(scrapedAt: string, jobIds: string[]): ScraperOutput {
  return {
    meta: { ...legacy.meta, scrapedAt, sources: [] },
    jobs: jobIds.map((jobId) => ({ source: 'unstop', jobId })),
  } as unknown as ScraperOutput;
}

describe('the seen ledger and the run store', () => {
  test('saving a run adds its jobs to the ledger', async () => {
    const paths = await emptyStore();
    await saveRun(paths, 'run-1', output('2026-08-01T00:00:00.000Z', ['1', '2']));

    const seen = await readSeen(paths.seenLog);
    expect([...seen.keys()]).toEqual(['unstop:1', 'unstop:2']);
    expect(seen.get('unstop:1')?.firstSeenAt).toBe('2026-08-01T00:00:00.000Z');
  });

  test('a job in two runs is credited to the earlier one', async () => {
    const paths = await emptyStore();
    await saveRun(paths, 'run-1', output('2026-08-01T00:00:00.000Z', ['1']));
    await saveRun(paths, 'run-2', output('2026-08-02T00:00:00.000Z', ['1', '2']));

    const seen = await readSeen(paths.seenLog);
    expect(seen.get('unstop:1')?.runId).toBe('run-1');
    expect(seen.get('unstop:2')?.runId).toBe('run-2');
  });

  test('a rebuild walks runs oldest first, so each job keeps its real discovery date', async () => {
    const paths = await emptyStore();
    // Written directly, bypassing saveRun, so the ledger starts out empty.
    await ensureDir(paths.runsDir);
    for (const [runId, at, ids] of [
      ['2026-08-02', '2026-08-02T00:00:00.000Z', ['1', '3']],
      ['2026-08-01', '2026-08-01T00:00:00.000Z', ['1', '2']],
    ] as const) {
      await writeFile(
        join(paths.runsDir, `${runId}.json`),
        JSON.stringify(output(at, [...ids])),
        'utf-8',
      );
    }

    expect(await rebuildSeen(paths)).toBe(3);
    const seen = await readSeen(paths.seenLog);
    expect(seen.get('unstop:1')?.runId).toBe('2026-08-01');
    expect(seen.get('unstop:3')?.runId).toBe('2026-08-02');
  });

  test('the first filtered search backfills from runs made before the ledger existed', async () => {
    const paths = await emptyStore();
    await ensureDir(paths.runsDir);
    await writeFile(
      join(paths.runsDir, 'old.json'),
      JSON.stringify(output('2026-07-01T00:00:00.000Z', ['9'])),
      'utf-8',
    );

    expect([...(await knownJobKeys(paths))]).toEqual(['unstop:9']);
  });

  test('no runs and no ledger is not an error', async () => {
    expect([...(await knownJobKeys(await emptyStore()))]).toEqual([]);
  });
});
