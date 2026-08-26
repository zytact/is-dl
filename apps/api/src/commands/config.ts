import { parseArgs } from 'node:util';
import { buildCtx, type CliBase, type Ctx } from '../cli-context.ts';
import { coerceConfigValue, resolveSearch, resolveServe, writeUserConfigValue } from '../config.ts';
import { CliError } from '../errors.ts';
import { GLOBAL_OPTIONS, usage } from './shared.ts';

function resolvedView(ctx: Ctx) {
  return {
    file: ctx.config.file,
    search: resolveSearch({ config: ctx.config, env: ctx.env, flags: {} }),
    serve: resolveServe(ctx.config, ctx.env, {}),
    profiles: ctx.config.profiles,
  };
}

function pick(view: unknown, keyPath: string[]): unknown {
  let cursor = view;
  for (const segment of keyPath) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function camel(key: string): string {
  return key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export async function configCommand(base: CliBase, argv: string[]): Promise<void> {
  const { values, positionals } = usage(() =>
    parseArgs({ args: argv, options: GLOBAL_OPTIONS, allowPositionals: true }),
  );
  const ctx = await buildCtx(base, values);
  const [sub, key, value] = positionals;

  switch (sub) {
    case 'path': {
      ctx.emit(ctx.config.file ?? ctx.paths.configFile, () => ({
        ok: true,
        path: ctx.config.file ?? ctx.paths.configFile,
        userConfig: ctx.paths.configFile,
        exists: ctx.config.file !== null,
      }));
      return;
    }
    case undefined:
    case 'get': {
      const view = resolvedView(ctx);
      if (!key) {
        ctx.emit(JSON.stringify(view, null, 2), () => ({ ok: true, ...view }));
        return;
      }
      const keyPath = key.split('.');
      const found =
        pick(view, keyPath) ??
        pick(view.search, [camel(key)]) ??
        pick(view, ['profiles', ...keyPath]);
      if (found === undefined) throw new CliError('CONFIG', `No config value for "${key}".`);
      const human = typeof found === 'string' ? found : JSON.stringify(found, null, 2);
      ctx.emit(human, () => ({ ok: true, key, value: found }));
      return;
    }
    case 'set': {
      if (!key || value === undefined) {
        throw new CliError('USAGE', 'Usage: is-dl config set <key> <value>');
      }
      const keyPath = key.split('.');
      const parsed = coerceConfigValue(keyPath, value);
      await writeUserConfigValue(ctx.paths.configFile, keyPath, parsed);
      ctx.emit(`Set ${key} in ${ctx.paths.configFile}`, () => ({
        ok: true,
        key,
        value: parsed,
        path: ctx.paths.configFile,
      }));
      return;
    }
    default:
      throw new CliError('USAGE', `Unknown config subcommand "${sub}". Try get, set, or path.`);
  }
}
