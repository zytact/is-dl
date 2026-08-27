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
- **Sources:** `src/sources.ts` defines `SourceRunner` and `runSources()`, which runs every selected source concurrently and merges the results. `src/scraper.ts` only builds runners from a `ScrapeRequest` and hands them over. Neither writes anything.
- **Runs:** `src/runs.ts` owns the run files and `index.json` in the data directory.
- **Browser:** `src/linkedin/browser.ts`; the session file is a parameter, and it refuses to prompt without a TTY.
- **Exit codes:** `src/errors.ts`; 0 ok, 1 error, 2 usage, 3 auth, 4 dependency, 5 aborted, 6 config.

### Sources

`search` queries LinkedIn and Unstop together by default and merges them into one `ScraperOutput`.

- **Selecting:** `--source linkedin`, `--source unstop`, or a comma-separated subset. Config key `sources`, env `IS_DL_SOURCES`, same precedence as everything else. An unknown name is a config error.
- **Adding one:** write a factory returning `SourceRunner` (`src/linkedin/source.ts`, `src/unstop/source.ts`). The factory captures whatever that source needs, so LinkedIn's Playwright options never reach Unstop and vice versa. `SearchQuery` holds only what every source is asked for: keywords, location, limit, remote-only. `--experience-level`, `--job-type` and `--posted-within` are LinkedIn URL filters and live in `LinkedInOptions`, though `meta.filters` still records them for every run.
- **Partial failure is normal.** LinkedIn throws `AUTH_REQUIRED` with no session; Unstop needs no auth. A failing source is logged and recorded in `meta.sources[]`, and the command still exits 0 as long as one source succeeded. Only when every source fails does the command fail, and a lone failing source keeps its own exit code, so a LinkedIn-only search with no session still exits 3.
- **`--limit` is per source**, not a total.
- **Merge order:** newest first by `postedAtIso`, undated last, ties broken by source then job id. A single source keeps its own ordering.
- **Logs** from concurrent sources are prefixed `[linkedin]` / `[unstop]`.
- **`meta.source`** is the comma-joined list of sources that returned jobs; `meta.sources[]` carries the per-source status, count and error. Run files written before this existed have `source` but no `sources`, and readers must not assume it is there.

### Unstop

`src/unstop/`. Plain `fetch` against `https://unstop.com/api/public/opportunity/search-result`, which needs no auth, no cookies and no user-agent spoofing. robots.txt has `Allow: /api/public/*`.

- **`api.ts`** builds the URL and parses the Laravel paginator. Always `oppstatus=open` and `per_page=100`; above 100 the endpoint silently drops rows.
- **`--unstop-opportunity`** picks the corpus: jobs, internships, hackathons, competitions. They are separate, not filters over one set.
- **`--unstop-roles`** takes work function slugs (`software-development`, `frontend-development`, `backend-development`, `full-stack-development`). This is the only filter that actually narrows the corpus, and the tech slice is small: about 72 jobs of 1055, which fits one page.
- **`searchTerm` is not used.** It matches titles only and returns nothing for `typescript`, `django`, `kubernetes` and most other tech terms. `--keywords` is matched here instead, as an AND over the title, employer-stated skills and the description. `--location` and `--remote-only` are also applied locally, because `location=`, `city=` and friends are silently ignored by the endpoint.
- **No detail fetch.** Every row ships `details`, the full description as HTML. `map.ts` converts it to text before `pay.ts` and `ai-agent-detector.ts` see it.
- **Pagination is unstable** across the full corpus: rows repeat and others are never shown. The source dedupes on `id` and logs a warning when the unique count is short of the reported total rather than implying it saw everything.
- **Paging is driven by kept rows, not fetched rows.** The filters run locally, so the loop keeps requesting pages until `--limit` rows have passed them or the pages run out. Counting fetched rows would stop on page one and never see the matches behind it.
- **Pay comes from `jobDetail`.** Top-level `isPaid` is about registration fees and must never be read as compensation. Figures are only reported when `show_salary === 1` and `not_disclosed` is false, and they land in `PayInfo.amount` rather than being re-derived from prose. `paid_unpaid: "unpaid"` is taken at face value; `"paid"` without figures falls back to the prose classifier first.
- **AI-generated skills are dropped.** `required_skills[].pivot.ai_generated` is often true, and those are Unstop's guesses. Only employer-stated skills reach `requirementsText`.
- **`approved_date`** is `"2026-08-27 17:41:42 GMT+0530"`, which `Date` will not parse. `parseApprovedDate` handles it.
- The live corpus contains test listings, for example "DO NOT REGISTER" rows from "Unstop Testing".

### Triage

- **Pay:** `src/pay.ts` classifies each listing as paid, token, unpaid or unstated with the matched snippet as evidence. `search --exclude-unpaid` drops unpaid and token only.
- **Location:** `src/location-conflict.ts` flags a Remote tag whose body text demands attendance. Never filtered, only surfaced. Sources that publish the workplace as data pass `workplace` instead of leaving it to be read out of tag text.
- **Applications:** append-only JSONL at the data dir (`src/applications.ts`). The last record for a job is its state, keyed by `source:jobId` because two boards hand out colliding numeric ids. `ApplicationRecord.jobSource` names the board; records written before Unstop have none and are read as LinkedIn. `ApplicationRecord.source` is unrelated provenance, a runId or `manual`. `apps status` and `apps show` take `--source` when one id exists on both boards. `search --exclude-seen` skips anything already logged.
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
vp run --filter is-dl cli search --keywords "..." --location "..."
is-dl search -k "..." --json    # after npm i -g is-dl
is-dl search -k developer --source unstop --unstop-roles software-development --json
```

`vp run --filter is-dl cli` forwards a literal `--`, which `parseArgs` then treats as the start of positionals. Pass the subcommand directly, with no `--` separator.

Agents should always pass `--json`, parse stdout only, and treat exit 3 as "ask a human to run `is-dl login`" and exit 4 as "run `npx playwright install chromium`". Check `meta.sources[]` before trusting a count: exit 0 does not mean every source ran.

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
