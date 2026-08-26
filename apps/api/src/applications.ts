import { existsSync } from 'node:fs';
import { appendFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CliError } from './errors.ts';
import { ensureDir } from './runs.ts';

export const APPLICATION_STATUSES = [
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'ghosted',
  'withdrawn',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface ApplicationRecord {
  jobId: string;
  company: string | null;
  title: string | null;
  url: string | null;
  variant: string | null;
  appliedAt: string;
  source: string;
  unmatchedTags: string[];
  status: ApplicationStatus;
}

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(value);
}

/** Append-only. A status change is a new line, never an edit of an old one. */
export async function appendApplication(file: string, record: ApplicationRecord): Promise<void> {
  await ensureDir(dirname(file));
  await appendFile(file, `${JSON.stringify(record)}\n`, 'utf-8');
}

export async function readApplications(file: string): Promise<ApplicationRecord[]> {
  if (!existsSync(file)) return [];
  const text = await readFile(file, 'utf-8');
  const records: ApplicationRecord[] = [];
  for (const [i, line] of text.split('\n').entries()) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line) as ApplicationRecord);
    } catch {
      throw new CliError('ERROR', `Corrupt application log at ${file}, line ${i + 1}.`);
    }
  }
  return records;
}

/** The last record for a jobId is its current state. */
export function currentState(records: ApplicationRecord[]): Map<string, ApplicationRecord> {
  const byJob = new Map<string, ApplicationRecord>();
  for (const record of records) byJob.set(record.jobId, record);
  return byJob;
}

export function historyFor(records: ApplicationRecord[], jobId: string): ApplicationRecord[] {
  return records.filter((record) => record.jobId === jobId);
}

const DURATION = /^(\d+)([dwmh])$/;

/** Parses `10d`, `2w`, `36h`, `3m` into milliseconds. */
export function parseDuration(value: string): number {
  const match = DURATION.exec(value.trim());
  if (!match) {
    throw new CliError('USAGE', `Invalid duration "${value}". Use forms like 36h, 10d, 2w, 3m.`);
  }
  const amount = Number(match[1]);
  const hour = 3600_000;
  const unit = { h: hour, d: 24 * hour, w: 7 * 24 * hour, m: 30 * 24 * hour }[match[2]!]!;
  return amount * unit;
}
