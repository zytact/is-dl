import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { CliBase } from '../cli-context.ts';
import { CliError } from '../errors.ts';
import { releaseDownloadUrl } from '../update.ts';
import { GLOBAL_OPTIONS, usage } from './shared.ts';

/** The release's install script for this platform and the command that runs it from a file. */
export const INSTALLER =
  process.platform === 'win32'
    ? {
        name: 'install.ps1',
        command: 'powershell',
        args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File'],
      }
    : { name: 'install.sh', command: 'sh', args: [] };

/**
 * Drops PowerShell 7's PSModulePath, which stops Windows PowerShell loading its own modules.
 * Windows matches variable names in any case.
 */
export function installerEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => name.toUpperCase() !== 'PSMODULEPATH'),
  );
}

/** Runs the latest release's install script, which installs that release beside the current one. */
export async function updateCommand(base: CliBase, argv: string[]): Promise<void> {
  const { values } = usage(() => parseArgs({ args: argv, options: GLOBAL_OPTIONS }));
  if (values.json) throw new CliError('USAGE', 'is-dl update has no JSON output.');

  const url = `${releaseDownloadUrl(base.env)}/${INSTALLER.name}`;
  const response = await fetch(url, { signal: base.signal });
  if (!response.ok) {
    throw new CliError('ERROR', `Could not download ${url}: HTTP ${response.status}`);
  }

  const directory = await mkdtemp(join(tmpdir(), 'is-dl-update-'));
  try {
    const script = join(directory, INSTALLER.name);
    await writeFile(script, await response.text());
    const exit = await new Promise<number | NodeJS.Signals | null>((resolve, reject) => {
      const child = spawn(INSTALLER.command, [...INSTALLER.args, script], {
        env: installerEnv(base.env),
        signal: base.signal,
        stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('close', (code, signal) => resolve(code ?? signal));
    });
    if (exit !== 0) throw new CliError('ERROR', `The installer stopped with ${exit}.`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
