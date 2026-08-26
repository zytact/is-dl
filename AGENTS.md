# AGENTS

Use concise language.

## Repo shape

- Vite+ monorepo with three apps:
  - `apps/api` — the `is-dl` CLI (Node + Playwright), which also hosts the REST API
  - `apps/web` — React + Vite + Tailwind frontend
  - `apps/tui` — Go TUI

## Setup

- Install deps: `vp install`
- Install Playwright Chromium once: `vp exec playwright install chromium`

## Dev commands

| Command              | What it does               |
| -------------------- | -------------------------- |
| `vp run dev`         | API + web                  |
| `vp run dev:api`     | API only, port 3000        |
| `vp run dev:web`     | Web only, port 5173        |
| `vp run dev:tui`     | API + TUI, API logs hidden |
| `vp run dev:api:tui` | Alias for `dev:tui`        |
| `vp run build`       | Build all apps             |
| `vp check`           | Format, lint, typecheck    |
| `vp test run`        | Tests                      |

## apps/api

Published as `is-dl`. `vp pack` builds `dist/cli.mjs` (the `is-dl` bin) and `dist/server.mjs`.

- **Entry:** `src/cli.ts`, a `node:util` `parseArgs` subcommand router.
- **Commands:** `src/commands/`; search, login, logout, runs, config, serve, doctor.
- **Paths:** `src/paths.ts` is the only place config/data/state/cache directories are resolved. Linux uses XDG, macOS uses `~/Library`, Windows uses `%APPDATA%`/`%LOCALAPPDATA%`. `XDG_*` wins everywhere when set.
- **Config:** `src/config.ts`; TOML. Precedence is flags > `IS_DL_*` env > project `.is-dl.toml` > user `config.toml` > defaults.
- **Server:** `src/server.ts` exports `startServer()`; routes all under `/api/`, manual `if url.pathname === ...`.
- **Scraper:** `src/scraper.ts`; `runScraper()` handles pagination, details, abort signal, 1-3s rate limit, and returns `ScraperOutput` without writing.
- **Runs:** `src/runs.ts` owns the run files and `index.json` in the data directory.
- **Browser:** `src/linkedin/browser.ts`; the session file is a parameter, and it refuses to prompt without a TTY.
- **Exit codes:** `src/errors.ts`; 0 ok, 1 error, 2 usage, 3 auth, 4 dependency, 5 aborted, 6 config.

### Triage

- **Pay:** `src/pay.ts` classifies each listing as paid, token, unpaid or unstated with the matched snippet as evidence. `search --exclude-unpaid` drops unpaid and token only.
- **Location:** `src/location-conflict.ts` flags a Remote tag whose body text demands attendance. Never filtered, only surfaced.
- **Applications:** append-only JSONL at the data dir (`src/applications.ts`). The last record for a jobId is its state. `search --exclude-seen` skips anything already logged.
- No scoring. Tag matching was removed because it scored nearly every listing at 100% and dressed up a guess as a number. is-dl reports facts and leaves fit to the reader.
- is-dl never submits an application. Search, filter, log, build a PDF.

### Resume pipeline

- `src/resume/` holds the schema, the single LaTeX escape function, and the tectonic build.
- Inputs live in the config dir under `resume/`, next to `config.toml`: `preamble.tex` (frozen), `resume.yaml` (superset of facts) and `variants.yaml` (headline, section order, lead/drop/tags). Config `resume.dir`, `IS_DL_RESUME_DIR` or `--dir` overrides it.
- Outputs land in the data dir under `resume/build/`, next to runs. `--out <dir>` overrides it. `is-dl resume path` prints both.
- `tags` on an item or bullet is a selector for the `tags` variant filter. Nothing requires it.
- The pipeline selects. It never writes prose: every sentence in a built PDF is copied verbatim from resume.yaml.
- Two gates on every build: page count parsed from the LaTeX log (>1 page fails and names the section), and a pdftotext extraction check. FontAwesome icons garble the text stream under both engines and are not a regression.
- Engine is tectonic (XeTeX). The preamble picks XCharter via fontspec under non-pdfTeX so bold survives, and `\AND` is a plain `\textbar` emitted only between contact items.

### Resume workflow

```bash
is-dl resume path                  # where inputs and builds live
is-dl resume init                  # scaffold the three input files
$EDITOR "$(is-dl resume path --json | jq -r .input)/resume.yaml"
is-dl resume check                 # what each variant would include
is-dl resume build --all           # every variant, each gated at 1 page
```

## apps/web

- **Router:** TanStack Router, code routes in `src/router.tsx`.
- **Routes:** `/`, `/results`.
- **API:** Direct `fetch` to `http://localhost:3000/api/*`.
- **Styling:** Tailwind CSS v4 via `@tailwindcss/vite`.

## apps/tui

- **Go package:** `github.com/arnab/is-dl-tui`
- **NPM package:** `@repo/tui`
- **Framework:** Bubble Tea.
- **HTTP:** `api.NewClient("http://localhost:3000")`.
- **SSE:** `/api/logs` goroutine -> Bubble Tea channel.

## CLI

```bash
vp run --filter is-dl cli -- search --keywords "..." --location "..."
is-dl search -k "..." --json    # after npm i -g is-dl
```

Agents should always pass `--json`, parse stdout only, and treat exit 3 as "ask a human to run `is-dl login`" and exit 4 as "run `npx playwright install chromium`".

## Tech notes

- API CORS open.
- Oxlint/Oxfmt configured in root `vite.config.ts`.
- Vite+ hooks via `prepare: vp config`.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
