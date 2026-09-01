import { existsSync } from 'node:fs';
import { appendFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { seenKey } from './applications.ts';
import { CliError } from './errors.ts';
import { ensureDir } from './fs.ts';
import type { AppPaths } from './paths.ts';
import type { JobListing, KnownJobs } from './types.ts';

/**
 * One job a search has surfaced before. Append-only, and only ever the first
 * sighting: a job that shows up again in a later run is not re-appended, so the
 * timestamp always answers "when did I first see this".
 */
export interface SeenRecord {
  /** `source:jobId`, the same key the application log uses. */
  key: string;
  /** The run that first surfaced it. */
  runId: string;
  firstSeenAt: string;
}

export const noJobsKnown: KnownJobs = { has: () => false };

export function knownJobs(keys: ReadonlySet<string>): KnownJobs {
  return { has: (source, jobId) => keys.has(seenKey(source, jobId)) };
}

export async function readSeen(file: string): Promise<Map<string, SeenRecord>> {
  if (!existsSync(file)) return new Map();
  const text = await readFile(file, 'utf-8');
  const byKey = new Map<string, SeenRecord>();
  for (const [i, line] of text.split('\n').entries()) {
    if (!line.trim()) continue;
    let record: SeenRecord;
    try {
      record = JSON.parse(line) as SeenRecord;
    } catch {
      throw new CliError('ERROR', `Corrupt seen log at ${file}, line ${i + 1}.`);
    }
    if (!byKey.has(record.key)) byKey.set(record.key, record);
  }
  return byKey;
}

export async function appendSeen(file: string, records: readonly SeenRecord[]): Promise<void> {
  if (!records.length) return;
  await ensureDir(dirname(file));
  await appendFile(file, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf-8');
}

/**
 * The jobs in `jobs` that `known` has never seen, as records. Mutates nothing;
 * `known` is grown by the caller when it is walking several runs.
 */
export function newSeenRecords(
  jobs: readonly JobListing[],
  known: ReadonlySet<string>,
  runId: string,
  at: string,
): SeenRecord[] {
  const records: SeenRecord[] = [];
  const added = new Set<string>();
  for (const job of jobs) {
    if (job.jobId === null) continue;
    const key = seenKey(job.source, job.jobId);
    if (known.has(key) || added.has(key)) continue;
    added.add(key);
    records.push({ key, runId, firstSeenAt: at });
  }
  return records;
}

/**
 * Adds a saved run's jobs to the ledger. `saveRun` calls this, so anything that
 * reaches the run store is in the ledger whether or not the search that
 * produced it asked to filter on one.
 */
export async function recordSeen(
  paths: AppPaths,
  runId: string,
  jobs: readonly JobListing[],
  at: string = new Date().toISOString(),
): Promise<number> {
  const existing = await readSeen(paths.seenLog);
  const records = newSeenRecords(jobs, new Set(existing.keys()), runId, at);
  await appendSeen(paths.seenLog, records);
  return records.length;
}
