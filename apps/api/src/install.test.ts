import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { INSTALLER, installerEnv } from './commands/update.ts';

let root: string;
let server: Server;
let releaseUrl: string;

/**
 * Publishes a stand-in is-dl tarball. It brings its own `playwright` bin, which records the
 * browser install, so the test needs no registry and downloads no Chromium.
 */
async function publish(
  version: string,
  { corrupt = false, chromiumFails = false } = {},
): Promise<void> {
  const pkg = join(root, 'pkg', 'package');
  await rm(join(root, 'pkg'), { recursive: true, force: true });
  await mkdir(pkg, { recursive: true });
  await writeFile(
    join(pkg, 'package.json'),
    JSON.stringify({
      name: 'is-dl',
      version,
      bin: { 'is-dl': 'cli.js', playwright: 'playwright.js' },
    }),
  );
  await writeFile(join(pkg, 'cli.js'), `#!/usr/bin/env node\nconsole.log('${version}');\n`);
  await writeFile(
    join(pkg, 'playwright.js'),
    chromiumFails
      ? '#!/usr/bin/env node\nprocess.exit(1);\n'
      : `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(join(root, 'chromium'))}, process.argv.slice(2).join(' '));\n`,
  );
  const release = join(root, 'release');
  await mkdir(release, { recursive: true });
  // Relative paths, because Git's tar on Windows reads `C:` as a remote host.
  await run('tar', ['-czf', 'release/is-dl.tgz', '-C', 'pkg', 'package']);
  const tarball = await readFile(join(release, 'is-dl.tgz'));
  const hash = createHash('sha256')
    .update(corrupt ? 'tampered' : tarball)
    .digest('hex');
  await writeFile(join(release, 'SHA256SUMS'), `${hash}  is-dl.tgz\n`);
}

const windows = process.platform === 'win32';

/** Runs a command against the scratch install, with `path` put first on the Windows PATH. */
function run(
  command: string,
  args: string[],
  path: string[] = [],
): Promise<{ code: number | null; output: string }> {
  const home = join(root, 'home');
  // Windows names it Path or PATH, and a copy holding both leaves which one wins undefined.
  const inherited = Object.fromEntries(
    Object.entries(installerEnv(process.env)).filter(([name]) => name.toUpperCase() !== 'PATH'),
  );
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: windows
        ? {
            ...inherited,
            PATH: [...path, process.env.PATH].join(';'),
            USERPROFILE: home,
            LOCALAPPDATA: join(root, 'local'),
            IS_DL_RELEASE_URL: releaseUrl,
          }
        : { PATH: process.env.PATH, HOME: home, IS_DL_RELEASE_URL: releaseUrl },
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.once('error', reject);
    child.once('close', (code) => resolveRun({ code, output }));
  });
}

const binDir = () => join(root, 'home/.local/bin');
const cli = () => join(binDir(), windows ? 'is-dl.cmd' : 'is-dl');
const runCli = () => (windows ? run('cmd.exe', ['/d', '/c', cli()]) : run(cli(), []));
/** Runs is-dl as Git Bash finds it on PATH, where it skips is-dl.cmd. */
const runGitBash = () => run('sh', ['-c', 'is-dl'], [binDir()]);
const dataDir = () => join(root, windows ? 'local/is-dl' : 'home/.local/share/is-dl');
const install = (path: string[] = []) =>
  run(INSTALLER.command, [...INSTALLER.args, resolve(INSTALLER.name)], path);
const current = async () => realpath(join(dataDir(), 'current'));

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'is-dl-install-'));
  server = createServer(async (request, response) => {
    try {
      response.end(await readFile(join(root, 'release', request.url ?? '')));
    } catch {
      response.statusCode = 404;
      response.end();
    }
  });
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server has no port.');
  releaseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  server.close();
  await rm(root, { recursive: true, force: true });
});

describe(INSTALLER.name, { timeout: 60_000 }, () => {
  it('links the CLI through the current version and installs Chromium', async () => {
    await publish('1.2.3');

    expect((await install()).code).toBe(0);

    expect((await runCli()).output).toBe('1.2.3\n');
    expect(await current()).toBe(await realpath(join(dataDir(), 'versions/1.2.3')));
    expect(await readFile(join(root, 'chromium'), 'utf8')).toBe('install chromium');
  });

  it('switches to the new version and keeps only the one it replaced', async () => {
    for (const version of ['1.0.0', '1.1.0', '1.2.0']) {
      await publish(version);
      expect((await install()).code).toBe(0);
    }

    expect((await readdir(join(dataDir(), 'versions'))).sort()).toEqual(['1.1.0', '1.2.0']);
    expect((await runCli()).output).toBe('1.2.0\n');
  });

  it('stops early when the release is already installed, relinking a removed CLI', async () => {
    await publish('1.0.0');
    await install();
    await rm(cli());

    const result = await install();

    expect(result.code).toBe(0);
    expect(result.output).toContain('is-dl 1.0.0 is already up to date.');
    expect((await runCli()).output).toBe('1.0.0\n');
  });

  it('reinstalls when the current version is missing on disk', async () => {
    await publish('1.0.0');
    await install();
    await rm(join(dataDir(), 'versions/1.0.0'), { recursive: true });

    expect((await install()).output).toContain('is-dl 1.0.0 installed.');
    expect((await runCli()).output).toBe('1.0.0\n');
  });

  it('refuses a tarball that does not match the release checksum', async () => {
    await publish('1.0.0');
    await install();
    await publish('1.1.0', { corrupt: true });

    const result = await install();

    expect(result.code).toBe(1);
    expect(result.output).toContain('does not match the release checksum');
    expect(await current()).toBe(await realpath(join(dataDir(), 'versions/1.0.0')));
  });

  it('keeps the current version when Chromium fails to install', async () => {
    await publish('1.0.0');
    await install();
    await publish('1.1.0', { chromiumFails: true });

    const result = await install();

    expect(result.code).toBe(1);
    expect(result.output).toContain('could not install the Chromium build');
    expect(await readdir(join(dataDir(), 'versions'))).toEqual(['1.0.0']);
  });

  it.runIf(windows)('writes a Git Bash shim that stays the same across updates', async () => {
    await publish('1.0.0');
    await install();
    const shim = join(binDir(), 'is-dl');
    const content = await readFile(shim, 'utf8');
    await rm(shim);

    expect((await install()).output).toContain('is-dl 1.0.0 is already up to date.');
    expect((await runGitBash()).output).toBe('1.0.0\n');

    await publish('1.1.0');
    await install();

    expect((await runGitBash()).output).toBe('1.1.0\n');
    expect(await readFile(shim, 'utf8')).toBe(content);
    expect(content).toBe(
      '#!/bin/sh\nexec node "$LOCALAPPDATA/is-dl/current/node_modules/is-dl/cli.js" "$@"\n',
    );
  });

  it.runIf(windows)('warns about an is-dl that can shadow its own on PATH', async () => {
    const stale = join(root, 'stale');
    await mkdir(stale);
    await writeFile(join(stale, 'is-dl'), '#!/bin/sh\necho 0.2.0\n');
    await writeFile(join(stale, 'is-dl.cmd'), '@echo 0.2.0\r\n');
    await publish('1.0.0');
    const warning = `Another is-dl in ${stale} may run instead`;

    const before = await install([stale, binDir()]);
    const after = await install([binDir(), stale]);
    const offPath = await install([stale]);

    expect(before.output.split(warning)).toHaveLength(2);
    expect(after.output).not.toContain('Another is-dl');
    expect(after.output).not.toContain('to PATH');
    expect(offPath.output).toContain(`Add ${binDir()} to PATH`);
    expect(offPath.output).toContain(warning);
  });
});
