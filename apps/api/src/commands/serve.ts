import { parseArgs } from 'node:util';
import { buildCtx, type CliBase } from '../cli-context.ts';
import { resolveServe } from '../config.ts';
import { CliError } from '../errors.ts';
import { startServer } from '../server.ts';
import { GLOBAL_OPTIONS, usage } from './shared.ts';

const SERVE_OPTIONS = {
  port: { type: 'string' },
  host: { type: 'string' },
} as const;

export async function serveCommand(base: CliBase, argv: string[]): Promise<void> {
  const { values } = usage(() =>
    parseArgs({ args: argv, options: { ...GLOBAL_OPTIONS, ...SERVE_OPTIONS } }),
  );
  const ctx = await buildCtx(base, values);

  let port: number | undefined;
  if (values.port !== undefined) {
    port = Number(values.port);
    if (!Number.isInteger(port)) throw new CliError('USAGE', '--port must be an integer.');
  }

  const settings = resolveServe(ctx.config, ctx.env, { port, host: values.host });
  const address = await startServer({ ...settings, paths: ctx.paths, onLog: ctx.log });

  ctx.emit(`API server running at ${address}`, () => ({ ok: true, address, ...settings }));

  await new Promise<void>((resolve) => {
    base.signal.addEventListener('abort', () => resolve(), { once: true });
  });
}
