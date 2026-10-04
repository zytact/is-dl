import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { CliError } from './errors.ts';
import { expandHome } from './paths.ts';
import {
  isJobSource,
  isUnstopOpportunity,
  JOB_SOURCES,
  type JobSource,
  UNSTOP_OPPORTUNITIES,
  type UnstopOpportunity,
} from './types.ts';

export const PROJECT_CONFIG_NAME = '.is-dl.toml';

export interface SearchSettings {
  keywords: string;
  /** Which job boards to query. More than one merges into a single result. */
  sources: JobSource[];
  unstopOpportunity: UnstopOpportunity;
  /** Unstop work function slugs, for example "software-development". */
  unstopRoles?: string[];
  location: string;
  limit: number;
  experienceLevel?: string[];
  jobType?: string[];
  postedWithin?: string;
  remoteOnly: boolean;
  headless: boolean;
  outDir?: string;
  timeout: number;
  debug: boolean;
}

export interface ResumeSettings {
  /** Where preamble.tex, resume.yaml and variants.yaml live. */
  dir: string;
}

export interface ResolveResumeDirInput {
  config: LoadedConfig;
  env: NodeJS.ProcessEnv;
  flag?: string;
  cwd: string;
  /** Used when nothing overrides it, normally `paths.resumeDir`. */
  fallback: string;
  home?: string;
}

export interface ServeSettings {
  port: number;
  host: string;
}

export type SearchLayer = Partial<SearchSettings>;

export interface ConfigLayer {
  base: SearchLayer;
  profiles: Record<string, SearchLayer>;
  serve: Partial<ServeSettings>;
  resume: Partial<ResumeSettings>;
}

export interface LoadedConfig extends ConfigLayer {
  /** The file the values came from, or null when no config was used. */
  file: string | null;
}

export const DEFAULT_SEARCH: SearchSettings = {
  keywords: '',
  sources: [...JOB_SOURCES],
  unstopOpportunity: 'jobs',
  location: '',
  limit: 50,
  remoteOnly: false,
  headless: true,
  timeout: 30000,
  debug: false,
};

export const DEFAULT_SERVE: ServeSettings = { port: 3000, host: 'localhost' };

type FieldType = 'string' | 'number' | 'boolean' | 'string[]';

export const SEARCH_FIELDS = {
  keywords: 'string',
  location: 'string',
  limit: 'number',
  'experience-level': 'string[]',
  'job-type': 'string[]',
  'posted-within': 'string',
  'remote-only': 'boolean',
  headless: 'boolean',
  'out-dir': 'string',
  timeout: 'number',
  sources: 'string[]',
  'unstop-opportunity': 'string',
  'unstop-roles': 'string[]',
} as const satisfies Record<string, FieldType>;

type SearchFieldKey = keyof typeof SEARCH_FIELDS;

/** `keywords` as a global default would silently run the wrong search. */
const TOP_LEVEL_FORBIDDEN: readonly SearchFieldKey[] = ['keywords'];

export function camel(key: string): string {
  return key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function typeOfValue(value: unknown): FieldType | 'unknown' {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return 'string[]';
  return 'unknown';
}

function readSearchLayer(
  raw: Record<string, unknown>,
  where: string,
  allowKeywords: boolean,
): SearchLayer {
  const layer: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (key === 'profiles' || key === 'serve' || key === 'resume') continue;

    if (!(key in SEARCH_FIELDS)) {
      throw new CliError(
        'CONFIG',
        `Unknown config key "${key}" in ${where}. Known keys: ${Object.keys(SEARCH_FIELDS).join(', ')}`,
      );
    }

    const fieldKey = key as SearchFieldKey;
    if (!allowKeywords && TOP_LEVEL_FORBIDDEN.includes(fieldKey)) {
      throw new CliError(
        'CONFIG',
        `"${key}" is only allowed inside a profile, not at the top level of ${where}.`,
      );
    }

    const expected = SEARCH_FIELDS[fieldKey];
    if (typeOfValue(value) !== expected) {
      throw new CliError('CONFIG', `Config key "${key}" in ${where} must be a ${expected}.`);
    }

    layer[camel(key)] = value;
  }

  return layer as SearchLayer;
}

function readServe(raw: unknown, where: string): Partial<ServeSettings> {
  if (raw === undefined) return {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CliError('CONFIG', `"serve" in ${where} must be a table.`);
  }

  const serve: Partial<ServeSettings> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'port' && typeof value === 'number') {
      serve.port = value;
    } else if (key === 'host' && typeof value === 'string') {
      serve.host = value;
    } else {
      throw new CliError('CONFIG', `Invalid "serve.${key}" in ${where}.`);
    }
  }
  return serve;
}

function readResume(raw: unknown, where: string): Partial<ResumeSettings> {
  if (raw === undefined) return {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CliError('CONFIG', `"resume" in ${where} must be a table.`);
  }

  const resume: Partial<ResumeSettings> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'dir' && typeof value === 'string') {
      resume.dir = value;
    } else {
      throw new CliError('CONFIG', `Invalid "resume.${key}" in ${where}.`);
    }
  }
  return resume;
}

function readProfiles(raw: unknown, where: string): Record<string, SearchLayer> {
  if (raw === undefined) return {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CliError('CONFIG', `"profiles" in ${where} must be a table.`);
  }

  const profiles: Record<string, SearchLayer> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new CliError('CONFIG', `Profile "${name}" in ${where} must be a table.`);
    }
    profiles[name] = readSearchLayer(value as Record<string, unknown>, `profile "${name}"`, true);
  }
  return profiles;
}

export function parseConfigLayer(text: string, where: string): ConfigLayer {
  let raw: unknown;
  try {
    raw = parseToml(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CliError('CONFIG', `Could not parse ${where}: ${message}`);
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CliError('CONFIG', `${where} must be a TOML table.`);
  }

  const record = raw as Record<string, unknown>;
  return {
    base: readSearchLayer(record, where, false),
    profiles: readProfiles(record.profiles, where),
    serve: readServe(record.serve, where),
    resume: readResume(record.resume, where),
  };
}

export function findProjectConfig(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, PROJECT_CONFIG_NAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function readLayer(file: string): Promise<ConfigLayer> {
  const text = await readFile(file, 'utf-8');
  return parseConfigLayer(text, file);
}

export interface LoadConfigOptions {
  cwd: string;
  userConfigFile: string;
  explicitPath?: string;
  noConfig?: boolean;
}

/**
 * User config first, then project config on top. Merging is per key so a project
 * file that sets `limit` keeps `location` from the user file.
 */
export async function loadConfig(options: LoadConfigOptions): Promise<LoadedConfig> {
  const empty: LoadedConfig = { file: null, base: {}, profiles: {}, serve: {}, resume: {} };
  if (options.noConfig) return empty;

  if (options.explicitPath) {
    const file = resolve(options.cwd, options.explicitPath);
    if (!existsSync(file)) {
      throw new CliError('CONFIG', `Config file not found: ${file}`);
    }
    return { file, ...(await readLayer(file)) };
  }

  const files: string[] = [];
  if (existsSync(options.userConfigFile)) files.push(options.userConfigFile);
  const projectFile = findProjectConfig(options.cwd);
  if (projectFile && projectFile !== options.userConfigFile) files.push(projectFile);

  const merged: LoadedConfig = { ...empty };
  for (const file of files) {
    const layer = await readLayer(file);
    merged.file = file;
    merged.base = { ...merged.base, ...layer.base };
    merged.serve = { ...merged.serve, ...layer.serve };
    merged.resume = { ...merged.resume, ...layer.resume };
    for (const [name, profile] of Object.entries(layer.profiles)) {
      merged.profiles[name] = { ...merged.profiles[name], ...profile };
    }
  }
  return merged;
}

function envString(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[`IS_DL_${key}`];
  return value && value.trim() ? value : undefined;
}

function envBool(env: NodeJS.ProcessEnv, key: string): boolean | undefined {
  const value = envString(env, key)?.toLowerCase();
  if (value === undefined) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  throw new CliError('CONFIG', `IS_DL_${key} must be a boolean, got "${value}".`);
}

function envNumber(env: NodeJS.ProcessEnv, key: string): number | undefined {
  const value = envString(env, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new CliError('CONFIG', `IS_DL_${key} must be a number, got "${value}".`);
  }
  return parsed;
}

function envList(env: NodeJS.ProcessEnv, key: string): string[] | undefined {
  return envString(env, key)
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function compact<T extends object>(layer: T): T {
  return Object.fromEntries(Object.entries(layer).filter(([, v]) => v !== undefined)) as T;
}

export function envSearchLayer(env: NodeJS.ProcessEnv): SearchLayer {
  return compact({
    location: envString(env, 'LOCATION'),
    limit: envNumber(env, 'LIMIT'),
    experienceLevel: envList(env, 'EXPERIENCE_LEVEL'),
    jobType: envList(env, 'JOB_TYPE'),
    postedWithin: envString(env, 'POSTED_WITHIN'),
    remoteOnly: envBool(env, 'REMOTE_ONLY'),
    headless: envBool(env, 'HEADLESS'),
    outDir: envString(env, 'OUT_DIR'),
    timeout: envNumber(env, 'TIMEOUT'),
    sources: envList(env, 'SOURCES') as JobSource[] | undefined,
    unstopOpportunity: envString(env, 'UNSTOP_OPPORTUNITY') as UnstopOpportunity | undefined,
    unstopRoles: envList(env, 'UNSTOP_ROLES'),
  });
}

export function envServeLayer(env: NodeJS.ProcessEnv): Partial<ServeSettings> {
  return compact({
    port: envNumber(env, 'SERVE_PORT'),
    host: envString(env, 'SERVE_HOST'),
  });
}

export function resolveResumeDir(input: ResolveResumeDirInput): string {
  const dir = input.flag ?? envString(input.env, 'RESUME_DIR') ?? input.config.resume.dir;
  return dir ? resolve(input.cwd, expandHome(dir, input.home)) : input.fallback;
}

/** Order is the caller's, duplicates are dropped, an unknown name is a config error. */
function readSources(values: readonly string[]): JobSource[] {
  const sources: JobSource[] = [];
  for (const value of values) {
    if (!isJobSource(value)) {
      throw new CliError(
        'CONFIG',
        `Unknown source "${value}". Use one of: ${JOB_SOURCES.join(', ')}`,
      );
    }
    if (!sources.includes(value)) sources.push(value);
  }
  if (!sources.length) throw new CliError('USAGE', 'At least one source is required.');
  return sources;
}

export interface ResolveSearchInput {
  config: LoadedConfig;
  env: NodeJS.ProcessEnv;
  flags: SearchLayer;
  profile?: string;
  home?: string;
}

/**
 * defaults < config top level < named profile < env < flags. The profile beats
 * general config because naming it is more specific than setting a global.
 */
export function resolveSearch(input: ResolveSearchInput): SearchSettings {
  let profileLayer: SearchLayer = {};
  if (input.profile) {
    const found = input.config.profiles[input.profile];
    if (!found) {
      const known = Object.keys(input.config.profiles);
      throw new CliError(
        'CONFIG',
        `Unknown profile "${input.profile}". ${
          known.length ? `Available profiles: ${known.join(', ')}` : 'No profiles are defined.'
        }`,
      );
    }
    profileLayer = found;
  }

  const merged: SearchSettings = {
    ...DEFAULT_SEARCH,
    ...compact(input.config.base),
    ...compact(profileLayer),
    ...envSearchLayer(input.env),
    ...compact(input.flags),
  };

  if (merged.outDir && merged.outDir !== '-') {
    merged.outDir = expandHome(merged.outDir, input.home);
  }
  if (!Number.isFinite(merged.limit) || merged.limit <= 0) {
    throw new CliError('USAGE', `--limit must be a positive number, got "${merged.limit}".`);
  }
  merged.sources = readSources(merged.sources);

  const opportunity: string = merged.unstopOpportunity;
  if (!isUnstopOpportunity(opportunity)) {
    throw new CliError(
      'CONFIG',
      `Unknown Unstop opportunity "${opportunity}". Use one of: ${UNSTOP_OPPORTUNITIES.join(', ')}`,
    );
  }
  return merged;
}

export function resolveServe(
  config: LoadedConfig,
  env: NodeJS.ProcessEnv,
  flags: Partial<ServeSettings>,
): ServeSettings {
  return {
    ...DEFAULT_SERVE,
    ...compact(config.serve),
    ...envServeLayer(env),
    ...compact(flags),
  };
}

const SERVE_FIELDS = { port: 'number', host: 'string' } as const satisfies Record<
  string,
  FieldType
>;

const RESUME_FIELDS = { dir: 'string' } as const satisfies Record<string, FieldType>;

function fieldTypeFor(keyPath: string[]): FieldType {
  const [head, ...rest] = keyPath;
  if (head === 'serve' && rest.length === 1 && rest[0]! in SERVE_FIELDS) {
    return SERVE_FIELDS[rest[0] as keyof typeof SERVE_FIELDS];
  }
  if (head === 'resume' && rest.length === 1 && rest[0]! in RESUME_FIELDS) {
    return RESUME_FIELDS[rest[0] as keyof typeof RESUME_FIELDS];
  }
  const leaf =
    head === 'profiles' && rest.length === 2 ? rest[1]! : keyPath.length === 1 ? head! : '';
  if (leaf in SEARCH_FIELDS) return SEARCH_FIELDS[leaf as SearchFieldKey];
  throw new CliError('CONFIG', `Unknown config key "${keyPath.join('.')}".`);
}

export type ConfigValue = string | number | boolean | string[];

export function coerceConfigValue(keyPath: string[], raw: string): ConfigValue {
  const type = fieldTypeFor(keyPath);
  switch (type) {
    case 'number': {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        throw new CliError('CONFIG', `"${keyPath.join('.')}" must be a number, got "${raw}".`);
      }
      return parsed;
    }
    case 'boolean': {
      if (['true', '1', 'yes', 'on'].includes(raw.toLowerCase())) return true;
      if (['false', '0', 'no', 'off'].includes(raw.toLowerCase())) return false;
      throw new CliError('CONFIG', `"${keyPath.join('.')}" must be a boolean, got "${raw}".`);
    }
    case 'string[]':
      return raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    default:
      return raw;
  }
}

/** Writes one dotted key into the user config file, preserving the other keys. */
export async function writeUserConfigValue(
  file: string,
  keyPath: string[],
  value: ConfigValue,
): Promise<void> {
  const existing = existsSync(file) ? parseToml(await readFile(file, 'utf-8')) : {};
  const root = existing as Record<string, unknown>;

  let cursor = root;
  for (const segment of keyPath.slice(0, -1)) {
    const next = cursor[segment];
    if (next === undefined) {
      cursor[segment] = {};
    } else if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      throw new CliError(
        'CONFIG',
        `Cannot set "${keyPath.join('.')}": "${segment}" is not a table.`,
      );
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[keyPath.at(-1)!] = value;

  const text = stringifyToml(root);
  parseConfigLayer(text, file);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${text}\n`, 'utf-8');
}
