import { existsSync } from 'node:fs';
import { copyFile, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { CliError } from './errors.ts';
import { ensureDir, isSafeFileName } from './fs.ts';
import type { AppPaths } from './paths.ts';
import { JOB_SOURCES, type JobSource } from './types.ts';

export interface JobRef {
  source: JobSource;
  jobId: string;
}

/** What a note file carries. Its id and path live outside the file, in the path itself. */
export interface NoteFields {
  title: string;
  url: string | null;
  company: string | null;
  role: string | null;
  createdAt: string | null;
  body: string;
}

export interface NoteMeta extends JobRef, Omit<NoteFields, 'body'> {
  noteId: string;
  file: string;
}

export interface Note extends NoteMeta {
  body: string;
}

export interface NewNote extends JobRef, Omit<NoteFields, 'createdAt'> {
  createdAt: string;
}

/**
 * The parts of a note an edit may replace. Everything else is carried over unchanged.
 * No field is nullable: an edit sets a value or says nothing, and there is no way to
 * clear a url back to nothing, because a note that came from somewhere still did.
 */
export interface NoteEdit {
  title?: string;
  url?: string;
  body?: string;
}

export interface NoteUpdate {
  note: Note;
  /** False when the edit named nothing new, so the file was left as it was. */
  changed: boolean;
}

export interface Attachment {
  name: string;
  file: string;
  bytes: number;
}

function assertSafeId(kind: 'Job' | 'Note', id: string): string {
  if (!isSafeFileName(id)) {
    throw new CliError('USAGE', `${kind} id "${id}" is not a name a file can be stored under.`);
  }
  return id;
}

export function jobNotesDir(paths: AppPaths, ref: JobRef): string {
  return join(paths.notesDir, ref.source, assertSafeId('Job', ref.jobId));
}

export function attachmentsDir(paths: AppPaths, ref: JobRef): string {
  return join(jobNotesDir(paths, ref), 'files');
}

export function noteFile(paths: AppPaths, ref: JobRef, noteId: string): string {
  return join(jobNotesDir(paths, ref), `${assertSafeId('Note', noteId)}.md`);
}

function slug(title: string): string {
  const kebab = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');
  return kebab || 'note';
}

function stamp(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function isoFromStamp(noteId: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(noteId);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`;
}

export function noteId(title: string, createdAt: string): string {
  return `${stamp(createdAt)}-${slug(title)}`;
}

export function titleFromBody(body: string): string {
  const first = body
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find((line) => line.length > 0);
  return first ? first.slice(0, 60) : 'note';
}

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

export function serializeNote(note: NoteFields): string {
  const front = stringifyYaml({
    title: note.title,
    url: note.url,
    company: note.company,
    role: note.role,
    createdAt: note.createdAt,
  });
  return `---\n${front}---\n${note.body}`;
}

function readString(front: Record<string, unknown>, key: string): string | null {
  const value = front[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

export function parseNote(ref: JobRef, id: string, file: string, text: string): Note {
  const match = FRONT_MATTER.exec(text);
  const body = match ? text.slice(match[0].length) : text;
  let front: Record<string, unknown> = {};
  if (match) {
    const yaml = match[0].replace(/^---\r?\n/, '').replace(/---\r?\n$/, '');
    const parsed: unknown = parseYaml(yaml);
    if (typeof parsed === 'object' && parsed !== null) front = parsed as Record<string, unknown>;
  }
  return {
    ...ref,
    noteId: id,
    title: readString(front, 'title') ?? titleFromBody(body),
    url: readString(front, 'url'),
    company: readString(front, 'company'),
    role: readString(front, 'role'),
    createdAt: readString(front, 'createdAt') ?? isoFromStamp(id),
    file,
    body,
  };
}

export function noteMeta(note: Note): NoteMeta {
  const { body: _body, ...meta } = note;
  return meta;
}

export function byNewest(a: NoteMeta, b: NoteMeta): number {
  if (a.createdAt === b.createdAt) return b.noteId.localeCompare(a.noteId);
  if (!a.createdAt) return 1;
  if (!b.createdAt) return -1;
  return b.createdAt.localeCompare(a.createdAt);
}

function safeFileName(name: string): string {
  const cleaned = basename(name)
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+/, '');
  if (!cleaned) throw new CliError('USAGE', `"${name}" leaves nothing usable as a file name.`);
  return cleaned;
}

async function freeName(dir: string, stem: string, ext: string): Promise<string> {
  for (let n = 1; ; n++) {
    const name = n === 1 ? `${stem}${ext}` : `${stem}-${n}${ext}`;
    if (!existsSync(join(dir, name))) return name;
  }
}

export async function writeNote(paths: AppPaths, note: NewNote): Promise<Note> {
  const dir = jobNotesDir(paths, note);
  await ensureDir(dir);
  const name = await freeName(dir, noteId(note.title, note.createdAt), '.md');
  const file = join(dir, name);
  await writeFile(file, serializeNote(note), 'utf-8');
  return { ...note, noteId: name.slice(0, -3), file };
}

export async function readNote(paths: AppPaths, ref: JobRef, id: string): Promise<Note> {
  const file = noteFile(paths, ref, id);
  if (!existsSync(file)) {
    throw new CliError('ERROR', `No note "${id}" for ${ref.source}:${ref.jobId}.`);
  }
  return parseNote(ref, id, file, await readFile(file, 'utf-8'));
}

/**
 * Rewrites a note in place. The file name is the note's identity, so a new title
 * changes the front matter and never the path. An edit that says nothing the note
 * does not already say leaves the file untouched and reports `changed: false`,
 * which is how a caller tells a real edit from an editor that never blocked.
 */
export async function updateNote(
  paths: AppPaths,
  ref: JobRef,
  id: string,
  edit: NoteEdit,
): Promise<NoteUpdate> {
  const current = await readNote(paths, ref, id);
  const note: Note = {
    ...current,
    title: edit.title ?? current.title,
    url: edit.url ?? current.url,
    body: edit.body ?? current.body,
  };
  const changed =
    note.title !== current.title || note.url !== current.url || note.body !== current.body;
  if (changed) await writeFile(note.file, serializeNote(note), 'utf-8');
  return { note, changed };
}

export async function readJobNotes(paths: AppPaths, ref: JobRef): Promise<Note[]> {
  const dir = jobNotesDir(paths, ref);
  if (!existsSync(dir)) return [];
  const notes: Note[] = [];
  for (const entry of await readdir(dir)) {
    if (!entry.endsWith('.md')) continue;
    const file = join(dir, entry);
    notes.push(parseNote(ref, entry.slice(0, -3), file, await readFile(file, 'utf-8')));
  }
  return notes.sort(byNewest);
}

export async function listNotes(
  paths: AppPaths,
  filter: { source?: JobSource; jobId?: string } = {},
): Promise<Note[]> {
  const sources = filter.source ? [filter.source] : JOB_SOURCES;
  const notes: Note[] = [];
  for (const source of sources) {
    if (filter.jobId) {
      notes.push(...(await readJobNotes(paths, { source, jobId: filter.jobId })));
      continue;
    }
    const dir = join(paths.notesDir, source);
    if (!existsSync(dir)) continue;
    for (const jobId of await readdir(dir)) {
      notes.push(...(await readJobNotes(paths, { source, jobId })));
    }
  }
  return notes.sort(byNewest);
}

export function notedSources(paths: AppPaths, jobId: string): JobSource[] {
  return JOB_SOURCES.filter((source) => existsSync(jobNotesDir(paths, { source, jobId })));
}

export async function removeNote(paths: AppPaths, ref: JobRef, id: string): Promise<string> {
  const file = noteFile(paths, ref, id);
  if (!existsSync(file)) {
    throw new CliError('ERROR', `No note "${id}" for ${ref.source}:${ref.jobId}.`);
  }
  await unlink(file);
  return file;
}

export async function attachFile(
  paths: AppPaths,
  ref: JobRef,
  from: string,
  as?: string,
): Promise<Attachment> {
  if (!existsSync(from)) throw new CliError('ERROR', `No file at ${from}.`);
  const dir = attachmentsDir(paths, ref);
  await ensureDir(dir);
  const wanted = safeFileName(as ?? basename(from));
  const ext = extname(wanted);
  const name = await freeName(dir, wanted.slice(0, wanted.length - ext.length), ext);
  const file = join(dir, name);
  await copyFile(from, file);
  return { name, file, bytes: (await stat(file)).size };
}

export async function listAttachments(paths: AppPaths, ref: JobRef): Promise<Attachment[]> {
  const dir = attachmentsDir(paths, ref);
  if (!existsSync(dir)) return [];
  const files: Attachment[] = [];
  for (const name of (await readdir(dir)).sort()) {
    const file = join(dir, name);
    files.push({ name, file, bytes: (await stat(file)).size });
  }
  return files;
}

export async function removeAttachment(
  paths: AppPaths,
  ref: JobRef,
  name: string,
): Promise<string> {
  const file = join(attachmentsDir(paths, ref), safeFileName(name));
  if (!existsSync(file)) {
    throw new CliError('ERROR', `No file "${name}" for ${ref.source}:${ref.jobId}.`);
  }
  await unlink(file);
  return file;
}
