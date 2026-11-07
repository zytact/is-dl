import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { detectAiAgentSignals } from './ai-agent-detector.ts';
import { CliError } from './errors.ts';
import { ensureDir } from './fs.ts';
import { type JobRef, jobNotesDir } from './notes.ts';
import type { AppPaths } from './paths.ts';
import { classifyPay } from './pay.ts';
import { isJobSource, type JobListing, type JobSource } from './types.ts';

/** The snapshot of a listing taken when the person applied, next to the job's notes. */
export function listingFile(paths: AppPaths, ref: JobRef): string {
  return join(jobNotesDir(paths, ref), 'listing.json');
}

/** A listing an application can stand on: it says what the role was and who offered it. */
export function isUsableListing(job: JobListing): boolean {
  return Boolean(job.title?.trim() && job.companyName?.trim());
}

/** How much of a listing survived its scrape. A usable copy beats any other, then a described one. */
export function listingRank(job: JobListing): number {
  return (isUsableListing(job) ? 2 : 0) + (job.descriptionText?.trim() ? 1 : 0);
}

/** Writes the snapshot unless one exists, so the first application's copy is the one kept. */
export async function saveListing(
  paths: AppPaths,
  ref: JobRef,
  listing: JobListing,
): Promise<boolean> {
  const file = listingFile(paths, ref);
  if (existsSync(file)) return false;
  await ensureDir(jobNotesDir(paths, ref));
  await writeFile(file, `${JSON.stringify(listing, null, 2)}\n`, 'utf-8');
  return true;
}

export async function readListing(paths: AppPaths, ref: JobRef): Promise<JobListing | null> {
  const file = listingFile(paths, ref);
  if (!existsSync(file)) return null;
  const json = await readFile(file, 'utf-8');
  try {
    return JSON.parse(json) as JobListing;
  } catch {
    throw new CliError('ERROR', `Corrupt listing at ${file}.`);
  }
}

function text(raw: Record<string, unknown>, key: keyof JobListing): string | null {
  const value = raw[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * Reads a hand-written listing for a job no search found, such as one from a
 * careers page or an email. It takes the `JobListing` shape, needs `title`,
 * `companyName` and `jobUrl`, and derives pay and AI signals from the text the
 * way a search would.
 */
export function parseListing(
  json: string,
  file: string,
  jobId: string,
  source: JobSource | undefined,
): JobListing {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new CliError('USAGE', `--listing ${file} is not valid JSON.`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CliError('USAGE', `--listing ${file} must hold one JSON object.`);
  }
  const fields = raw as Record<string, unknown>;

  const board = source ?? (typeof fields.source === 'string' ? fields.source : undefined);
  if (!board || !isJobSource(board)) {
    throw new CliError('USAGE', `--listing ${file} names no known board. Pass --source.`);
  }

  const title = text(fields, 'title');
  const companyName = text(fields, 'companyName');
  const jobUrl = text(fields, 'jobUrl');
  const missing = Object.entries({ title, companyName, jobUrl })
    .filter(([, value]) => value === null)
    .map(([key]) => key);
  if (!title || !companyName || !jobUrl) {
    throw new CliError('USAGE', `--listing ${file} has no ${missing.join(', ')}.`);
  }

  const descriptionText = text(fields, 'descriptionText');
  const requirementsText = text(fields, 'requirementsText');
  const applyUrl = text(fields, 'applyUrl');
  return {
    source: board,
    jobId,
    jobUrl,
    ...(applyUrl ? { applyUrl } : {}),
    title,
    companyName,
    companyUrl: text(fields, 'companyUrl'),
    locationText: text(fields, 'locationText'),
    postedAtText: text(fields, 'postedAtText'),
    postedAtIso: text(fields, 'postedAtIso'),
    jobType: text(fields, 'jobType'),
    alumniCount: text(fields, 'alumniCount'),
    descriptionText,
    requirementsText,
    aiAgentSignals: detectAiAgentSignals({ title, descriptionText, requirementsText }),
    pay: classifyPay({ descriptionText, requirementsText }),
    locationConflict: null,
  };
}
