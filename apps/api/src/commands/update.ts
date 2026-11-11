import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import type { CliBase } from '../cli-context.ts';
import { CliError } from '../errors.ts';
import { releaseDownloadUrl } from '../update.ts';
import { GLOBAL_OPTIONS, usage } from './shared.ts';

/** Runs the latest release's install.sh, which installs that release beside the current one. */
export async function updateCommand(base: CliBase, argv: string[]): Promise<void> {
  usage(() => parseArgs({ args: argv, options: GLOBAL_OPTIONS }));
  if (process.platform === 'win32') {
    throw new CliError(
      'ERROR',
      'is-dl update is not available on Windows. Build is-dl from a checkout instead.',
    );
  }

  const url = `${releaseDownloadUrl(base.env)}/install.sh`;
  const response = await fetch(url, { signal: base.signal });
  if (!response.ok)
    throw new CliError('ERROR', `Could not download ${url}: HTTP ${response.status}`);
  const script = await response.text();

  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn('sh', ['-s'], {
      env: base.env,
      signal: base.signal,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    child.once('error', reject);
    child.once('close', resolve);
    child.stdin.end(script);
  });
  if (code !== 0) throw new CliError('ERROR', `The installer exited with ${code}.`);
}
