import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  APPLICATION_STATUSES,
  type ApplicationRecord,
  appendApplication,
  currentState,
  historyFor,
  isApplicationStatus,
  parseDuration,
  readApplications,
  recordSource,
} from '../applications.ts';
import { buildCtx, type CliBase, type Ctx } from '../cli-context.ts';
import { CliError } from '../errors.ts';
import {
  isUsableListing,
  listingFile,
  parseListing,
  readListing,
  saveListing,
} from '../listing.ts';
import { listAttachments, listNotes, noteMeta } from '../notes.ts';
import type { JobListing, JobSource } from '../types.ts';
import { findJob, GLOBAL_OPTIONS, readSourceFlag, usage } from './shared.ts';

const APPS_OPTIONS = {
  variant: { type: 'string' },
  'from-run': { type: 'string' },
  listing: { type: 'string' },
  status: { type: 'string' },
  'older-than': { type: 'string' },
  source: { type: 'string', short: 's' },
} as const;

/** Two boards can hand out the same numeric id, so the caller has to pick one. */
function assertOneBoard(matches: ApplicationRecord[], jobId: string): void {
  const sources = [...new Set(matches.map(recordSource))];
  if (sources.length > 1) {
    throw new CliError(
      'USAGE',
      `${jobId} is logged on ${sources.join(', ')}. Pass --source to pick one.`,
    );
  }
}

function pickOne(matches: ApplicationRecord[], jobId: string): ApplicationRecord {
  const first = matches[0];
  if (!first) throw new CliError('ERROR', `No application logged for ${jobId}.`);
  assertOneBoard(matches, jobId);
  return first;
}

function line(record: ApplicationRecord): string {
  const when = record.appliedAt.slice(0, 10);
  const id = `${recordSource(record)}:${record.jobId}`;
  return `${id.padEnd(21)} ${record.status.padEnd(10)} ${when}  ${record.company ?? '?'} - ${record.title ?? '?'}`;
}

/** The listing an application records, and where it came from: a runId, or "manual". */
async function findListing(
  ctx: Ctx,
  jobId: string,
  values: { listing?: string; 'from-run'?: string },
  source: JobSource | undefined,
): Promise<{ listing: JobListing; from: string }> {
  if (values.listing) {
    if (!existsSync(values.listing)) throw new CliError('ERROR', `No file at ${values.listing}.`);
    const json = await readFile(values.listing, 'utf-8');
    return { listing: parseListing(json, values.listing, jobId, source), from: 'manual' };
  }
  const found = await findJob(ctx, jobId, values['from-run'], source);
  if (found && isUsableListing(found.job)) return { listing: found.job, from: found.runId };
  throw new CliError(
    'USAGE',
    found
      ? `Run ${found.runId} holds ${jobId} without its title or company. Pass --listing <file> with the job as JSON.`
      : `No run holds ${jobId}. Pass --listing <file> with the job as JSON.`,
  );
}

function block(label: string, text: string | null): string[] {
  if (!text) return [`  ${label}: -`];
  return [`  ${label}:`, ...text.split('\n').map((row) => `    ${row}`)];
}

function describeListing(listing: JobListing | null): string[] {
  if (!listing) return ['listing: none'];
  const { pay } = listing;
  return [
    'listing:',
    `  location: ${listing.locationText ?? '-'}`,
    `  work type: ${listing.jobType ?? '-'}`,
    `  pay: ${pay.evidence ? `${pay.kind} (${pay.evidence})` : pay.kind}`,
    `  company url: ${listing.companyUrl ?? '-'}`,
    `  posted: ${listing.postedAtIso ?? listing.postedAtText ?? '-'}`,
    ...block('description', listing.descriptionText),
    ...block('requirements', listing.requirementsText),
  ];
}

export async function appsCommand(base: CliBase, argv: string[]): Promise<void> {
  const { values, positionals } = usage(() =>
    parseArgs({
      args: argv,
      options: { ...GLOBAL_OPTIONS, ...APPS_OPTIONS },
      allowPositionals: true,
    }),
  );
  const ctx = await buildCtx(base, values);
  const [sub, first, second] = positionals;
  const file = ctx.paths.applicationsLog;
  const source = readSourceFlag(values.source);

  switch (sub) {
    case 'add': {
      if (!first) throw new CliError('USAGE', 'Usage: is-dl apps add <jobId> [--variant x]');
      const { listing, from } = await findListing(ctx, first, values, source);
      const ref = { source: listing.source, jobId: first };
      const saved = await saveListing(ctx.paths, ref, listing);
      const now = new Date().toISOString();

      const record: ApplicationRecord = {
        jobId: first,
        jobSource: listing.source,
        company: listing.companyName,
        title: listing.title,
        url: listing.jobUrl,
        variant: values.variant ?? null,
        appliedAt: now,
        recordedAt: now,
        source: from,
        status: 'applied',
      };

      await appendApplication(file, record);
      const listingPath = listingFile(ctx.paths, ref);
      const kept = saved
        ? `Saved its listing to ${listingPath}.`
        : `Kept the listing at ${listingPath}.`;
      ctx.emit(`Logged ${record.jobId} as applied. ${kept}`, () => ({
        ok: true,
        record,
        listingFile: listingPath,
      }));
      return;
    }
    case 'status': {
      if (!first || !second) {
        throw new CliError(
          'USAGE',
          `Usage: is-dl apps status <jobId> <${APPLICATION_STATUSES.join('|')}>`,
        );
      }
      if (!isApplicationStatus(second)) {
        throw new CliError(
          'USAGE',
          `Unknown status "${second}". Use one of: ${APPLICATION_STATUSES.join(', ')}`,
        );
      }
      const states = [...currentState(await readApplications(file)).values()].filter(
        (record) => record.jobId === first && (!source || recordSource(record) === source),
      );
      const previous = pickOne(states, first);

      const record: ApplicationRecord = {
        ...previous,
        status: second,
        recordedAt: new Date().toISOString(),
      };
      await appendApplication(file, record);
      ctx.emit(`${first}: ${previous.status} -> ${second}`, () => ({ ok: true, record }));
      return;
    }
    case undefined:
    case 'list': {
      let records = [...currentState(await readApplications(file)).values()];
      if (values.status) {
        if (!isApplicationStatus(values.status)) {
          throw new CliError('USAGE', `Unknown --status "${values.status}".`);
        }
        records = records.filter((record) => record.status === values.status);
      }
      if (values['older-than']) {
        const cutoff = Date.now() - parseDuration(values['older-than']);
        records = records.filter((record) => new Date(record.appliedAt).getTime() < cutoff);
      }
      records.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));

      ctx.emit(records.length ? records.map(line).join('\n') : 'No applications logged.', () => ({
        ok: true,
        applications: records,
      }));
      return;
    }
    case 'show': {
      if (!first) throw new CliError('USAGE', 'Usage: is-dl apps show <jobId>');
      const history = historyFor(await readApplications(file), first, source);
      if (!history.length) throw new CliError('ERROR', `No application logged for ${first}.`);
      assertOneBoard(history, first);
      const last = history.at(-1)!;
      const ref = { source: recordSource(last), jobId: first };
      const notes = await listNotes(ctx.paths, ref);
      const files = await listAttachments(ctx.paths, ref);
      const listing = await readListing(ctx.paths, ref);
      const human = [
        `${first}  ${last.company ?? '?'} - ${last.title ?? '?'}`,
        `url: ${last.url ?? '-'}`,
        `variant: ${last.variant ?? '-'}`,
        'history:',
        ...history.map((record) => `  ${record.recordedAt}  ${record.status}`),
        `notes:${notes.length ? '' : ' none'}`,
        ...notes.map((note) => `  ${note.noteId}  ${note.title}`),
        ...(files.length ? [`files: ${files.map((f) => f.name).join(', ')}`] : []),
        ...describeListing(listing),
      ].join('\n');
      ctx.emit(human, () => ({
        ok: true,
        jobId: first,
        history,
        listing,
        notes: notes.map(noteMeta),
        files,
      }));
      return;
    }
    default:
      throw new CliError(
        'USAGE',
        `Unknown apps subcommand "${sub}". Try add, status, list, or show.`,
      );
  }
}
