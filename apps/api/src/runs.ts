import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { CliError } from './errors.ts';
import type { AppPaths } from './paths.ts';
import type { PersistedRun, ScraperOutput } from './types.ts';

export interface RunSummary {
  runId: string;
  path: string;
  scrapedAt: string;
  query: string;
  location: string;
  count: number;
}

export function newRunId(now: Date = new Date()): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

export function runIdFromFilename(filename: string): string {
  return basename(filename).replace(/\.json$/, '');
}

export async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function summarize(runId: string, filePath: string, output: PersistedRun): RunSummary {
  return {
    runId,
    path: filePath,
    scrapedAt: output.meta.scrapedAt,
    query: output.meta.query,
    location: output.meta.location,
    count: output.jobs.length,
  };
}

/** Writes to an explicit directory and leaves the run index alone. */
export async function writeRunTo(
  dir: string,
  runId: string,
  output: ScraperOutput,
): Promise<string> {
  await ensureDir(dir);
  const filePath = join(dir, `${runId}.json`);
  await writeJson(filePath, output);
  return filePath;
}

export async function saveRun(
  paths: AppPaths,
  runId: string,
  output: ScraperOutput,
): Promise<string> {
  const filePath = await writeRunTo(paths.runsDir, runId, output);
  const runs = await listRuns(paths);
  const next = [summarize(runId, filePath, output), ...runs.filter((r) => r.runId !== runId)];
  await writeJson(paths.runsIndex, { runs: next });
  return filePath;
}

/** The index is a cache. A directory scan is the source of truth when it is stale. */
export async function listRuns(paths: AppPaths): Promise<RunSummary[]> {
  if (!existsSync(paths.runsDir)) return [];

  const files = (await readdir(paths.runsDir))
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .sort()
    .reverse();

  const indexed = new Map<string, RunSummary>();
  if (existsSync(paths.runsIndex)) {
    try {
      const parsed = JSON.parse(await readFile(paths.runsIndex, 'utf-8')) as {
        runs?: RunSummary[];
      };
      for (const run of parsed.runs ?? []) indexed.set(run.runId, run);
    } catch {
      // A corrupt index just means we rebuild from disk.
    }
  }

  const summaries: RunSummary[] = [];
  for (const file of files) {
    const runId = runIdFromFilename(file);
    const cached = indexed.get(runId);
    if (cached) {
      summaries.push(cached);
      continue;
    }
    const output = await tryReadRunFile(join(paths.runsDir, file));
    if (output) summaries.push(summarize(runId, join(paths.runsDir, file), output));
  }
  return summaries;
}

/** A missing `sources` becomes an explicit null, so callers cannot read past it. */
function normalizeRun(parsed: unknown): PersistedRun | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const run = parsed as Partial<PersistedRun>;
  if (!run.meta || !Array.isArray(run.jobs)) return null;
  const sources = run.meta.sources;
  return {
    meta: { ...run.meta, sources: Array.isArray(sources) ? sources : null },
    jobs: run.jobs,
  };
}

async function tryReadRunFile(filePath: string): Promise<PersistedRun | null> {
  try {
    return normalizeRun(JSON.parse(await readFile(filePath, 'utf-8')));
  } catch {
    return null;
  }
}

export async function resolveRunId(paths: AppPaths, ref: string): Promise<string> {
  if (ref !== 'latest') return runIdFromFilename(ref);
  const runs = await listRuns(paths);
  const latest = runs[0];
  if (!latest) throw new CliError('ERROR', 'No runs found. Run: is-dl search -k "..."');
  return latest.runId;
}

export async function readRun(paths: AppPaths, runId: string): Promise<PersistedRun> {
  const filePath = join(paths.runsDir, `${runId}.json`);
  const output = await tryReadRunFile(filePath);
  if (!output) throw new CliError('ERROR', `Run not found: ${runId}`);
  return output;
}

export async function removeRun(paths: AppPaths, runId: string): Promise<string> {
  const filePath = join(paths.runsDir, `${runId}.json`);
  if (!existsSync(filePath)) throw new CliError('ERROR', `Run not found: ${runId}`);
  await unlink(filePath);
  const runs = (await listRuns(paths)).filter((r) => r.runId !== runId);
  await writeJson(paths.runsIndex, { runs });
  return filePath;
}
