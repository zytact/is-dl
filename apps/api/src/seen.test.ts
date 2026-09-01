import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vite-plus/test';
import type { AppPaths } from './paths.ts';
import { knownJobs, readSeen, recordSeen, type SeenRecord } from './seen.ts';
import type { JobListing, JobSource } from './types.ts';

async function dataDir(): Promise<AppPaths> {
  const data = await mkdtemp(join(tmpdir(), 'is-dl-seen-'));
  return { seenLog: join(data, 'seen.jsonl') } as AppPaths;
}

function job(source: JobSource, jobId: string | null): JobListing {
  return { source, jobId } as JobListing;
}

async function lines(paths: AppPaths): Promise<SeenRecord[]> {
  const text = await readFile(paths.seenLog, 'utf-8');
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SeenRecord);
}

describe('recording what a run surfaced', () => {
  test('keeps the first sighting when a later run shows the same job', async () => {
    const paths = await dataDir();
    await recordSeen(paths, 'run-1', [job('unstop', '1')], '2026-08-01T00:00:00.000Z');
    await recordSeen(
      paths,
      'run-2',
      [job('unstop', '1'), job('unstop', '2')],
      '2026-08-02T00:00:00.000Z',
    );

    expect(await lines(paths)).toEqual([
      { key: 'unstop:1', runId: 'run-1', firstSeenAt: '2026-08-01T00:00:00.000Z' },
      { key: 'unstop:2', runId: 'run-2', firstSeenAt: '2026-08-02T00:00:00.000Z' },
    ]);
  });

  test('records a job once when a single run lists it twice', async () => {
    const paths = await dataDir();
    await recordSeen(paths, 'run-1', [job('unstop', '1'), job('unstop', '1')]);
    expect(await lines(paths)).toHaveLength(1);
  });

  test('ignores jobs with no id, since nothing can identify them later', async () => {
    const paths = await dataDir();
    await recordSeen(paths, 'run-1', [job('linkedin', null)]);
    expect(await readSeen(paths.seenLog)).toEqual(new Map());
  });

  test('separates the same numeric id on two boards', async () => {
    const paths = await dataDir();
    await recordSeen(paths, 'run-1', [job('linkedin', '42'), job('unstop', '42')]);
    expect([...(await readSeen(paths.seenLog)).keys()]).toEqual(['linkedin:42', 'unstop:42']);
  });

  test('refuses to read a corrupt ledger rather than silently forgetting jobs', async () => {
    const paths = await dataDir();
    await recordSeen(paths, 'run-1', [job('unstop', '1')]);
    await writeFile(paths.seenLog, `${await readFile(paths.seenLog, 'utf-8')}{oops\n`, 'utf-8');
    await expect(readSeen(paths.seenLog)).rejects.toThrow(/line 2/);
  });
});

describe('the known-jobs predicate', () => {
  const known = knownJobs(new Set(['linkedin:42']));

  test('matches on board and id together', () => {
    expect(known.has('linkedin', '42')).toBe(true);
    expect(known.has('unstop', '42')).toBe(false);
  });
});
