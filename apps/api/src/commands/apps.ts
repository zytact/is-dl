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
import { buildCtx, type CliBase } from '../cli-context.ts';
import { CliError } from '../errors.ts';
import { listAttachments, listNotes, noteMeta } from '../notes.ts';
import { findJob, GLOBAL_OPTIONS, readSourceFlag, usage } from './shared.ts';

const APPS_OPTIONS = {
  variant: { type: 'string' },
  'from-run': { type: 'string' },
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
      const found = await findJob(ctx, first, values['from-run'], source);
      const now = new Date().toISOString();

      const record: ApplicationRecord = {
        jobId: first,
        jobSource: found?.job.source ?? source ?? 'linkedin',
        company: found?.job.companyName ?? null,
        title: found?.job.title ?? null,
        url: found?.job.jobUrl ?? null,
        variant: values.variant ?? null,
        appliedAt: now,
        recordedAt: now,
        source: found?.runId ?? 'manual',
        status: 'applied',
      };

      await appendApplication(file, record);
      ctx.emit(`Logged ${record.jobId} as applied.`, () => ({ ok: true, record }));
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
      const human = [
        `${first}  ${last.company ?? '?'} - ${last.title ?? '?'}`,
        `url: ${last.url ?? '-'}`,
        `variant: ${last.variant ?? '-'}`,
        'history:',
        ...history.map((record) => `  ${record.recordedAt}  ${record.status}`),
        `notes:${notes.length ? '' : ' none'}`,
        ...notes.map((note) => `  ${note.noteId}  ${note.title}`),
        ...(files.length ? [`files: ${files.map((f) => f.name).join(', ')}`] : []),
      ].join('\n');
      ctx.emit(human, () => ({
        ok: true,
        jobId: first,
        history,
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
