import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildCtx, type CliBase, type Ctx } from '../cli-context.ts';
import { resolveResumeDir } from '../config.ts';
import { CliError } from '../errors.ts';
import {
  checkExtraction,
  compile,
  findOverflowSection,
  loadProject,
  RESUME_FILES,
  renderVariant,
  type ResumeProject,
  selectVariant,
} from '../resume/build.ts';
import { resolveVariant } from '../resume/schema.ts';
import { TEMPLATE_PREAMBLE, TEMPLATE_RESUME, TEMPLATE_VARIANTS } from '../resume/template.ts';
import { expandHome } from '../paths.ts';
import { ensureDir } from '../fs.ts';
import { GLOBAL_OPTIONS, usage } from './shared.ts';

const RESUME_OPTIONS = {
  variant: { type: 'string' },
  all: { type: 'boolean' },
  dir: { type: 'string' },
  out: { type: 'string', short: 'o' },
} as const;

interface BuildResult {
  variant: string;
  pdf: string;
  pages: number;
  extraction: { ok: boolean; missing: string[] } | null;
}

async function buildOne(
  ctx: Ctx,
  project: ResumeProject,
  name: string,
  outDir: string,
): Promise<BuildResult> {
  const variant = selectVariant(project, name);
  ctx.log(`Building ${name}...`);

  const variantDir = join(outDir, name);
  const result = await compile(renderVariant(project, variant), variantDir, 'resume');

  if (result.pages > 1) {
    const culprit = await findOverflowSection(project, variant, join(variantDir, 'overflow'));
    throw new CliError(
      'ERROR',
      `Variant "${name}" is ${result.pages} pages. The "${culprit ?? 'last'}" section pushed it over. ` +
        'Drop items in variants.yaml until it fits.',
    );
  }

  const extraction = await checkExtraction(result.pdf, variant, project.resume.basics.name);
  if (!extraction) {
    throw new CliError(
      'DEPENDENCY',
      'pdftotext not found, so the text extraction gate cannot run. ' +
        'Install poppler-utils, or run is-dl doctor for details.',
    );
  }
  if (!extraction.ok) {
    throw new CliError(
      'ERROR',
      `Variant "${name}" produced a PDF where ${extraction.missing.length} text probe(s) are not extractable: ` +
        `${extraction.missing.slice(0, 3).join(' | ')}`,
    );
  }

  return { variant: name, pdf: result.pdf, pages: result.pages, extraction };
}

async function initProject(ctx: Ctx, dir: string, buildDir: string): Promise<void> {
  await ensureDir(dir);
  const files = [
    [RESUME_FILES.preamble, TEMPLATE_PREAMBLE],
    [RESUME_FILES.resume, TEMPLATE_RESUME],
    [RESUME_FILES.variants, TEMPLATE_VARIANTS],
  ] as const;

  const written: string[] = [];
  const skipped: string[] = [];
  for (const [name, content] of files) {
    const path = join(dir, name);
    if (existsSync(path)) {
      skipped.push(name);
      continue;
    }
    await writeFile(path, content, 'utf-8');
    written.push(name);
  }

  ctx.emit(
    [
      ...written.map((name) => `created ${join(dir, name)}`),
      ...skipped.map((name) => `kept    ${join(dir, name)}`),
      `builds go to ${buildDir}`,
    ].join('\n'),
    () => ({ ok: true, dir, buildDir, written, skipped }),
  );
}

export async function resumeCommand(base: CliBase, argv: string[]): Promise<void> {
  const { values, positionals } = usage(() =>
    parseArgs({
      args: argv,
      options: { ...GLOBAL_OPTIONS, ...RESUME_OPTIONS },
      allowPositionals: true,
    }),
  );
  const ctx = await buildCtx(base, values);
  const dir = resolveResumeDir({
    config: ctx.config,
    env: ctx.env,
    flag: values.dir,
    cwd: ctx.cwd,
    fallback: ctx.paths.resumeDir,
  });
  const outDir = values.out ? resolve(ctx.cwd, expandHome(values.out)) : ctx.paths.resumeBuildDir;
  const sub = positionals[0];

  if (sub === 'path') {
    ctx.emit(`input   ${dir}\noutput  ${outDir}`, () => ({ ok: true, input: dir, output: outDir }));
    return;
  }

  if (sub === 'init') {
    await initProject(ctx, dir, outDir);
    return;
  }

  const project = await loadProject(dir);

  switch (sub) {
    case 'check': {
      const variants = Object.values(project.variants).map((variant) => {
        const resolved = resolveVariant(project.resume, variant);
        return {
          name: variant.name,
          sections: resolved.sections.map((section) => section.title),
          items: resolved.sections.reduce((total, section) => total + section.items.length, 0),
        };
      });
      ctx.emit(
        variants
          .map((v) => `ok  ${v.name.padEnd(12)} ${v.items} items across ${v.sections.join(', ')}`)
          .join('\n') || 'No variants defined.',
        () => ({ ok: true, dir, variants }),
      );
      return;
    }
    case undefined:
    case 'build': {
      const names = values.all
        ? Object.keys(project.variants)
        : values.variant
          ? [values.variant]
          : [];
      if (!names.length) {
        throw new CliError('USAGE', 'Pass --variant <name> or --all.');
      }

      const built: BuildResult[] = [];
      for (const name of names) built.push(await buildOne(ctx, project, name, outDir));

      ctx.emit(
        built.map((result) => `${result.variant}: ${result.pages} page - ${result.pdf}`).join('\n'),
        () => ({ ok: true, built }),
      );
      return;
    }
    default:
      throw new CliError(
        'USAGE',
        `Unknown resume subcommand "${sub}". Try init, build, check, or path.`,
      );
  }
}
