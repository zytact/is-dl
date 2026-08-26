import { join } from 'node:path';
import { describe, expect, test } from 'vite-plus/test';
import { expandHome, resolvePaths } from './paths.ts';

const HOME = join('/', 'home', 'arnab');

describe('resolvePaths', () => {
  test('uses XDG base directories on linux', () => {
    const paths = resolvePaths({}, HOME, 'linux');

    expect(paths.configFile).toBe(join(HOME, '.config', 'is-dl', 'config.toml'));
    expect(paths.runsDir).toBe(join(HOME, '.local', 'share', 'is-dl', 'runs'));
    expect(paths.sessionFile).toBe(join(HOME, '.local', 'state', 'is-dl', 'storageState.json'));
    expect(paths.cache).toBe(join(HOME, '.cache', 'is-dl'));
    expect(paths.resumeDir).toBe(join(HOME, '.config', 'is-dl', 'resume'));
    expect(paths.resumeBuildDir).toBe(join(HOME, '.local', 'share', 'is-dl', 'resume', 'build'));
  });

  test('uses Library directories on macOS', () => {
    const paths = resolvePaths({}, HOME, 'darwin');

    expect(paths.config).toBe(join(HOME, 'Library', 'Application Support', 'is-dl'));
    expect(paths.sessionFile).toBe(
      join(HOME, 'Library', 'Application Support', 'is-dl', 'storageState.json'),
    );
    expect(paths.cache).toBe(join(HOME, 'Library', 'Caches', 'is-dl'));
    expect(paths.resumeDir).toBe(join(HOME, 'Library', 'Application Support', 'is-dl', 'resume'));
    expect(paths.resumeBuildDir).toBe(
      join(HOME, 'Library', 'Application Support', 'is-dl', 'resume', 'build'),
    );
  });

  test('uses APPDATA and LOCALAPPDATA on windows', () => {
    const roaming = join('C:', 'Users', 'arnab', 'AppData', 'Roaming');
    const local = join('C:', 'Users', 'arnab', 'AppData', 'Local');
    const paths = resolvePaths({ APPDATA: roaming, LOCALAPPDATA: local }, HOME, 'win32');

    expect(paths.configFile).toBe(join(roaming, 'is-dl', 'Config', 'config.toml'));
    expect(paths.runsDir).toBe(join(roaming, 'is-dl', 'Data', 'runs'));
    expect(paths.sessionFile).toBe(join(local, 'is-dl', 'State', 'storageState.json'));
    expect(paths.cache).toBe(join(local, 'is-dl', 'Cache'));
    expect(paths.resumeDir).toBe(join(roaming, 'is-dl', 'Config', 'resume'));
    expect(paths.resumeBuildDir).toBe(join(roaming, 'is-dl', 'Data', 'resume', 'build'));
  });

  test('XDG variables win on macOS and windows too', () => {
    const custom = join('/', 'srv', 'xdg');
    for (const os of ['darwin', 'win32'] as const) {
      const paths = resolvePaths({ XDG_STATE_HOME: custom }, HOME, os);
      expect(paths.sessionFile).toBe(join(custom, 'is-dl', 'storageState.json'));
    }
  });

  test('XDG_CONFIG_HOME moves the resume inputs but not the build output', () => {
    const custom = join('/', 'srv', 'xdg');
    const paths = resolvePaths({ XDG_CONFIG_HOME: custom }, HOME, 'linux');

    expect(paths.resumeDir).toBe(join(custom, 'is-dl', 'resume'));
    expect(paths.resumeBuildDir).toBe(join(HOME, '.local', 'share', 'is-dl', 'resume', 'build'));
  });

  test('ignores blank XDG variables', () => {
    const paths = resolvePaths({ XDG_DATA_HOME: '  ' }, HOME, 'linux');
    expect(paths.data).toBe(join(HOME, '.local', 'share', 'is-dl'));
  });
});

describe('expandHome', () => {
  test('expands a leading tilde and leaves other paths alone', () => {
    expect(expandHome('~/jobs', HOME)).toBe(join(HOME, 'jobs'));
    expect(expandHome('~', HOME)).toBe(HOME);
    expect(expandHome(join('.', 'out'), HOME)).toBe(join('.', 'out'));
  });
});
