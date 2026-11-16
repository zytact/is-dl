import { parseArgs } from 'node:util';
import { buildCtx, type CliBase } from '../cli-context.ts';
import { resolveCdp } from '../config.ts';
import { CliError } from '../errors.ts';
import { attachedLogin, chromiumExecutable, storedLogin } from '../linkedin/browser.ts';
import { whichSync } from '../which.ts';
import { GLOBAL_OPTIONS, usage } from './shared.ts';

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * The browser LinkedIn runs in and whether it is signed in. A session counts
 * only while it holds LinkedIn's login cookie, which LinkedIn deletes when it
 * revokes the session. A file that merely exists proves nothing.
 */
async function linkedinChecks(
  cdp: string | undefined,
  sessionFile: string,
): Promise<{ checks: Check[]; browserReady: boolean }> {
  if (!cdp) {
    const chromium = chromiumExecutable();
    const session = await storedLogin(sessionFile);
    const checks = [
      {
        name: 'chromium',
        ok: chromium !== null,
        detail: chromium ?? 'missing, run: npx playwright install chromium',
      },
      {
        name: 'session',
        ok: session,
        detail: session ? sessionFile : `no LinkedIn login in ${sessionFile}, run: is-dl login`,
      },
    ];
    return { checks, browserReady: chromium !== null };
  }

  try {
    const session = await attachedLogin(cdp);
    const checks = [
      { name: 'browser', ok: true, detail: cdp },
      {
        name: 'session',
        ok: session,
        detail: session
          ? `signed in to LinkedIn in the browser at ${cdp}`
          : `not signed in to LinkedIn, sign in in the browser at ${cdp}`,
      },
    ];
    return { checks, browserReady: true };
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    return { checks: [{ name: 'browser', ok: false, detail: error.message }], browserReady: false };
  }
}

export async function doctorCommand(base: CliBase, argv: string[]): Promise<void> {
  const { values } = usage(() =>
    parseArgs({ args: argv, options: { ...GLOBAL_OPTIONS, cdp: { type: 'string' } } }),
  );
  const ctx = await buildCtx(base, values);

  const major = Number(process.versions.node.split('.')[0]);
  const cdp = resolveCdp(ctx.config, ctx.env, values.cdp);
  const linkedin = await linkedinChecks(cdp, ctx.paths.sessionFile);
  const tectonic = whichSync('tectonic');
  const pdftotext = whichSync('pdftotext');

  const checks: Check[] = [
    { name: 'node', ok: major >= 24, detail: `v${process.versions.node} (need >=24)` },
    ...linkedin.checks,
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
    const dependency = !linkedin.browserReady || tectonic === null;
    throw new CliError(dependency ? 'DEPENDENCY' : 'AUTH_REQUIRED', 'doctor found problems', {
      silent: true,
    });
  }
}
