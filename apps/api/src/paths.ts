import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const APP = 'is-dl';

export interface AppPaths {
  config: string;
  data: string;
  state: string;
  cache: string;
  configFile: string;
  runsDir: string;
  runsIndex: string;
  applicationsLog: string;
  sessionFile: string;
}

type BaseDirs = Pick<AppPaths, 'config' | 'data' | 'state' | 'cache'>;

/**
 * XDG variables win on every platform when set, because developers who set them
 * expect them to be honoured. Otherwise each OS gets its native locations.
 */
function baseDirs(env: NodeJS.ProcessEnv, home: string, os: NodeJS.Platform): BaseDirs {
  const native = nativeBaseDirs(home, env, os);
  return {
    config: fromEnv(env.XDG_CONFIG_HOME) ?? native.config,
    data: fromEnv(env.XDG_DATA_HOME) ?? native.data,
    state: fromEnv(env.XDG_STATE_HOME) ?? native.state,
    cache: fromEnv(env.XDG_CACHE_HOME) ?? native.cache,
  };
}

function nativeBaseDirs(home: string, env: NodeJS.ProcessEnv, os: NodeJS.Platform): BaseDirs {
  switch (os) {
    case 'darwin': {
      const support = join(home, 'Library', 'Application Support', APP);
      return {
        config: support,
        data: support,
        state: support,
        cache: join(home, 'Library', 'Caches', APP),
      };
    }
    case 'win32': {
      const roaming = fromEnv(env.APPDATA) ?? join(home, 'AppData', 'Roaming');
      const local = fromEnv(env.LOCALAPPDATA) ?? join(home, 'AppData', 'Local');
      return {
        config: join(roaming, APP, 'Config'),
        data: join(roaming, APP, 'Data'),
        state: join(local, APP, 'State'),
        cache: join(local, APP, 'Cache'),
      };
    }
    default:
      return {
        config: join(home, '.config', APP),
        data: join(home, '.local', 'share', APP),
        state: join(home, '.local', 'state', APP),
        cache: join(home, '.cache', APP),
      };
  }
}

function fromEnv(value: string | undefined): string | undefined {
  return value && value.trim() ? value : undefined;
}

/** Suffix an XDG base with the app name; native dirs already include it. */
function scoped(dir: string, xdgValue: string | undefined): string {
  return fromEnv(xdgValue) ? join(dir, APP) : dir;
}

export function resolvePaths(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
  os: NodeJS.Platform = platform(),
): AppPaths {
  const base = baseDirs(env, home, os);
  const config = scoped(base.config, env.XDG_CONFIG_HOME);
  const data = scoped(base.data, env.XDG_DATA_HOME);
  const state = scoped(base.state, env.XDG_STATE_HOME);
  const cache = scoped(base.cache, env.XDG_CACHE_HOME);

  return {
    config,
    data,
    state,
    cache,
    configFile: join(config, 'config.toml'),
    runsDir: join(data, 'runs'),
    runsIndex: join(data, 'runs', 'index.json'),
    applicationsLog: join(data, 'applications.jsonl'),
    sessionFile: join(state, 'storageState.json'),
  };
}

/** Expand a leading `~` so `out-dir = "~/jobs"` in config works. */
export function expandHome(inputPath: string, home: string = homedir()): string {
  if (inputPath === '~') return home;
  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return join(home, inputPath.slice(2));
  }
  return inputPath;
}
