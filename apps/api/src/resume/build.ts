import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CliError } from '../errors.ts';
import { ensureDir } from '../runs.ts';
import { renderBody } from './latex.ts';
import {
  parseResume,
  parseVariants,
  type ResolvedVariant,
  type Resume,
  resolveVariant,
  type Variants,
} from './schema.ts';

export interface ResumeProject {
  dir: string;
  resume: Resume;
  variants: Variants;
  preamble: string;
}

export const RESUME_FILES = {
  resume: 'resume.yaml',
  variants: 'variants.yaml',
  preamble: 'preamble.tex',
} as const;

export async function loadProject(dir: string): Promise<ResumeProject> {
  const missing = Object.values(RESUME_FILES).filter((name) => !existsSync(join(dir, name)));
  if (missing.length) {
    throw new CliError('CONFIG', `Missing ${missing.join(', ')} in ${dir}. Run: is-dl resume init`);
  }
  const read = (name: string) => readFile(join(dir, name), 'utf-8');
  return {
    dir,
    resume: parseResume(await read(RESUME_FILES.resume), RESUME_FILES.resume),
    variants: parseVariants(await read(RESUME_FILES.variants), RESUME_FILES.variants),
    preamble: await read(RESUME_FILES.preamble),
  };
}

export function selectVariant(project: ResumeProject, name: string): ResolvedVariant {
  const variant = project.variants[name];
  if (!variant) {
    const known = Object.keys(project.variants);
    throw new CliError(
      'CONFIG',
      `Unknown variant "${name}". ${known.length ? `Available: ${known.join(', ')}` : 'None defined.'}`,
    );
  }
  return resolveVariant(project.resume, variant);
}

function document(preamble: string, body: string): string {
  return `${preamble.trimEnd()}\n\n${body}\n\n\\end{document}\n`;
}

export function renderVariant(project: ResumeProject, variant: ResolvedVariant): string {
  return document(project.preamble, renderBody({ basics: project.resume.basics, variant }));
}

const PAGE_COUNT = /Output written on .*\((\d+) pages?/;

export function parsePageCount(log: string): number | null {
  const match = PAGE_COUNT.exec(log);
  return match ? Number(match[1]) : null;
}

export interface TectonicResult {
  pdf: string;
  log: string;
  pages: number;
}

async function run(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.stdout.resume();
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stderr }));
  });
}

export function tectonicMissing(): CliError {
  return new CliError(
    'DEPENDENCY',
    'tectonic not found. Install it from https://tectonic-typesetting.github.io/install.html ' +
      '(cargo install tectonic, brew install tectonic, or the prebuilt binary). Never with sudo.',
  );
}

/** Compiles one .tex file and returns the parsed page count from the LaTeX log. */
export async function compile(tex: string, outDir: string, name: string): Promise<TectonicResult> {
  await ensureDir(outDir);
  const texPath = join(outDir, `${name}.tex`);
  await writeFile(texPath, tex, 'utf-8');

  let result: { code: number; stderr: string };
  try {
    result = await run(
      'tectonic',
      ['--keep-logs', '--outdir', outDir, '--chatter', 'minimal', texPath],
      outDir,
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw tectonicMissing();
    throw err;
  }

  const logPath = join(outDir, `${name}.log`);
  const log = existsSync(logPath) ? await readFile(logPath, 'latin1') : result.stderr;
  if (result.code !== 0) {
    throw new CliError('ERROR', `tectonic failed for "${name}".\n${tail(log || result.stderr)}`);
  }

  const pages = parsePageCount(log);
  if (pages === null) {
    throw new CliError('ERROR', `Could not read the page count from ${logPath}.`);
  }
  return { pdf: join(outDir, `${name}.pdf`), log, pages };
}

function tail(text: string, lines = 25): string {
  return text.split('\n').slice(-lines).join('\n');
}

/**
 * Binary search would be cleverer, but a linear walk names the exact section
 * that first spills onto page two, which is what the message needs to say.
 */
export async function findOverflowSection(
  project: ResumeProject,
  variant: ResolvedVariant,
  outDir: string,
): Promise<string | null> {
  for (let i = 1; i <= variant.sections.length; i++) {
    const partial: ResolvedVariant = { ...variant, sections: variant.sections.slice(0, i) };
    const tex = renderVariant(project, partial);
    const { pages } = await compile(tex, outDir, `overflow-${i}`);
    if (pages > 1) return variant.sections[i - 1]!.title;
  }
  return null;
}

export interface ExtractionCheck {
  ok: boolean;
  missing: string[];
}

function normalize(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase();
}

/** The first words of a bullet are enough to prove the text stream is intact. */
function probes(variant: ResolvedVariant): string[] {
  const items = variant.sections.flatMap((section) => section.items);
  return items.flatMap((item) =>
    item.kind === 'entry'
      ? [item.role, ...item.bullets.map((bullet) => bullet.text.slice(0, 40))]
      : [item.text.slice(0, 40)],
  );
}

export async function checkExtraction(
  pdf: string,
  variant: ResolvedVariant,
  name: string,
): Promise<ExtractionCheck | null> {
  let text: string;
  try {
    const child = spawn('pdftotext', ['-layout', pdf, '-'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    text = await new Promise<string>((resolve, reject) => {
      let out = '';
      child.stdout.on('data', (chunk: Buffer) => {
        out += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve(out) : reject(new Error(`pdftotext exited ${code}`)),
      );
    });
  } catch {
    return null;
  }

  const haystack = normalize(text);
  const missing = [name, ...probes(variant)]
    .map(normalize)
    .filter((probe) => probe.length > 3 && !haystack.includes(probe));
  return { ok: missing.length === 0, missing };
}
