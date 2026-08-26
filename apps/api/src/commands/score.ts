import { parseArgs } from 'node:util';
import { readApplications } from '../applications.ts';
import { buildCtx, type CliBase } from '../cli-context.ts';
import { resolveResumeDir } from '../config.ts';
import { CliError } from '../errors.ts';
import { loadProject } from '../resume/build.ts';
import { readRun, resolveRunId } from '../runs.ts';
import { scoreJobs } from '../scoring.ts';
import { GLOBAL_OPTIONS, usage } from './shared.ts';

const SCORE_OPTIONS = { 'resume-dir': { type: 'string' } } as const;

export async function scoreCommand(base: CliBase, argv: string[]): Promise<void> {
  const { values, positionals } = usage(() =>
    parseArgs({
      args: argv,
      options: { ...GLOBAL_OPTIONS, ...SCORE_OPTIONS },
      allowPositionals: true,
    }),
  );
  const ctx = await buildCtx(base, values);
  const ref = positionals[0];
  if (!ref) throw new CliError('USAGE', 'Usage: is-dl score <runId|latest>');

  const runId = await resolveRunId(ctx.paths, ref);
  const output = await readRun(ctx.paths, runId);
  const project = await loadProject(
    resolveResumeDir(ctx.config, ctx.env, values['resume-dir'], ctx.cwd),
  );

  const scores = scoreJobs(project, output.jobs).sort((a, b) => b.score - a.score);
  const human = scores
    .map(
      (score) =>
        `${(score.score * 100).toFixed(0).padStart(3)}%  ${(score.suggestedVariant ?? '-').padEnd(10)} ${score.company ?? '?'} - ${score.title ?? '?'}` +
        (score.unmatchedTags.length ? `\n       gaps: ${score.unmatchedTags.join(', ')}` : ''),
    )
    .join('\n');

  ctx.emit(human || 'No jobs in this run.', () => ({ ok: true, runId, scores }));
}

export async function gapsCommand(base: CliBase, argv: string[]): Promise<void> {
  const { values } = usage(() => parseArgs({ args: argv, options: GLOBAL_OPTIONS }));
  const ctx = await buildCtx(base, values);

  const counts = new Map<string, number>();
  for (const record of await readApplications(ctx.paths.applicationsLog)) {
    for (const tag of record.unmatchedTags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }

  const gaps = [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  ctx.emit(
    gaps.length
      ? gaps.map((gap) => `${String(gap.count).padStart(4)}  ${gap.tag}`).join('\n')
      : 'No gaps recorded yet. Log applications with: is-dl apps add <jobId>',
    () => ({ ok: true, gaps }),
  );
}
