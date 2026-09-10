#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CliBase } from './cli-context.ts';
import { CliError, ExitCode } from './errors.ts';
import { resolvePaths } from './paths.ts';

/** Nearest package.json: `<root>/dist/` when packed, `<root>/apps/api/src/` under tsx. */
function readVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) {
      const pkg: unknown = JSON.parse(readFileSync(candidate, 'utf8'));
      if (
        typeof pkg === 'object' &&
        pkg !== null &&
        'version' in pkg &&
        typeof pkg.version === 'string'
      ) {
        return pkg.version;
      }
      throw new Error(`${candidate} has no version field`);
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error('no package.json found above cli.ts');
    dir = parent;
  }
}

const version = readVersion();

type Command = (base: CliBase, argv: string[]) => Promise<void>;

/**
 * Loaded on dispatch, not at startup. Importing every command eagerly pulls in
 * Playwright and the server for `--version`, `notes list` and `config get`
 * alike, and the import graph is most of what those commands cost.
 */
const COMMANDS: Record<string, () => Promise<Command>> = {
  search: async () => (await import('./commands/search.ts')).searchCommand,
  login: async () => (await import('./commands/auth.ts')).loginCommand,
  logout: async () => (await import('./commands/auth.ts')).logoutCommand,
  runs: async () => (await import('./commands/runs.ts')).runsCommand,
  config: async () => (await import('./commands/config.ts')).configCommand,
  serve: async () => (await import('./commands/serve.ts')).serveCommand,
  doctor: async () => (await import('./commands/doctor.ts')).doctorCommand,
  apps: async () => (await import('./commands/apps.ts')).appsCommand,
  notes: async () => (await import('./commands/notes.ts')).notesCommand,
  resume: async () => (await import('./commands/resume.ts')).resumeCommand,
};

const HELP = `is-dl ${version} - job search CLI for LinkedIn and Unstop

Usage:
  is-dl <command> [flags]

Commands:
  search                    Run a scrape across every selected source
  login                     Open a browser and capture the LinkedIn session
  logout                    Delete the stored session
  runs list|show|rm         Inspect past runs
  config get|set|path       Read or write configuration
  apps add|status|list|show Track applications in an append-only log
  notes add|attach|list|show|edit|path|rm
                            Keep the text and files attached to a job
  resume init|build|check|path
                            Build resume variants with tectonic
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
  -s, --source <csv>                linkedin, unstop, or both (default both)
      --unstop-opportunity <name>   jobs, internships, hackathons, competitions
      --unstop-roles <csv>          Unstop work functions, for example
                                    "software-development,backend-development"
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
      --exclude-applied             Drop listings already in the application log
      --exclude-seen                Drop listings an earlier run already showed

Seen listings:
  Every saved run adds its jobs to a ledger in the data dir. --exclude-seen
  filters on it while the sources page, so --limit still yields that many jobs
  you have not been shown. The ledger is rebuilt from the run store when it is
  missing, so it already knows about runs made before it existed.

Sources:
  search queries LinkedIn and Unstop together and merges the results, newest
  first. LinkedIn needs "is-dl login"; Unstop needs nothing. A source that
  fails is reported and skipped, and the command only fails when every source
  failed. --limit applies per source. meta.sources in the output records what
  each source returned.

apps flags:
      --variant <name>              Which resume variant was sent
  -s, --source <name>               Disambiguate a job id shared by two boards
      --from-run <runId>            Look the job up in one run instead of all
      --status <status>             Filter apps list
      --older-than <10d>            Filter apps list by age

notes flags:
  -s, --source <name>               Board the job id belongs to
  -t, --title <text>                Note title (default: its first line)
  -u, --url <url>                   Where the text came from
      --text <text>                 The note itself, inline
  -f, --file <path>                 Read the note from a file, or attach it
      --as <name>                   Attachment name, for attach and rm
  -n, --note <noteId>               Which note, for show, edit, path and rm
      --from-run <runId>            Look the job up in one run instead of all

Notes:
  A note is a markdown file in the data dir under notes/<source>/<jobId>/, and
  the text is stored exactly as given. Company and role are filled in from the
  run that surfaced the job. Notes are not tied to the application log, so a
  job can be noted before you decide to apply.

  "notes attach" copies a file's bytes unchanged into files/ beside the notes,
  so a PDF brief or a docx take-home keeps its original form and name.

  "notes edit" replaces the text of a note that is already saved. With no
  --text or --file and nothing piped in, it opens the body in $EDITOR. The
  file name is the note's identity, so --title rewrites the front matter and
  leaves the path alone. A job with one note needs no --note.

  cat brief.md | is-dl notes add 4055 -t "Comp and process" -u <doc url>
  is-dl notes attach 4055 --file ~/Downloads/take-home.pdf
  is-dl notes show 4055 --json
  is-dl notes edit 4055                     # opens the note in $EDITOR
  is-dl notes edit 4055 -n <noteId> --title "Comp, after the call"

resume flags:
      --variant <name>              Variant to build
      --all                         Build every variant
      --dir <path>                  Resume input dir (config: resume.dir)
  -o, --out <dir>                   Build output dir

Resume storage:
  Inputs  resume.yaml, variants.yaml and preamble.tex live next to config.toml
          in the config dir, under resume/. Override with resume.dir or --dir.
  Outputs the generated .tex, .pdf and .log land in the data dir under
          resume/build/. Override with --out. Run "is-dl resume path" to print
          both resolved locations.

runs list flags:   --limit <n>  --since <date>
serve flags:       --port <n>   --host <addr>

Exit codes:
  0 ok   1 error   2 usage   3 auth required   4 dependency   5 aborted   6 config

Examples:
  is-dl login
  is-dl search -k "frontend intern" -l Remote --limit 20 --json
  is-dl search -k developer --source unstop --unstop-roles software-development
  is-dl runs show latest --json
  is-dl search -k "intern" --exclude-unpaid --exclude-applied
  is-dl search -k "intern" --exclude-seen   # only what I have not been shown
  is-dl resume build --variant ai
  pbpaste | is-dl notes add 4055 --title "Their hiring doc"

is-dl never submits an application. It searches, filters, logs and builds a
PDF. Judging whether a listing fits you is yours to do, as is applying.
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

  const load = COMMANDS[command.name];
  if (!load) {
    throw new CliError(
      'USAGE',
      `Unknown command "${command.name}". Run is-dl --help for the command list.`,
    );
  }

  const run = await load();

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
