import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildCtx, type CliBase, type Ctx } from '../cli-context.ts';
import { CliError } from '../errors.ts';
import {
  type Attachment,
  attachFile,
  jobNotesDir,
  listAttachments,
  listNotes,
  type Note,
  noteMeta,
  notedSources,
  readNote,
  removeAttachment,
  removeNote,
  titleFromBody,
  writeNote,
} from '../notes.ts';
import { expandHome } from '../paths.ts';
import type { JobSource } from '../types.ts';
import { findJob, GLOBAL_OPTIONS, readSourceFlag, usage } from './shared.ts';

const NOTES_OPTIONS = {
  source: { type: 'string', short: 's' },
  title: { type: 'string', short: 't' },
  url: { type: 'string', short: 'u' },
  text: { type: 'string' },
  file: { type: 'string', short: 'f' },
  as: { type: 'string' },
  note: { type: 'string', short: 'n' },
  'from-run': { type: 'string' },
} as const;

async function readBody(ctx: Ctx, values: { text?: string; file?: string }): Promise<string> {
  if (values.text !== undefined && values.file !== undefined) {
    throw new CliError('USAGE', 'Pass --text or --file, not both.');
  }
  const body =
    values.text ??
    (values.file
      ? await readFile(resolve(ctx.cwd, expandHome(values.file)), 'utf-8')
      : await readStdin());
  if (!body.trim()) throw new CliError('USAGE', 'The note is empty.');
  return body;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new CliError('USAGE', 'No note text. Pass --text, --file <path>, or pipe it on stdin.');
  }
  process.stdin.setEncoding('utf-8');
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function resolveSource(
  ctx: Ctx,
  jobId: string,
  flag: JobSource | undefined,
  fromRun?: string,
): Promise<JobSource> {
  if (flag) return flag;
  const noted = notedSources(ctx.paths, jobId);
  if (noted.length === 1) return noted[0]!;
  if (noted.length > 1) {
    throw new CliError('USAGE', `${jobId} has notes on ${noted.join(' and ')}. Pass --source.`);
  }
  const found = await findJob(ctx, jobId, fromRun, undefined);
  if (found) return found.job.source;
  throw new CliError('USAGE', `No run holds ${jobId}, so its board is unknown. Pass --source.`);
}

function line(note: Note): string {
  const id = `${note.source}:${note.jobId}`;
  return `${note.noteId.padEnd(44)} ${id.padEnd(21)} ${note.title}`;
}

function render(note: Note, files: Attachment[]): string {
  return [
    `${note.noteId}  ${note.source}:${note.jobId}`,
    `title: ${note.title}`,
    `url: ${note.url ?? '-'}`,
    `job: ${note.company ?? '?'} - ${note.role ?? '?'}`,
    `file: ${note.file}`,
    ...(files.length ? [`files: ${files.map((f) => f.name).join(', ')}`] : []),
    '',
    note.body,
  ].join('\n');
}

export async function notesCommand(base: CliBase, argv: string[]): Promise<void> {
  const { values, positionals } = usage(() =>
    parseArgs({
      args: argv,
      options: { ...GLOBAL_OPTIONS, ...NOTES_OPTIONS },
      allowPositionals: true,
    }),
  );
  const ctx = await buildCtx(base, values);
  const [sub, first] = positionals;
  const flagSource = readSourceFlag(values.source);

  switch (sub) {
    case 'add': {
      if (!first) {
        throw new CliError('USAGE', 'Usage: is-dl notes add <jobId> [--title t] [--file f]');
      }
      const body = await readBody(ctx, values);
      const found = await findJob(ctx, first, values['from-run'], flagSource);
      const source = flagSource ?? found?.job.source;
      if (!source) {
        throw new CliError(
          'USAGE',
          `No run holds ${first}, so its board is unknown. Pass --source.`,
        );
      }

      const note = await writeNote(ctx.paths, {
        source,
        jobId: first,
        title: values.title ?? titleFromBody(body),
        url: values.url ?? null,
        company: found?.job.companyName ?? null,
        role: found?.job.title ?? null,
        createdAt: new Date().toISOString(),
        body,
      });
      ctx.emit(`Saved ${note.noteId} to ${note.file}`, () => ({ ok: true, note: noteMeta(note) }));
      return;
    }
    case 'attach': {
      if (!first || !values.file) {
        throw new CliError('USAGE', 'Usage: is-dl notes attach <jobId> --file <path> [--as name]');
      }
      const source = await resolveSource(ctx, first, flagSource, values['from-run']);
      const attached = await attachFile(
        ctx.paths,
        { source, jobId: first },
        resolve(ctx.cwd, expandHome(values.file)),
        values.as,
      );
      ctx.emit(`Attached ${attached.name} to ${source}:${first}`, () => ({
        ok: true,
        file: attached,
      }));
      return;
    }
    case undefined:
    case 'list': {
      const notes = await listNotes(ctx.paths, { source: flagSource, jobId: first });
      ctx.emit(notes.length ? notes.map(line).join('\n') : 'No notes saved.', () => ({
        ok: true,
        notes: notes.map(noteMeta),
      }));
      return;
    }
    case 'show': {
      if (!first) throw new CliError('USAGE', 'Usage: is-dl notes show <jobId> [--note <noteId>]');
      const source = await resolveSource(ctx, first, flagSource);
      const ref = { source, jobId: first };
      const notes = values.note
        ? [await readNote(ctx.paths, ref, values.note)]
        : await listNotes(ctx.paths, { source, jobId: first });
      const files = await listAttachments(ctx.paths, ref);
      if (!notes.length && !files.length) {
        throw new CliError('ERROR', `Nothing saved for ${source}:${first}.`);
      }
      const human = notes.length
        ? notes.map((note) => render(note, files)).join('\n\n---\n\n')
        : `${source}:${first} has only files: ${files.map((f) => f.name).join(', ')}`;
      ctx.emit(human, () => ({ ok: true, notes, files }));
      return;
    }
    case 'path': {
      if (!first) throw new CliError('USAGE', 'Usage: is-dl notes path <jobId> [--note <noteId>]');
      const source = await resolveSource(ctx, first, flagSource, values['from-run']);
      const path = values.note
        ? (await readNote(ctx.paths, { source, jobId: first }, values.note)).file
        : jobNotesDir(ctx.paths, { source, jobId: first });
      ctx.emit(path, () => ({ ok: true, path }));
      return;
    }
    case 'rm': {
      if (!first || (!values.note && !values.as)) {
        throw new CliError('USAGE', 'Usage: is-dl notes rm <jobId> --note <noteId> | --as <file>');
      }
      const source = await resolveSource(ctx, first, flagSource);
      const ref = { source, jobId: first };
      const removed = values.note
        ? await removeNote(ctx.paths, ref, values.note)
        : await removeAttachment(ctx.paths, ref, values.as!);
      ctx.emit(`Deleted ${removed}`, () => ({ ok: true, deleted: removed }));
      return;
    }
    default:
      throw new CliError(
        'USAGE',
        `Unknown notes subcommand "${sub}". Try add, attach, list, show, path, or rm.`,
      );
  }
}
