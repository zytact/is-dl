# AGENTS

## Repo shape

- The root package **is** `is-dl`, the CLI (Node + Playwright), which also hosts the REST API. Its source lives in `apps/api/`, which is a plain folder with no `package.json` of its own. That is what makes `vp pack && vp install -g .` work from the root.
- Two workspace packages under `apps/*`:
  - `apps/web` — React + Vite + Tailwind frontend
  - `apps/tui` — Go TUI

## Setup

- Install deps: `vp install`
- Install Playwright Chromium once: `vp exec playwright install chromium`
- Dev, build, check and test scripts are in `package.json`. `vp run <name>` runs a script, `vp <name>` runs a built-in, and a script never shadows a built-in.

## apps/api

Source for the root `is-dl` package. `vp pack` reads its `pack` block from the root `vite.config.ts` and writes `dist/cli.mjs` (the `is-dl` bin) and `dist/server.mjs` to the repo root, not to `apps/api/`.

Install it globally from a checkout with `vp pack && vp install -g .`. Run that in a shell rather than through `vp run`, which delegates to the local `vite-plus` package and rejects `-g`.

- **Version:** `readVersion()` in `src/cli.ts` walks up to the nearest `package.json`. The bin sits at `<root>/dist/cli.mjs` when packed and `<root>/apps/api/src/cli.ts` under tsx, so a hard-coded `../package.json` is right in only one of them. It throws rather than falling back to a placeholder, because a version it cannot read means the package was assembled wrong.

- **Entry:** `src/cli.ts`, a `node:util` `parseArgs` subcommand router. Commands are dynamic imports resolved on dispatch, so `--version`, `notes` and `config` never load Playwright or the server. Do not import a command at the top of `cli.ts`.
- **Commands:** `src/commands/`; search, login, logout, runs, config, serve, doctor.
- **Paths:** `src/paths.ts` is the only place config/data/state/cache directories are resolved. `ensureDir` lives in `src/fs.ts`, not `runs.ts`, so the seen ledger and the run store can both use it without a cycle. `XDG_*` wins over the platform default everywhere.
- **Config:** `src/config.ts`; TOML. Precedence is flags > `IS_DL_*` env > project `.is-dl.toml` > user `config.toml` > defaults.
- **Server:** `src/server.ts` exports `startServer()`; routes all under `/api/`, manual `if url.pathname === ...`.
- **Sources:** `src/sources.ts` defines `SourceRunner` and `runSources()`, which runs every selected source concurrently and merges the results. `src/scraper.ts` only builds runners from a `ScrapeRequest` and hands them over. Neither writes anything.
- **Runs:** `src/runs.ts` owns the run files and `index.json` in the data directory. Each index entry carries the run's own `meta`, so listing history costs one index read instead of parsing every saved listing. An entry with no `meta` predates the cache; `listRuns` reads that run file and rewrites the index. `/api/results` answers from the index and never opens a run file.
- **Browser:** `src/linkedin/browser.ts`; the session file is a parameter, and it refuses to prompt without a TTY.
- **Exit codes:** `src/errors.ts`.

### Sources

`search` queries LinkedIn and Unstop together by default and merges them into one `ScraperOutput`.

- **Selecting:** `--source linkedin`, `--source unstop`, or a comma-separated subset. Config key `sources`, env `IS_DL_SOURCES`, same precedence as everything else. An unknown name is a config error.
- **Adding one:** write a factory returning `SourceRunner` (`src/linkedin/source.ts`, `src/unstop/source.ts`). The factory captures whatever that source needs, so LinkedIn's Playwright options never reach Unstop and vice versa. `SearchQuery` holds only what every source is asked for: keywords, location, limit, remote-only. `--experience-level`, `--job-type` and `--posted-within` are LinkedIn URL filters and live in `LinkedInOptions`, though `meta.filters` still records them for every run.
- **Partial failure is normal.** LinkedIn throws `AUTH_REQUIRED` with no session; Unstop needs no auth. A failing source is logged and recorded in `meta.sources[]`, and the command still exits 0 as long as one source succeeded. Only when every source fails does the command fail, and a lone failing source keeps its own exit code, so a LinkedIn-only search with no session still exits 3.
- **`--limit` is per source**, not a total, and counts jobs that passed `known`, not rows fetched.
- **Merge order:** newest first by `postedAtIso`, undated last, ties broken by source then job id. A single source keeps its own ordering.
- **Logs** from concurrent sources are prefixed `[linkedin]` / `[unstop]`.
- **`meta.source`** is the comma-joined list of sources that returned jobs; `meta.sources[]` carries the per-source status, count and error. Run files written before this existed have `source` but no `sources`, and readers must not assume it is there. `readRun` and `listRuns` return `PersistedRun`, not `ScraperOutput`: a missing `sources` is normalized to `null`, which the type forces callers to handle. It is never filled in, because a legacy file cannot say which sources ran.

### Unstop

`src/unstop/`. Plain `fetch` against `https://unstop.com/api/public/opportunity/search-result`, which needs no auth, no cookies and no user-agent spoofing. robots.txt has `Allow: /api/public/*`.

- **`api.ts`** builds the URL and parses the Laravel paginator. Always `oppstatus=open` and `per_page=100`; above 100 the endpoint silently drops rows.
- **`--unstop-opportunity`** picks the corpus: jobs, internships, hackathons, competitions. They are separate, not filters over one set.
- **`--unstop-roles`** takes work function slugs (`software-development`, `frontend-development`, `backend-development`, `full-stack-development`). This is the only filter that actually narrows the corpus, and the tech slice is small: about 72 jobs of 1055, which fits one page.
- **`searchTerm` is not used.** It matches titles only and returns nothing for `typescript`, `django`, `kubernetes` and most other tech terms. `--keywords` is matched here instead, as an AND over the title, employer-stated skills and the description. `--location` and `--remote-only` are also applied locally, because `location=`, `city=` and friends are silently ignored by the endpoint.
- **No detail fetch.** Every row ships `details`, the full description as HTML. `map.ts` converts it to text before `pay.ts` and `ai-agent-detector.ts` see it.
- **Pagination is unstable** across the full corpus: rows repeat and others are never shown. The source dedupes on `id` and logs a warning when the unique count is short of the reported total rather than implying it saw everything.
- **Classification runs last.** `toJobFacts` reads what the row says about itself; `classify` adds pay, location-conflict and AI-agent readings. Known ids are dropped before either, and the keyword and location filters read only the facts, so a row that is not kept never reaches a classifier. `toJobListing` is still both steps for callers that want the whole listing. Paging stops mid-page once `--limit` is met.
- **Paging is driven by kept rows, not fetched rows.** The filters run locally, so the loop keeps requesting pages until `--limit` rows have passed them or the pages run out. Counting fetched rows would stop on page one and never see the matches behind it.
- **Pay comes from `jobDetail`.** Top-level `isPaid` is about registration fees and must never be read as compensation. Figures are only reported when `show_salary === 1` and `not_disclosed` is false, and they land in `PayInfo.amount` rather than being re-derived from prose. `paid_unpaid: "unpaid"` is taken at face value; `"paid"` without figures falls back to the prose classifier first.
- **AI-generated skills are dropped.** `required_skills[].pivot.ai_generated` is often true, and those are Unstop's guesses. Only employer-stated skills reach `requirementsText`.
- **`approved_date`** is `"2026-08-27 17:41:42 GMT+0530"`, which `Date` will not parse. `parseApprovedDate` handles it.
- The live corpus contains test listings, for example "DO NOT REGISTER" rows from "Unstop Testing".

### Triage

- **Pay:** `src/pay.ts` classifies each listing as paid, token, unpaid or unstated with the matched snippet as evidence. `search --exclude-unpaid` drops unpaid and token only.
- **Location:** `src/location-conflict.ts` flags a Remote tag whose body text demands attendance. Never filtered, only surfaced. Sources that publish the workplace as data pass `workplace` instead of leaving it to be read out of tag text.
- **Applications:** append-only JSONL at the data dir (`src/applications.ts`). The last record for a job is its state, keyed by `source:jobId` because two boards hand out colliding numeric ids. `ApplicationRecord.jobSource` names the board; records written before Unstop have none and are read as LinkedIn. `ApplicationRecord.source` is unrelated provenance, a runId or `manual`. `apps status` and `apps show` take `--source` when one id exists on both boards. `search --exclude-applied` skips anything already logged, and it reaches the sources rather than filtering afterwards, so a logged LinkedIn job is never clicked and never uses a `--limit` slot.
- **Notes:** one markdown file per note in the data dir under `notes/<source>/<jobId>/` (`src/notes.ts`), holding whatever text matters about a job, so a hiring doc, a recruiter email, or terms the listing never states. Files rather than JSONL, because the text is the point and it stays greppable and editable outside is-dl.
  - **The path is the identity.** Source, job id and note id come from where the file sits, so front matter cannot disagree with it. Front matter carries `title`, `url`, `company`, `role` and `createdAt` only. Reading is forgiving, so a file dropped into the directory by hand is a note, titled by its first line.
  - **An edit never renames the file.** `notes edit` rewrites a note in place, so `--title` changes the front matter and the path keeps the title it was filed under. Renaming would break every link to the note and re-date it, since the file name carries the stamp. With no `--text`, no `--file` and nothing piped in, the body alone goes into `$EDITOR`, which is why front matter cannot be corrupted by a stray keystroke.
  - **An edit that changes nothing says so.** `updateNote` compares before it writes and returns `changed: false` without touching the file. An editor that hands off to a running instance and returns at once (`code` without `-w`) would otherwise report a successful edit of text the user had not typed yet. The `$EDITOR` draft is deleted only after it is safely back in the note, and an editor that exits non-zero leaves it where the error message says, because it may hold the only copy of what was written.
  - **An edit that names only front matter never asks for a body.** `--title` alone would otherwise wait on an editor, or read an empty stdin and fail as an empty note.
  - **The body is stored byte for byte.** Nothing trims it, because indentation and trailing whitespace are meaningful in the markdown a note usually holds. `serializeNote` writes `---\n<yaml>---\n<body>` with no blank line of its own, which is what makes the round trip exact.
  - **Attachments are bytes, not text.** `notes attach` copies a file into `notes/<source>/<jobId>/files/` unchanged, for a PDF brief or a docx take-home. File names are sanitized rather than rejected, so `take home.docx` becomes `take-home.docx`.
  - **`noteId` is `<stamp>-<slug>`**, for example `20260903T101500Z-hiring-process`. No colons, because Windows will not store them. A second note with the same title in the same second gets `-2`.
  - **Notes are not tied to the application log.** Note a job while deciding whether to apply. `apps show` lists what a job has; nothing filters on notes.
  - **The board has to be known** before a note can be filed, so `notes add` reads it from the run that surfaced the job and demands `--source` when no run holds the id. `notes list` needs neither and spans both boards.
  - **`findJob` in `src/commands/shared.ts` reads every run even after a hit.** The two boards hand out colliding ids, so returning the first match would file a note or an application under whichever board was searched most recently. It throws when an id spans both and no `--source` was given. Do not restore the early return.
  - Job ids and note ids become file names, so `src/notes.ts` rejects anything outside `[A-Za-z0-9._-]`.
- **Seen listings:** append-only JSONL at the data dir (`src/seen.ts`), one line per job the first time a saved run surfaces it, keyed the same `source:jobId` way. `saveRun` writes it, so anything reaching the run store is in the ledger whether or not the search filtered on one. `search --exclude-seen` drops what an earlier run already showed, which is a different question from `--exclude-applied`.
  - **The sources filter, not just the command.** `SearchQuery.known` is handed to every source, which skips a known job while paging, so `--limit 25` yields 25 jobs worth reading instead of 25 rows minus whatever gets thrown away afterwards. It is the union of `--exclude-seen` and `--exclude-applied`, which is why the sources say "already seen or applied to" and cannot say which. Without this the flag decays to nothing on a repeated query. `applyTriage` in `src/commands/search.ts` filters again as a safety net for LinkedIn cards whose id was unreadable before the click.
  - **`KnownJobs.has` takes a non-null id**, so a caller has to deal with `jobId: null` rather than trusting the predicate to. A job with no id cannot be tracked and always resurfaces.
  - **The run store is the source of truth.** `rebuildSeen` in `src/runs.ts` walks runs oldest first so each job is dated by the run that found it. Every path that touches the ledger backfills first, reads and writes alike: guarding only the read would strand a user who upgrades and runs a plain search, since that search writes a ledger holding its own jobs and the file then exists. Deleting `seen.jsonl` costs one directory scan, not the history.
  - **`--out <dir>` and `-o -` bypass `saveRun`**, so those runs never enter the ledger.
  - **LinkedIn waits for the page, not the clock.** `clickJobCard` blocks until `currentJobId` in the URL is the card that was clicked, and `goToNextPage` blocks until the top card of the results list changes. Both poll from Node, because the API package has no DOM lib and injected page functions cannot be typed. Both give up after 15s and carry on: a slow load should cost a wait, not a job. The remaining sleeps are deliberate pacing between requests, so do not fold them into the readiness waits.
  - **LinkedIn stops after 5 consecutive extraction failures.** A failed card no longer uses up `--limit`, which is right for one flaky card and wrong for a DOM change: without the bound, a scraper that can no longer extract anything would walk every page of the results retrying.
- No scoring. Tag matching was removed because it scored nearly every listing at 100% and dressed up a guess as a number. is-dl reports facts and leaves fit to the reader.
- is-dl never submits an application. Search, filter, log, build a PDF.

### Resume pipeline

- `src/resume/` holds the schema, the single LaTeX escape function, and the tectonic build.
- Inputs live in the config dir under `resume/`, next to `config.toml`: `preamble.tex` (frozen), `resume.yaml` (superset of facts) and `variants.yaml` (headline, section order, lead/drop/tags). Config `resume.dir`, `IS_DL_RESUME_DIR` or `--dir` overrides it.
- Outputs land in the data dir under `resume/build/`, next to runs. `--out <dir>` overrides it. `is-dl resume path` prints both.
- Each variant builds into its own folder as `resume/build/<variant>/resume.pdf`, so the file is ready to upload under the name a recruiter sees, and nothing has to be copied or renamed first. The folder name is the variant name, which is why `parseVariants` rejects anything outside `[A-Za-z0-9._-]`.
- `tags` on an item or bullet is a selector for the `tags` variant filter. Nothing requires it.
- The pipeline selects. It never writes prose: every sentence in a built PDF is copied verbatim from resume.yaml.
- **Inline markup.** Bullet text and the `text` of a labelled item take `**bold**` and `[text](url)`; a backslash escapes the next character. `src/resume/inline.ts` parses it at schema load, so `Bullet.text` and `TextItem.text` are `Inline[]`, not strings, and a renderer cannot forget to handle a link. Unclosed `**`, a `[text]` with no `(url)` and an empty url are config errors, so a typo fails the build instead of printing asterisks. Nothing is inferred: is-dl never decides which words are important or which PR a number refers to. Quote any YAML value holding a `#`.
- `renderInline` escapes leaf text only, which keeps `escapeLatex` running exactly once per character. The extraction gate probes with `plainInline`, the markup stripped, since that is what lands in the PDF text stream.
- Two gates on every build: page count parsed from the LaTeX log (>1 page fails and names the section), and a pdftotext extraction check. FontAwesome icons garble the text stream under both engines and are not a regression.
- Engine is tectonic (XeTeX). The preamble picks XCharter via fontspec under non-pdfTeX so bold survives, and `\AND` is a plain `\textbar` emitted only between contact items.

## apps/web

- **API:** Direct `fetch` to `http://localhost:3000/api/*`. List fields go over the wire as JSON arrays.
- **Logs:** `src/scraper-stream.ts` owns the one `EventSource` the page has, refcounted across subscribers and read through `useScraperStream`. Both the layout and the terminal need the same stream, and a second connection would double the traffic to show the same thing twice. Lines are batched every 100ms, timestamped on arrival, and capped at the most recent 2000. The server replays its whole log on connect, so connecting clears what is on screen instead of appending to it. The Go TUI caps its console the same way, and its event pump drains the channel into one `LogEventsMsg`, so a burst of lines is one join and one viewport reset rather than one of each per line.
- **Types:** the board contracts (`JobSource`, `PayInfo`, `SourceRun` and friends) are the CLI's. `apps/web/src/types.ts` imports `apps/api/src/types.ts` by relative path and re-exports it alongside the browser-only labels. Keep `types.ts` free of Node imports or the web bundle pulls in Playwright. The root package also publishes the same file as `is-dl/types` for consumers outside the repo; the web app does not go through it, because the CLI is the root package and pnpm has nothing to link into `apps/web/node_modules`.

## CLI

```bash
vp run cli search --keywords "..." --location "..."
is-dl search -k "..." --json    # after npm i -g is-dl
is-dl search -k developer --source unstop --unstop-roles software-development --json
```

`vp run cli` forwards a literal `--`, which `parseArgs` then treats as the start of positionals. Pass the subcommand directly, with no `--` separator.

Agents should always pass `--json`, parse stdout only, and treat exit 3 as "ask a human to run `is-dl login`" and exit 4 as "run `npx playwright install chromium`". Check `meta.sources[]` before trusting a count: exit 0 does not mean every source ran.

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

<!--VITE PLUS END-->

## Validation

Run `vp install` after pulling remote changes. After any change, run:

```sh
vp check
vp run test
```

`vp check` formats, lints and type checks in one pass. `vp run test` runs the Vitest suite and the Go TUI tests together.

Check `package.json` and `vite.config.ts` for scripts or tasks a change touches, and run them with `vp run <name>`. If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.
