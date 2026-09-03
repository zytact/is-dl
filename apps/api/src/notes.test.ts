import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vite-plus/test';
import { ensureDir } from './fs.ts';
import {
  attachFile,
  jobNotesDir,
  listAttachments,
  listNotes,
  type NewNote,
  noteId,
  parseNote,
  readNote,
  removeAttachment,
  removeNote,
  titleFromBody,
  writeNote,
} from './notes.ts';
import type { AppPaths } from './paths.ts';

async function notesPaths(): Promise<AppPaths> {
  const data = await mkdtemp(join(tmpdir(), 'is-dl-notes-'));
  return { notesDir: join(data, 'notes') } as AppPaths;
}

function note(overrides: Partial<NewNote> = {}): NewNote {
  return {
    source: 'unstop',
    jobId: '4055',
    title: 'Comp and process',
    url: 'https://docs.google.com/document/d/abc',
    company: 'Acme',
    role: 'Backend Intern',
    createdAt: '2026-09-03T10:15:00.000Z',
    body: 'Stipend is 40k a month.\nThey interview in three rounds.',
    ...overrides,
  };
}

const UNSTOP_4055 = { source: 'unstop', jobId: '4055' } as const;

describe('storing the text', () => {
  test('round-trips the body and its metadata through the file', async () => {
    const paths = await notesPaths();
    const written = await writeNote(paths, note());

    expect(written.noteId).toBe('20260903T101500Z-comp-and-process');
    const read = await readNote(paths, UNSTOP_4055, written.noteId);
    expect(read.body).toBe('Stipend is 40k a month.\nThey interview in three rounds.');
    expect(read.url).toBe('https://docs.google.com/document/d/abc');
    expect(read.company).toBe('Acme');
    expect(read.role).toBe('Backend Intern');
    expect(read.createdAt).toBe('2026-09-03T10:15:00.000Z');
  });

  test('keeps the text byte for byte, including indentation and blank lines', async () => {
    const paths = await notesPaths();
    const body = '\n  leading blank line\n\n    indented code block\n\ntrailing spaces   \n\n\n';
    const written = await writeNote(paths, note({ body }));

    expect((await readNote(paths, UNSTOP_4055, written.noteId)).body).toBe(body);
  });

  test('leaves the body readable as plain markdown', async () => {
    const paths = await notesPaths();
    const written = await writeNote(paths, note({ body: '# Heading\n\nSome **text**.' }));

    expect(await readFile(written.file, 'utf-8')).toContain('# Heading\n\nSome **text**.');
  });

  test('gives two notes written in the same second their own files', async () => {
    const paths = await notesPaths();
    const first = await writeNote(paths, note());
    const second = await writeNote(paths, note({ body: 'Different text.' }));

    expect(second.noteId).toBe(`${first.noteId}-2`);
    expect((await readNote(paths, UNSTOP_4055, second.noteId)).body).toBe('Different text.');
  });

  test('keeps the same id on two boards apart', async () => {
    const paths = await notesPaths();
    await writeNote(paths, note({ source: 'unstop', body: 'Unstop text.' }));
    await writeNote(paths, note({ source: 'linkedin', body: 'LinkedIn text.' }));

    const notes = await listNotes(paths, { jobId: '4055' });
    expect(notes.map((n) => [n.source, n.body])).toEqual([
      ['linkedin', 'LinkedIn text.'],
      ['unstop', 'Unstop text.'],
    ]);
  });

  test('refuses a job id that would escape the notes directory', async () => {
    const paths = await notesPaths();
    expect(() => jobNotesDir(paths, { source: 'unstop', jobId: '../../etc' })).toThrow(
      /not a name/,
    );
  });
});

describe('listing and reading', () => {
  test('orders newest first across jobs and boards', async () => {
    const paths = await notesPaths();
    await writeNote(paths, note({ jobId: '1', createdAt: '2026-08-01T00:00:00.000Z' }));
    await writeNote(paths, note({ jobId: '2', createdAt: '2026-09-01T00:00:00.000Z' }));
    await writeNote(paths, note({ jobId: '3', createdAt: '2026-07-01T00:00:00.000Z' }));

    expect((await listNotes(paths)).map((n) => n.jobId)).toEqual(['2', '1', '3']);
  });

  test('reads a file dropped in by hand, front matter or not', async () => {
    const paths = await notesPaths();
    const dir = jobNotesDir(paths, { source: 'linkedin', jobId: '999' });
    await ensureDir(dir);
    await writeFile(join(dir, 'recruiter-email.md'), 'They emailed about the offer.\n', 'utf-8');

    const [read] = await listNotes(paths, { jobId: '999' });
    expect(read?.title).toBe('They emailed about the offer.');
    expect(read?.body).toBe('They emailed about the offer.\n');
    expect(read?.createdAt).toBeNull();
  });

  test('names the note when it is not there', async () => {
    const paths = await notesPaths();
    await expect(readNote(paths, UNSTOP_4055, 'nope')).rejects.toThrow(/No note "nope"/);
  });

  test('removing one leaves the others', async () => {
    const paths = await notesPaths();
    const first = await writeNote(paths, note({ title: 'One' }));
    await writeNote(paths, note({ title: 'Two' }));

    await removeNote(paths, UNSTOP_4055, first.noteId);
    expect((await listNotes(paths, { jobId: '4055' })).map((n) => n.title)).toEqual(['Two']);
  });
});

describe('attachments', () => {
  test('copies the bytes unchanged and keeps the extension', async () => {
    const paths = await notesPaths();
    const source = join(await mkdtemp(join(tmpdir(), 'is-dl-src-')), 'brief.pdf');
    const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x00, 0xff]);
    await writeFile(source, bytes);

    const attached = await attachFile(paths, UNSTOP_4055, source);
    expect(attached.name).toBe('brief.pdf');
    expect(await readFile(attached.file)).toEqual(bytes);
    expect(attached.bytes).toBe(bytes.length);
  });

  test('never lets a file name become a path, and never collides', async () => {
    const paths = await notesPaths();
    const dir = await mkdtemp(join(tmpdir(), 'is-dl-src-'));
    const source = join(dir, 'take home.docx');
    await writeFile(source, 'x');

    const first = await attachFile(paths, UNSTOP_4055, source);
    const second = await attachFile(paths, UNSTOP_4055, source, '../../escape.docx');
    expect(first.name).toBe('take-home.docx');
    expect(second.name).toBe('escape.docx');
    expect((await listAttachments(paths, UNSTOP_4055)).map((f) => f.name)).toEqual([
      'escape.docx',
      'take-home.docx',
    ]);

    await removeAttachment(paths, UNSTOP_4055, 'escape.docx');
    expect((await listAttachments(paths, UNSTOP_4055)).map((f) => f.name)).toEqual([
      'take-home.docx',
    ]);
  });

  test('stays out of the note listing', async () => {
    const paths = await notesPaths();
    const source = join(await mkdtemp(join(tmpdir(), 'is-dl-src-')), 'brief.pdf');
    await writeFile(source, 'x');
    await attachFile(paths, UNSTOP_4055, source);

    expect(await listNotes(paths, { jobId: '4055' })).toEqual([]);
  });
});

describe('titles', () => {
  test('falls back to the first line of the text', () => {
    expect(titleFromBody('\n\n## Hiring process\n\nRounds.')).toBe('Hiring process');
  });

  test('survives a title with nothing sluggable in it', () => {
    expect(noteId('!!!', '2026-09-03T10:15:00.000Z')).toBe('20260903T101500Z-note');
  });
});

describe('parsing', () => {
  test('ignores front matter that is not a mapping', () => {
    const parsed = parseNote(UNSTOP_4055, 'x', '/tmp/x.md', '---\n- a\n- b\n---\nBody.');
    expect(parsed.title).toBe('Body.');
    expect(parsed.body).toBe('Body.');
  });

  test('treats a body that opens with a rule as body', () => {
    const parsed = parseNote(UNSTOP_4055, 'x', '/tmp/x.md', '---\ntitle: T\n---\n---\nBody.');
    expect(parsed.title).toBe('T');
    expect(parsed.body).toBe('---\nBody.');
  });
});
