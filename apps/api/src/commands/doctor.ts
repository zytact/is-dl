import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { buildCtx, type CliBase } from '../cli-context.ts';
import { CliError } from '../errors.ts';
import { chromiumExecutable } from '../linkedin/browser.ts';
import { whichSync } from '../which.ts';
import { GLOBAL_OPTIONS, usage } from './shared.ts';

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export async function doctorCommand(base: CliBase, argv: string[]): Promise<void> {
  const { values } = usage(() => parseArgs({ args: argv, options: GLOBAL_OPTIONS }));
  const ctx = await buildCtx(base, values);

  const major = Number(process.versions.node.split('.')[0]);
  const browser = chromiumExecutable();
  const session = existsSync(ctx.paths.sessionFile);
  const tectonic = whichSync('tectonic');
  const pdftotext = whichSync('pdftotext');

  const checks: Check[] = [
    { name: 'node', ok: major >= 24, detail: `v${process.versions.node} (need >=24)` },
    {
      name: 'chromium',
      ok: browser !== null,
      detail: browser ?? 'missing, run: npx playwright install chromium',
    },
    {
      name: 'session',
      ok: session,
      detail: session ? ctx.paths.sessionFile : 'none, run: is-dl login',
    },
    {
      name: 'config',
      ok: true,
      detail: ctx.config.file ?? `${ctx.paths.configFile} (not created)`,
    },
    {
      name: 'tectonic',
      ok: tectonic !== null,
      detail:
        tectonic ??
        'missing, needed for is-dl resume build. Install from https://tectonic-typesetting.github.io/install.html (no sudo)',
    },
    {
      name: 'pdftotext',
      ok: pdftotext !== null,
      detail:
        pdftotext ?? 'missing, needed for the resume text extraction gate. Install poppler-utils',
    },
    { name: 'runs', ok: true, detail: ctx.paths.runsDir },
    { name: 'notes', ok: true, detail: ctx.paths.notesDir },
    { name: 'cache', ok: true, detail: ctx.paths.cache },
  ];

  const ok = checks.every((check) => check.ok);
  ctx.emit(
    checks.map((c) => `${c.ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(9)} ${c.detail}`).join('\n'),
    () => ({ ok, checks }),
  );

  if (!ok) {
    const dependency = browser === null || tectonic === null;
    throw new CliError(dependency ? 'DEPENDENCY' : 'AUTH_REQUIRED', 'doctor found problems', {
      silent: true,
    });
  }
}
