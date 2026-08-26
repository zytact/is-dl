import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { buildCtx, type CliBase } from '../cli-context.ts';
import { CliError } from '../errors.ts';
import { closeBrowser, launchBrowser, migrateLegacySession } from '../linkedin/browser.ts';
import { GLOBAL_OPTIONS, usage } from './shared.ts';

const LOGIN_OPTIONS = { headless: { type: 'boolean' } } as const;

export async function loginCommand(base: CliBase, argv: string[]): Promise<void> {
  const { values } = usage(() =>
    parseArgs({ args: argv, options: { ...GLOBAL_OPTIONS, ...LOGIN_OPTIONS } }),
  );
  const ctx = await buildCtx(base, values);

  await migrateLegacySession(ctx.paths.sessionFile, ctx.cwd, ctx.log);
  if (existsSync(ctx.paths.sessionFile)) {
    ctx.emit(`Already logged in. Session: ${ctx.paths.sessionFile}`, () => ({
      ok: true,
      session: ctx.paths.sessionFile,
      status: 'existing',
    }));
    return;
  }

  if (!process.stdin.isTTY) {
    throw new CliError('AUTH_REQUIRED', 'is-dl login needs an interactive terminal.');
  }

  const session = await launchBrowser({
    sessionFile: ctx.paths.sessionFile,
    headless: values.headless ?? false,
    onLog: ctx.log,
    interactive: true,
  });
  await closeBrowser(session, ctx.paths.sessionFile, ctx.log);

  ctx.emit(`Logged in. Session saved to ${ctx.paths.sessionFile}`, () => ({
    ok: true,
    session: ctx.paths.sessionFile,
    status: 'created',
  }));
}

export async function logoutCommand(base: CliBase, argv: string[]): Promise<void> {
  const { values } = usage(() => parseArgs({ args: argv, options: GLOBAL_OPTIONS }));
  const ctx = await buildCtx(base, values);

  const removed = existsSync(ctx.paths.sessionFile);
  if (removed) await unlink(ctx.paths.sessionFile);

  ctx.emit(removed ? `Removed ${ctx.paths.sessionFile}` : 'No stored session.', () => ({
    ok: true,
    removed,
    session: ctx.paths.sessionFile,
  }));
}
