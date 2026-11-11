import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

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
  await run('tar', ['-czf', join(release, 'is-dl.tgz'), '-C', join(root, 'pkg'), 'package']);
  const tarball = await readFile(join(release, 'is-dl.tgz'));
  const hash = createHash('sha256')
    .update(corrupt ? 'tampered' : tarball)
    .digest('hex');
  await writeFile(join(release, 'SHA256SUMS'), `${hash}  is-dl.tgz\n`);
}

function run(command: string, args: string[]): Promise<{ code: number | null; output: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      env: { PATH: process.env.PATH, HOME: join(root, 'home'), IS_DL_RELEASE_URL: releaseUrl },
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.once('error', reject);
    child.once('close', (code) => resolveRun({ code, output }));
  });
}

const install = () => run('sh', [resolve('install.sh')]);
const dataDir = () => join(root, 'home/.local/share/is-dl');
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

describe.skipIf(process.platform === 'win32')('install.sh', { timeout: 60_000 }, () => {
  it('links the CLI through the current version and installs Chromium', async () => {
    await publish('1.2.3');

    expect((await install()).code).toBe(0);

    expect((await run(join(root, 'home/.local/bin/is-dl'), [])).output).toBe('1.2.3\n');
    expect(await current()).toBe(await realpath(join(dataDir(), 'versions/1.2.3')));
    expect(await readFile(join(root, 'chromium'), 'utf8')).toBe('install chromium');
  });

  it('switches to the new version and keeps only the one it replaced', async () => {
    for (const version of ['1.0.0', '1.1.0', '1.2.0']) {
      await publish(version);
      expect((await install()).code).toBe(0);
    }

    expect((await readdir(join(dataDir(), 'versions'))).sort()).toEqual(['1.1.0', '1.2.0']);
    expect((await run(join(root, 'home/.local/bin/is-dl'), [])).output).toBe('1.2.0\n');
  });

  it('stops early when the release is already installed, relinking a removed CLI', async () => {
    await publish('1.0.0');
    await install();
    await rm(join(root, 'home/.local/bin/is-dl'));

    const result = await install();

    expect(result.code).toBe(0);
    expect(result.output).toContain('is-dl 1.0.0 is already up to date.');
    expect((await run(join(root, 'home/.local/bin/is-dl'), [])).output).toBe('1.0.0\n');
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
});
