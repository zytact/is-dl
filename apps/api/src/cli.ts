#!/usr/bin/env node
import { createRequire } from 'node:module';
import type { CliBase } from './cli-context.ts';
import { appsCommand } from './commands/apps.ts';
import { loginCommand, logoutCommand } from './commands/auth.ts';
import { configCommand } from './commands/config.ts';
import { doctorCommand } from './commands/doctor.ts';
import { runsCommand } from './commands/runs.ts';
import { gapsCommand, scoreCommand } from './commands/score.ts';
import { searchCommand } from './commands/search.ts';
import { serveCommand } from './commands/serve.ts';
import { CliError, ExitCode } from './errors.ts';
import { resolvePaths } from './paths.ts';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

type Command = (base: CliBase, argv: string[]) => Promise<void>;

const COMMANDS: Record<string, Command> = {
  search: searchCommand,
  login: loginCommand,
  logout: logoutCommand,
  runs: runsCommand,
  config: configCommand,
  serve: serveCommand,
  doctor: doctorCommand,
  apps: appsCommand,
  score: scoreCommand,
  gaps: gapsCommand,
};

const HELP = `is-dl ${version} - LinkedIn job scraper

Usage:
  is-dl <command> [flags]

Commands:
  search                    Run a scrape
  login                     Open a browser and capture the LinkedIn session
  logout                    Delete the stored session
  runs list|show|rm         Inspect past runs
  config get|set|path       Read or write configuration
  apps add|status|list|show Track applications in an append-only log
  score <runId|latest>      Score a run against the tagged bullets in resume.yaml
  gaps                      Aggregate unmatched tags across the application log
  serve                     Run the REST API used by the web UI and TUI
  doctor                    Check node, playwright, browser, session, paths

Global flags:
  --json                    Machine-readable JSON on stdout, logs on stderr
  -q, --quiet               Suppress progress logs
      --verbose             Debug-level logs on stderr
      --config <path>       Use this config file only
      --no-config           Ignore config files
  -h, --help                Show help
  -V, --version             Print version

search flags:
  -k, --keywords <query>            Search keywords (required unless --profile)
  -p, --profile <name>              Use a saved profile from config
  -l, --location <location>         Location, for example "Remote" or "India"
      --limit <n>                   Maximum jobs to scrape (default 50)
      --experience-level <csv>      For example "Internship,Entry level"
      --job-type <csv>              For example "Full-time,Internship"
      --posted-within <timeframe>   For example "Past week"
      --remote-only / --no-remote-only
  -o, --out <dir|->                 Output directory, or "-" for stdout
      --headless / --no-headless
      --debug / --no-debug
      --timeout <ms>                Navigation timeout (default 30000)
      --exclude-unpaid              Drop unpaid and token-stipend listings
      --exclude-seen                Drop listings already in the application log

apps flags:
      --variant <name>              Which resume variant was sent
      --from-run <runId>            Look the job up in one run instead of all
      --status <status>             Filter apps list
      --older-than <10d>            Filter apps list by age

runs list flags:   --limit <n>  --since <date>
serve flags:       --port <n>   --host <addr>

Exit codes:
  0 ok   1 error   2 usage   3 auth required   4 dependency   5 aborted   6 config

Examples:
  is-dl login
  is-dl search -k "frontend intern" -l Remote --limit 20 --json
  is-dl runs show latest --json
  is-dl search -k "intern" --exclude-unpaid --exclude-seen

is-dl never submits an application. It searches, filters, scores, logs and
builds a PDF. Applying is always yours to do.
`;

/** The command is the first bare token; only --config consumes a value before it. */
function findCommand(argv: string[]): { name: string; index: number } | null {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--config') {
      i++;
      continue;
    }
    if (!arg.startsWith('-')) return { name: arg, index: i };
  }
  return null;
}

function wantsJson(argv: string[]): boolean {
  return argv.includes('--json');
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes('--version') || argv.includes('-V')) {
    process.stdout.write(`${version}\n`);
    return ExitCode.OK;
  }

  const command = findCommand(argv);
  if (!command || argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return command && !COMMANDS[command.name] ? ExitCode.USAGE : ExitCode.OK;
  }

  const run = COMMANDS[command.name];
  if (!run) {
    throw new CliError(
      'USAGE',
      `Unknown command "${command.name}". Run is-dl --help for the command list.`,
    );
  }

  const controller = new AbortController();
  const onSignal = () => controller.abort();
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const base: CliBase = {
    paths: resolvePaths(),
    cwd: process.cwd(),
    env: process.env,
    signal: controller.signal,
  };

  try {
    await run(base, argv.toSpliced(command.index, 1));
    return controller.signal.aborted ? ExitCode.ABORTED : ExitCode.OK;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}

function report(error: unknown, json: boolean): number {
  const cliError =
    error instanceof CliError
      ? error
      : new CliError('ERROR', error instanceof Error ? error.message : String(error));

  if (cliError.silent) return cliError.exit;

  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: false,
          error: { code: cliError.code, message: cliError.message, exit: cliError.exit },
        },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stderr.write(`error: ${cliError.message}\n`);
  }
  return cliError.exit;
}

const argv = process.argv.slice(2);
try {
  process.exitCode = await main(argv);
} catch (error) {
  const aborted = error instanceof Error && /aborted/i.test(error.message);
  process.exitCode = aborted
    ? report(new CliError('ABORTED', 'Aborted.'), wantsJson(argv))
    : report(error, wantsJson(argv));
}
