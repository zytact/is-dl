import { parseArgs } from 'node:util';
import { buildCtx, type CliBase } from '../cli-context.ts';
import { CliError } from '../errors.ts';
import { listRuns, readRun, removeRun, resolveRunId } from '../runs.ts';
import { GLOBAL_OPTIONS, usage } from './shared.ts';

const RUNS_OPTIONS = {
  limit: { type: 'string' },
  since: { type: 'string' },
} as const;

export async function runsCommand(base: CliBase, argv: string[]): Promise<void> {
  const { values, positionals } = usage(() =>
    parseArgs({
      args: argv,
      options: { ...GLOBAL_OPTIONS, ...RUNS_OPTIONS },
      allowPositionals: true,
    }),
  );
  const ctx = await buildCtx(base, values);
  const [sub, ref] = positionals;

  switch (sub) {
    case undefined:
    case 'list': {
      let runs = await listRuns(ctx.paths);
      if (values.since) {
        const since = new Date(values.since);
        if (Number.isNaN(since.getTime())) {
          throw new CliError('USAGE', `--since is not a valid date: ${values.since}`);
        }
        runs = runs.filter((run) => new Date(run.scrapedAt) >= since);
      }
      if (values.limit) runs = runs.slice(0, Number(values.limit));

      const human = runs.length
        ? runs.map((r) => `${r.runId}  ${String(r.count).padStart(4)}  ${r.query}`).join('\n')
        : 'No runs yet.';
      ctx.emit(human, () => ({ ok: true, runs }));
      return;
    }
    case 'show': {
      if (!ref) throw new CliError('USAGE', 'Usage: is-dl runs show <runId|latest>');
      const runId = await resolveRunId(ctx.paths, ref);
      const output = await readRun(ctx.paths, runId);
      ctx.emit(JSON.stringify(output, null, 2), () => ({ ok: true, runId, ...output }));
      return;
    }
    case 'rm': {
      if (!ref) throw new CliError('USAGE', 'Usage: is-dl runs rm <runId|latest>');
      const runId = await resolveRunId(ctx.paths, ref);
      const path = await removeRun(ctx.paths, runId);
      ctx.emit(`Removed ${path}`, () => ({ ok: true, runId, path }));
      return;
    }
    default:
      throw new CliError('USAGE', `Unknown runs subcommand "${sub}". Try list, show, or rm.`);
  }
}
