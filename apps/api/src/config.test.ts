import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vite-plus/test';
import { loadConfig, parseConfigLayer, resolveResumeDir, resolveSearch } from './config.ts';
import { CliError } from './errors.ts';

let root = '';
let userConfigFile = '';
let projectDir = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'is-dl-config-'));
  userConfigFile = join(root, 'user', 'config.toml');
  projectDir = join(root, 'project', 'nested');
  await mkdir(join(root, 'user'), { recursive: true });
  await mkdir(projectDir, { recursive: true });
});

async function writeUser(text: string) {
  await writeFile(userConfigFile, text, 'utf-8');
}

async function writeProject(text: string) {
  await writeFile(join(root, 'project', '.is-dl.toml'), text, 'utf-8');
}

describe('config precedence', () => {
  test('project config overrides the user config per key', async () => {
    await writeUser('location = "India"\nlimit = 50\n');
    await writeProject('limit = 10\n');

    const config = await loadConfig({ cwd: projectDir, userConfigFile });
    const settings = resolveSearch({ config, env: {}, flags: { keywords: 'x' } });

    expect(settings.limit).toBe(10);
    expect(settings.location).toBe('India');
  });

  test('profile beats top-level config, env beats profile, flags beat env', async () => {
    await writeUser(
      'limit = 50\nlocation = "India"\n\n[profiles.fe]\nkeywords = "frontend"\nlimit = 40\nlocation = "Remote"\n',
    );
    const config = await loadConfig({ cwd: root, userConfigFile });

    const fromProfile = resolveSearch({ config, env: {}, flags: {}, profile: 'fe' });
    expect(fromProfile.limit).toBe(40);
    expect(fromProfile.keywords).toBe('frontend');

    const withEnv = resolveSearch({ config, env: { IS_DL_LIMIT: '5' }, flags: {}, profile: 'fe' });
    expect(withEnv.limit).toBe(5);

    const withFlag = resolveSearch({
      config,
      env: { IS_DL_LIMIT: '5' },
      flags: { limit: 3 },
      profile: 'fe',
    });
    expect(withFlag.limit).toBe(3);
    expect(withFlag.location).toBe('Remote');
  });

  test('--no-config ignores every file', async () => {
    await writeUser('limit = 50\n');
    const config = await loadConfig({ cwd: root, userConfigFile, noConfig: true });

    expect(config.file).toBe(null);
    expect(resolveSearch({ config, env: {}, flags: { keywords: 'x' } }).limit).toBe(50);
  });

  test('an explicit path wins and must exist', async () => {
    await writeUser('limit = 50\n');
    const explicit = join(root, 'explicit.toml');
    await writeFile(explicit, 'limit = 7\n', 'utf-8');

    const config = await loadConfig({ cwd: root, userConfigFile, explicitPath: explicit });
    expect(resolveSearch({ config, env: {}, flags: {} }).limit).toBe(7);

    await expect(
      loadConfig({ cwd: root, userConfigFile, explicitPath: join(root, 'missing.toml') }),
    ).rejects.toThrow(CliError);
  });
});

describe('config validation', () => {
  test('rejects unknown keys', () => {
    expect(() => parseConfigLayer('nope = 1\n', 'test')).toThrow(/Unknown config key "nope"/);
  });

  test('rejects top-level keywords but allows it in a profile', () => {
    expect(() => parseConfigLayer('keywords = "x"\n', 'test')).toThrow(/only allowed inside/);
    expect(parseConfigLayer('[profiles.a]\nkeywords = "x"\n', 'test').profiles.a?.keywords).toBe(
      'x',
    );
  });

  test('rejects a wrongly typed value', () => {
    expect(() => parseConfigLayer('limit = "many"\n', 'test')).toThrow(/must be a number/);
  });

  test('an unknown profile name is a config error', async () => {
    await writeUser('[profiles.fe]\nkeywords = "x"\n');
    const config = await loadConfig({ cwd: root, userConfigFile });

    expect(() => resolveSearch({ config, env: {}, flags: {}, profile: 'missing' })).toThrow(
      /Available profiles: fe/,
    );
  });
});

describe('resume dir resolution', () => {
  test('flag beats env beats config, and cwd is the fallback', async () => {
    await writeUser('[resume]\ndir = "/from/config"\n');
    const config = await loadConfig({ cwd: projectDir, userConfigFile });

    expect(resolveResumeDir(config, {}, undefined, projectDir)).toBe('/from/config');
    expect(resolveResumeDir(config, { IS_DL_RESUME_DIR: '/from/env' }, undefined, projectDir)).toBe(
      '/from/env',
    );
    expect(
      resolveResumeDir(config, { IS_DL_RESUME_DIR: '/from/env' }, '/from/flag', projectDir),
    ).toBe('/from/flag');
  });

  test('an unset resume dir means the current directory', async () => {
    const config = await loadConfig({ cwd: projectDir, userConfigFile });
    expect(resolveResumeDir(config, {}, undefined, projectDir)).toBe(projectDir);
  });

  test('a relative dir resolves against cwd', async () => {
    const config = await loadConfig({ cwd: projectDir, userConfigFile });
    expect(resolveResumeDir(config, {}, 'resume', projectDir)).toBe(join(projectDir, 'resume'));
  });

  test('an unknown resume key is a config error', async () => {
    await writeUser('[resume]\nfolder = "x"\n');
    await expect(loadConfig({ cwd: projectDir, userConfigFile })).rejects.toThrow(CliError);
  });
});
