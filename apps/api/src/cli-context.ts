import { loadConfig, type LoadedConfig } from './config.ts';
import type { AppPaths } from './paths.ts';

export interface CliBase {
  paths: AppPaths;
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
}

export interface GlobalFlags {
  json: boolean;
  quiet: boolean;
  verbose: boolean;
  config?: string;
  noConfig: boolean;
}

export interface Ctx extends CliBase {
  flags: GlobalFlags;
  config: LoadedConfig;
  /** Progress and warnings. Always stderr, never stdout. */
  log: (msg: string) => void;
  debug: (msg: string) => void;
  /** The single result. stdout only, once per run. */
  emit: (human: string, json: () => unknown) => void;
}

export interface GlobalValues {
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  config?: string;
  'no-config'?: boolean;
}

export function readGlobalFlags(values: GlobalValues): GlobalFlags {
  return {
    json: values.json ?? false,
    quiet: values.quiet ?? false,
    verbose: values.verbose ?? false,
    config: values.config,
    noConfig: values['no-config'] ?? false,
  };
}

export function createIo(flags: GlobalFlags): Pick<Ctx, 'log' | 'debug' | 'emit'> {
  const quiet = flags.quiet || (flags.json && !flags.verbose);
  return {
    log: (msg) => {
      if (!quiet) process.stderr.write(`${msg}\n`);
    },
    debug: (msg) => {
      if (flags.verbose) process.stderr.write(`${msg}\n`);
    },
    emit: (human, json) => {
      process.stdout.write(flags.json ? `${JSON.stringify(json(), null, 2)}\n` : `${human}\n`);
    },
  };
}

export async function buildCtx(base: CliBase, values: GlobalValues): Promise<Ctx> {
  const flags = readGlobalFlags(values);
  const config = await loadConfig({
    cwd: base.cwd,
    userConfigFile: base.paths.configFile,
    explicitPath: flags.config ?? base.env.IS_DL_CONFIG,
    noConfig: flags.noConfig,
  });
  return { ...base, flags, config, ...createIo(flags) };
}
