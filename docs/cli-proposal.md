# is-dl CLI design proposal

Status: proposal, not implemented.

Today the scraper is only reachable through `vp run --filter @repo/api cli -- ...`, which requires the repo, a checkout-relative `./out`, and a `./storageState.json` that lands in whatever directory you happened to run from. This proposal turns `apps/api` into a real installable CLI named `is-dl` that works from any directory, on any machine, for humans and coding agents.

## Goals

- One binary, `is-dl`, installable with `npm i -g` or runnable with `pnpm dlx`.
- No dependence on cwd for session, config, or output.
- Machine-readable output by default flag, never mixed into logs.
- The existing REST server and Go TUI keep working with no behavior change.

Non-goals: auth beyond the current manual browser login, plugins, shell completions, a daemon. Add those when someone asks.

## 1. Distribution

Publish `apps/api` as `is-dl` on npm, public, with a `bin` entry.

```jsonc
{
  "name": "is-dl",
  "version": "0.1.0",
  "type": "module",
  "bin": { "is-dl": "./dist/cli.js" },
  "engines": { "node": ">=24" },
  "files": ["dist"],
  "dependencies": { "playwright": "^1.58.0", "archiver": "^6.0.2" },
}
```

The package stops being `private` and stops being `@repo/api`. Internal workspace references stay working because the other apps depend on it by name, and pnpm resolves the workspace copy.

**Build with tsdown, not tsx.** tsx is a dev-time loader. Shipping it means every user pays a TypeScript transform on every invocation and inherits a runtime dependency that does not belong in a published CLI. tsdown is already in the Vite+ toolchain, so this is not a new tool.

```
vp build --filter is-dl   # tsdown -> dist/cli.js, dist/server.js, dist/index.js
```

tsdown config: format `esm`, target `node24`, `dts` off (this ships a binary, not a library), `playwright` and `archiver` external so they resolve from `node_modules` and Playwright can find its browser install. Shebang `#!/usr/bin/env node` on `dist/cli.js`.

Node 24 only. The repo already standardised on it (`engines.node: 24.x`), and it buys native `parseArgs` from `node:util`, so argument parsing needs zero dependencies.

Install stories:

| Use case                     | Command                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| Human, permanent             | `npm i -g is-dl` then `is-dl search -k "..."`                        |
| One-off / CI / agent sandbox | `pnpm dlx is-dl search -k "..."`                                     |
| Local dev in this repo       | `vp run --filter is-dl dev -- search -k "..."` (still tsx, dev only) |

Playwright's Chromium is not bundled. A `postinstall` that downloads a browser is hostile in CI. Instead, on first run `is-dl` checks for the browser and, if missing, exits with code `4` and a one-line fix: `npx playwright install chromium`. `is-dl doctor` prints the same check on demand.

## 2. Config file

Locations, checked in this order:

1. `$IS_DL_CONFIG` if set (explicit path, wins over everything).
2. Project config: nearest `.is-dl.toml` walking up from cwd to the filesystem root.
3. User config: `${XDG_CONFIG_HOME:-~/.config}/is-dl/config.toml`.

TOML over JSON. It has comments, and a config file a human edits by hand without comments is a config file people get wrong. Parse it with a small TOML reader; if pulling a dependency is unacceptable, accept `config.json` instead and drop TOML. Do not support both formats. One file, one syntax.

Precedence, highest first:

```
CLI flags  >  IS_DL_* env vars  >  project .is-dl.toml  >  user config.toml  >  built-in defaults
```

Merging is per key, not per file. Setting `limit` in the project file does not discard `location` from the user file. Profiles merge as a single unit under their own key so a profile is one coherent search, not a scatter of half-inherited fields.

What belongs in config:

```toml
location    = "India"
limit       = 50
remote-only = false
headless    = true
out-dir     = "~/jobs"        # optional, overrides the XDG default

[profiles.frontend-intern]
keywords          = "frontend intern react"
location          = "Remote"
limit             = 40
remote-only       = true
experience-level  = ["Internship"]
posted-within     = "Past week"
```

What does not belong: `keywords` at top level (a default search query is a footgun, every run should say what it is looking for), `debug`, anything about the REST server port beyond a single `serve.port`.

Env vars mirror flags with an `IS_DL_` prefix and screaming snake case: `IS_DL_LIMIT`, `IS_DL_REMOTE_ONLY`, `IS_DL_HEADLESS`, `IS_DL_OUT_DIR`, `IS_DL_PROFILE`.

## 3. Storage and state

Today `SESSION_FILE = './storageState.json'` and `outDir = './out'`. Both are cwd-relative, which is exactly why the CLI cannot be run from anywhere. Replace with XDG paths resolved once, at startup, in a single `paths.ts` module.

| Thing                   | Path                                                        | Why                                                                                                                  |
| ----------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| LinkedIn session        | `${XDG_STATE_HOME:-~/.local/state}/is-dl/storageState.json` | State, not data. Regenerable by logging in again, and not something a user should ever back up or sync. Mode `0600`. |
| Scraped runs            | `${XDG_DATA_HOME:-~/.local/share}/is-dl/runs/<runId>.json`  | Real user data, worth keeping and backing up.                                                                        |
| Run index               | `${XDG_DATA_HOME:-~/.local/share}/is-dl/runs/index.json`    | Cheap listing without reading every run file.                                                                        |
| Debug screenshots, logs | `${XDG_CACHE_HOME:-~/.cache}/is-dl/`                        | Disposable. Safe to `rm -rf`.                                                                                        |
| Config                  | `${XDG_CONFIG_HOME:-~/.config}/is-dl/config.toml`           | See above.                                                                                                           |

`runId` is the existing timestamp slug, `2026-08-26T13-07-34-503Z`. Keep it. It sorts lexicographically, which makes `runs list` a directory read.

Output resolution for a search:

1. `--out <dir>` writes the run JSON to that directory instead and skips the index entirely. Explicit path means the user owns the file. Do not silently also write a copy to the data dir.
2. `--out -` writes the run JSON to stdout and nothing to disk.
3. Otherwise write to the runs dir and append to the index.

Never write to cwd by default. A CLI that litters the directory you invoked it from is a CLI people stop invoking.

`XDG_*` on macOS: use the same XDG paths rather than `~/Library/Application Support`. Consistency across machines beats platform purity for a developer tool, and every agent sandbox already honours XDG.

## 4. Command surface

```
is-dl search [flags]              run a scrape
is-dl login [flags]               open a browser, capture the LinkedIn session
is-dl logout                      delete the stored session
is-dl runs list [flags]           list past runs
is-dl runs show <runId|latest>    print one run
is-dl runs rm <runId>             delete a run
is-dl config get [key]            print resolved config, or one key
is-dl config set <key> <value>    write to the user config
is-dl config path                 print the config file path in use
is-dl serve [flags]               the existing REST API, for web and TUI
is-dl doctor                      check node, playwright, browser, session, paths
```

Bare `is-dl` prints help and exits `0`. No default subcommand. Guessing that a bare invocation means "search" is the kind of cleverness that surprises people.

Global flags, valid on every subcommand:

| Flag              | Type   | Default  | Meaning                                           |
| ----------------- | ------ | -------- | ------------------------------------------------- |
| `--json`          | bool   | false    | Machine-readable JSON on stdout, logs to stderr   |
| `--quiet`, `-q`   | bool   | false    | Suppress progress logs on stderr, keep errors     |
| `--verbose`       | bool   | false    | Debug-level logs on stderr                        |
| `--config <path>` | string | resolved | Use this config file only                         |
| `--no-config`     | bool   | false    | Ignore all config files, defaults plus flags only |
| `--help`, `-h`    | bool   | -        | Help for the current subcommand                   |
| `--version`, `-V` | bool   | -        | Print version                                     |

`is-dl search`:

| Flag                           | Type        | Default                     | Config key         |
| ------------------------------ | ----------- | --------------------------- | ------------------ |
| `--keywords`, `-k`             | string      | required unless `--profile` | -                  |
| `--profile`, `-p`              | string      | -                           | `profiles.<name>`  |
| `--location`, `-l`             | string      | `""`                        | `location`         |
| `--limit`                      | number      | 50                          | `limit`            |
| `--experience-level`           | csv         | -                           | `experience-level` |
| `--job-type`                   | csv         | -                           | `job-type`         |
| `--posted-within`              | string      | -                           | `posted-within`    |
| `--remote-only`                | bool        | false                       | `remote-only`      |
| `--out`, `-o`                  | path or `-` | XDG runs dir                | `out-dir`          |
| `--headless` / `--no-headless` | bool        | true                        | `headless`         |
| `--debug`                      | bool        | false                       | -                  |
| `--timeout <ms>`               | number      | 30000                       | `timeout`          |

Every boolean flag gets a `--no-` counterpart, so a config value can be turned off from the command line. `--remote-only` in config with no way to say `--no-remote-only` is a config file you have to edit to run one query.

`is-dl runs list` adds `--limit <n>` and `--since <date>`. `is-dl serve` adds `--port <n>` and `--host <addr>`.

## 5. Agent friendliness

The whole point of `--json` is that a program can pipe stdout into a parser without a regex. That only works if the split is absolute.

- **stdout** carries exactly one thing: the result. With `--json`, a single JSON document, no trailing newline noise, nothing printed before it. Without `--json`, a human-readable summary.
- **stderr** carries everything else: progress, warnings, errors, the per-job `[12/50] Processing...` lines. This requires replacing the `console.log` calls scattered through `scraper.ts` and `output.ts` with the injected `onLog`, which the scraper already threads through but `writeOutput` bypasses.
- `--json` implies quiet progress unless `--verbose` is also passed.

`is-dl search --json` result shape, which is the existing `ScraperOutput` plus a wrapper so failures are still valid JSON:

```jsonc
{
  "ok": true,
  "runId": "2026-08-26T13-07-34-503Z",
  "path": "/home/arnab/.local/share/is-dl/runs/2026-08-26T13-07-34-503Z.json",
  "meta": { "...": "unchanged SearchMeta" },
  "jobs": [],
}
```

On failure, with the same exit code the process returns:

```jsonc
{
  "ok": false,
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "No LinkedIn session. Run: is-dl login",
    "exit": 3,
  },
}
```

Exit codes, stable and part of the contract:

| Code | Name          | Meaning                                                  |
| ---- | ------------- | -------------------------------------------------------- |
| 0    | OK            | Success. A search that found zero jobs is still success. |
| 1    | ERROR         | Unexpected failure                                       |
| 2    | USAGE         | Bad flags, unknown subcommand, missing `--keywords`      |
| 3    | AUTH_REQUIRED | No session, or session expired                           |
| 4    | DEPENDENCY    | Playwright browser missing                               |
| 5    | ABORTED       | SIGINT, or the abort signal fired                        |
| 6    | CONFIG        | Config file unparseable or has an unknown key            |

Non-interactive login: `launchBrowser` currently blocks on `process.stdin` waiting for Enter when no session exists, which hangs an agent forever. Fix by refusing to prompt unless stdin is a TTY. Without a TTY, exit `3` immediately with `AUTH_REQUIRED`. `is-dl login` is the only command allowed to open an interactive browser, and it fails the same way when non-interactive. `--headless=false` plus no TTY is also an immediate `2`.

### For coding agents

```bash
is-dl login                                  # once, by a human, at a terminal
is-dl search -p frontend-intern --json       # anywhere, any cwd
is-dl runs show latest --json | jq '.jobs[].title'
```

Rules: always pass `--json`; parse stdout only; treat exit `3` as "ask the human to run `is-dl login`" and never try to work around it; treat exit `4` as "run `npx playwright install chromium`"; do not parse stderr, its format is not stable. A scrape takes minutes because of deliberate rate limiting, so set a generous timeout rather than retrying, and never run two searches concurrently against one session.

## 6. Saved search profiles

A profile is a named bag of `search` flags in config. Nothing more. No inheritance, no templating, no variables.

```toml
[profiles.frontend-intern]
keywords         = "frontend intern react"
location         = "Remote"
limit            = 40
remote-only      = true
experience-level = ["Internship"]
```

```
is-dl search --profile frontend-intern
is-dl search --profile frontend-intern --limit 10   # flag still wins
```

Resolution: defaults, then user config top level, then project config top level, then the named profile, then env, then flags. The profile sits above general config because naming it is a more specific act than setting a global default, and below flags because typing a flag is the most specific act of all.

`is-dl config set profiles.frontend-intern.limit 40` writes into the user config. An unknown `--profile` name is exit `6`, listing the profiles that do exist. `is-dl config get profiles` lists them.

## 7. Migration

**apps/api**

- Rename the package `@repo/api` to `is-dl`, drop `private`, add `bin`, add a tsdown build.
- New `src/paths.ts`: the single place XDG resolution happens. Everything else takes paths as arguments.
- New `src/config.ts`: load, merge, and validate config into a typed `ResolvedConfig`. Unknown keys are an error, not a silent ignore.
- `src/cli.ts` becomes a subcommand router built on `node:util` `parseArgs`. The current flat flag switch becomes `search`'s parser and keeps every existing flag name, so nothing a user types today stops working.
- `src/linkedin/browser.ts`: `SESSION_FILE` becomes a parameter. `waitForEnter` gains the TTY guard.
- `src/output.ts`: drop its `console.log`, return the path and let the caller report. Add the run index write.
- `src/scraper.ts` is nearly unchanged. It already takes `SearchOptions`, an `onLog`, and an `AbortSignal`, which is the right shape. Only `outDir` semantics change, and that is resolved before it is called.
- `src/server.ts` becomes the `serve` subcommand's body. Its route table does not change.

**REST server**

`/api/scrape` keeps its request shape. Its results endpoints change from reading `apps/api/out/` to reading the XDG runs dir, which is a one-line path swap now that `paths.ts` owns it. Response bodies are untouched, so `/api/results`, `/api/results/:id`, `/api/results/export`, `/api/logs`, and `/api/abort` all behave identically.

**apps/web**

No change. It talks to `http://localhost:3000/api/*` and those responses are stable.

**apps/tui**

No change to the Go code. One change to how it starts: `scripts/start-api-tui.sh` runs `is-dl serve` instead of `tsx src/server.ts`. `api.NewClient("http://localhost:3000")` and the `/api/logs` SSE goroutine are untouched.

**Backwards compatibility**

- Every existing `search` flag keeps its name and meaning. The only behavior change is where output lands by default, and `--out ./out` restores the old placement exactly.
- On first run, if `./storageState.json` exists in cwd and no XDG session does, move it and print one line saying so. Migrate once, then never look at cwd again.
- Existing files in `apps/api/out/` are not migrated. They are already committed to nobody's workflow, and `runs list` starting empty is honest. Point users at `--out` if they want the old directory.
- `vp run --filter @repo/api cli -- ...` stops working when the package is renamed. Keep a `cli` script on the renamed package so `vp run --filter is-dl cli -- ...` is the one-word fix.

## Open questions

- TOML parser dependency versus JSON config. I lean TOML for the comments, but if the dependency is unwelcome, JSON with no comments is survivable.
- Whether `runs` needs pruning. A run file is a few hundred KB, so probably not until someone complains, at which point `is-dl runs prune --keep 50`.

## Superseded

This document records the proposal as written. Two decisions since then changed
it, and the code is the source of truth where they disagree.

- **Scoring is gone.** A `score` command and a `gaps` command shipped and were
  then removed. Tag-presence matching approximated judgment badly: listings name
  few skills, the user has most of them, so nearly everything scored 100%. is-dl
  now reports only what it can establish as fact.
- **Resume storage is platform-native, not cwd.** Inputs (`resume.yaml`,
  `variants.yaml`, `preamble.tex`) live in the config dir under `resume/`.
  Generated `.tex`, `.pdf` and `.log` live in the data dir under `resume/build/`.
  `resume.dir` overrides the input location, `--out` the output location, and
  `is-dl resume path` prints both. This follows section 3's rule that the tool
  never writes to cwd by default.
- **macOS is not XDG-by-default.** Section 3 argued for XDG everywhere. The
  shipped `paths.ts` uses `~/Library` on macOS and `%APPDATA%` on Windows, with
  `XDG_*` still winning on every platform when set.
