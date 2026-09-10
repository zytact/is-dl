import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vite-plus/test';
import type { CliBase } from '../cli-context.ts';
import { type Note, readJobNotes, writeNote } from '../notes.ts';
import { resolvePaths } from '../paths.ts';
import { notesCommand } from './notes.ts';

const REF = { source: 'unstop', jobId: '4055' } as const;

/** A CLI base rooted in a fresh temp data directory holding one note. */
async function base(): Promise<CliBase> {
  const home = await mkdtemp(join(tmpdir(), 'is-dl-notes-cmd-'));
  const env = {
    XDG_CONFIG_HOME: join(home, 'config'),
    XDG_DATA_HOME: join(home, 'data'),
    XDG_STATE_HOME: join(home, 'state'),
    XDG_CACHE_HOME: join(home, 'cache'),
  } satisfies NodeJS.ProcessEnv;

  const paths = resolvePaths(env, home, 'linux');
  await writeNote(paths, {
    ...REF,
    title: 'Comp and process',
    url: 'https://ex.com/doc',
    company: 'Acme',
    role: 'Backend Intern',
    createdAt: '2026-09-03T10:15:00.000Z',
    body: 'Stipend is 40k a month.\n',
  });
  return { paths, cwd: home, env, signal: new AbortController().signal };
}

async function edit(argv: string[]): Promise<Note> {
  const ctx = await base();
  await notesCommand(ctx, ['edit', '4055', '--quiet', ...argv]);
  const [note] = await readJobNotes(ctx.paths, REF);
  return note!;
}

describe('notes edit', () => {
  test('replaces the body from --text and keeps the front matter', async () => {
    const note = await edit(['--text', 'They raised it.\n']);

    expect(note.body).toBe('They raised it.\n');
    expect(note.title).toBe('Comp and process');
    expect(note.url).toBe('https://ex.com/doc');
    expect(note.company).toBe('Acme');
  });

  test('a title-only edit leaves the body alone instead of asking for one', async () => {
    const note = await edit(['--title', 'Comp, after the call']);

    expect(note.title).toBe('Comp, after the call');
    expect(note.body).toBe('Stipend is 40k a month.\n');
    expect(note.noteId).toBe('20260903T101500Z-comp-and-process');
  });

  test('a url-only edit leaves the body alone', async () => {
    const note = await edit(['--url', 'https://ex.com/other']);

    expect(note.url).toBe('https://ex.com/other');
    expect(note.body).toBe('Stipend is 40k a month.\n');
  });

  test('leaves the file alone when the text comes back unchanged', async () => {
    const ctx = await base();
    const [before] = await readJobNotes(ctx.paths, REF);
    const stamp = (await stat(before!.file)).mtimeMs;

    await notesCommand(ctx, ['edit', '4055', '--quiet', '--text', before!.body]);

    expect((await stat(before!.file)).mtimeMs).toBe(stamp);
  });

  test('refuses a job whose id names more than one note', async () => {
    const ctx = await base();
    await writeNote(ctx.paths, {
      ...REF,
      title: 'Recruiter email',
      url: null,
      company: null,
      role: null,
      createdAt: '2026-09-04T10:15:00.000Z',
      body: 'They emailed.\n',
    });

    await expect(notesCommand(ctx, ['edit', '4055', '--quiet', '--text', 'x'])).rejects.toThrow(
      /has 2 notes/,
    );
  });
});
