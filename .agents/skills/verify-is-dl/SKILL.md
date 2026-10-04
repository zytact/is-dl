---
name: verify-is-dl
description: Build and drive the complete is-dl repository through its packed CLI, REST API, React website, and Go TUI with isolated state and preserved evidence. Use when verifying searches, saved results, browser workflows, terminal workflows, applications, notes, or resumes.
---

# Verify is-dl

`is-dl` has four user-facing surfaces: the packed CLI, REST API, React website, and Go TUI. One verification session builds all of them, starts an isolated API and website, and makes the same saved runs visible through every client.

Read `features/README.md`, then read every feature file for the surfaces touched by the change. A repo-wide change needs proof from each affected surface. An API response does not prove the website or TUI.

This skill has byte-identical copies under `.agents/skills/verify-is-dl/` and `.claude/skills/verify-is-dl/`. Commands use the `.agents` copy. Keep both copies identical.

## CLI-only changes

A change that only the CLI can show needs no session. Skip launch and run the working tree's CLI with isolated state:

```bash
C=.agents/skills/verify-is-dl/scripts/cli.sh

$C notes list --json
EDITOR='sed -i s/old/new/' $C --tty notes edit 4055 <noteId> --source unstop
$C --reset
```

`cli.sh` packs on every call, so it always runs this tree. State lives in `.local/verify-is-dl-cli/`, apart from a full session's, and it shares the stored LinkedIn login. `--tty` runs the command under a pseudo-terminal for paths that check for one, such as the `$EDITOR` flow. Point `EDITOR` at a non-interactive command, as above, and read the merged output on stdout. Use the full session below as soon as the change reaches the API, website or TUI.

## Launch

```bash
.agents/skills/verify-is-dl/scripts/launch.sh
```

The launcher:

- runs `vp run build` for the CLI, API, website, and TUI, then packs the CLI again so `dist` is
  this working tree rather than whatever the task cache replayed
- creates the disposable XDG config, data and cache roots under `.local/verify-is-dl/`
- points the XDG state root at `.local/verify-is-dl-login/state`, which persists
- starts the packed API on a free port
- starts the built website on a free port, with preview forwarding `/api` to that API
- starts a dedicated headless Chromium with a disposable profile and free CDP port
- records process IDs, build hashes, logs, URLs, browser paths, and the TUI tmux name in `session.env`

Free ports mean a session runs next to your own `vp run dev` and next to a session in another worktree. Read the ports from `session.env`, never assume 3000 or 5173.

Source the session before direct commands:

```bash
. ./.local/verify-is-dl/session.env
```

Three directories, and the differences matter:

- `.local/verify-is-dl/` is **run state**: config, saved runs, seen records, application records, notes, resume output, the browser profile, downloads, logs, and `session.env`. Cleanup deletes all of it. The TUI starts in `tui-work/`, so its ZIP export stays here too.
- `.local/verify-is-dl-login/` is the **LinkedIn session, and it persists**. Cleanup leaves it alone.
- `.local/verify-evidence/is-dl/` holds **proofs, and nothing deletes them**.

Playwright is the exception to the isolation, deliberately. It resolves its browser registry through `XDG_CACHE_HOME` on Linux, so an isolated cache hides the Chromium already installed on the machine and every LinkedIn proof fails as a missing dependency. `launch.sh` and `login.sh` pin `PLAYWRIGHT_BROWSERS_PATH` to the host's registry before moving the cache, so they use the same browser binary a real `is-dl` run would, and `npx playwright install chromium` installs where they will look. is-dl's own cache directory stays isolated.

Everything the skill writes is under `.local/`, which `.gitignore` already ignores as a whole, so a verification run leaves `git status` clean. Keep it that way: `.local/verify-is-dl-login/` holds a live LinkedIn cookie jar, and committing it would publish a working account session.

Readiness means `scripts/doctor.sh` passes. The CLI needs no process. Run it through `scripts/drive.sh`. Drive the dedicated verification browser through `scripts/browser.mjs`. Drive the TUI through `scripts/tui.sh`.

### Signing in

LinkedIn needs a stored session. It is a one-time human step, and it does not need a running verification session:

```bash
.agents/skills/verify-is-dl/scripts/login.sh
```

It needs a TTY and opens a real Chromium window. The session lands in `.local/verify-is-dl-login/state/is-dl/storageState.json`, and every later `launch.sh` reuses it, so a LinkedIn proof after the first one costs no login. LinkedIn expires the cookie eventually; run `login.sh` again when a search exits 3.

`scripts/login.sh logout` drops the stored session, and `IS_DL_VERIFY_LOGIN_DIR=<dir>` points at a different one, which is how you keep a second account. The launcher prints whether it found a session, and `doctor.sh` ends with the same note.

Only the state directory persists. `login.sh` points config, data and cache at scratch directories of its own, so it never reads or writes the developer's real is-dl state.

## Doctor

```bash
.agents/skills/verify-is-dl/scripts/doctor.sh
```

The doctor is read-only. It checks the session, Node version, packed CLI hash and version, build freshness, isolated paths, that the LinkedIn session sits outside the run directory, the TUI binary, recorded process IDs, exact port ownership, `/api/results`, the browser CDP endpoint, React hydration, and the isolated download path. It ends with a note saying whether a LinkedIn session is stored, which is a note and not a failure: an Unstop-only run is a correct run without one.

Run it whenever a screen, response, path, or build looks wrong. Cleanup and launch again when it reports a stale build. The product's `is-dl doctor` checks optional LinkedIn and resume dependencies, so it may fail correctly during an Unstop-only proof.

## Drive

### CLI

```bash
D=.agents/skills/verify-is-dl/scripts/drive.sh

$D --version
$D search -k software --source unstop --unstop-roles software-development --limit 1 --json
$D runs show latest --json
```

Pass `--json` whenever supported and parse stdout only. Preserve exit codes before piping. Exit 0 can include a failed source, so inspect `meta.sources[]`. LinkedIn-only exit 3 needs one `scripts/login.sh` in a TTY, which later runs reuse. Exit 4 needs `vp exec playwright install chromium` followed by a fresh launch. It installs into the host registry the harness pins, so one install serves every run.

### Website

The launcher starts a dedicated Chromium with a disposable profile and CDP port. Source `session.env`, then use the dependency-free CDP driver:

```bash
B=.agents/skills/verify-is-dl/scripts/browser.mjs
U="$IS_DL_VERIFY_WEB_URL"

node "$B" text "$U"
node "$B" click-text "$U" 'button[aria-pressed="true"]' LinkedIn
node "$B" fill "$U" '#keywords' software
node "$B" fill "$U" '#limit' 1
node "$B" shot --full "$U" "$EV/web-before.png"
node "$B" click "$U" 'button[type="submit"]'
node "$B" wait "$U" 'SCRAPE FINISHED' 120000
node "$B" click "$U" 'a[href="/results"]'
node "$B" wait "$U" 'DATA_REPOSITORIES'
node "$B" shot --full "$U" "$EV/web-results.png"
```

Stable handles owned by the website:

| Control          | Handle                                                                |
| ---------------- | --------------------------------------------------------------------- |
| Navigation       | links `Terminal`, `Payloads`                                          |
| Source selection | buttons `LinkedIn`, `Unstop`, with `aria-pressed`                     |
| Search form      | `#keywords`, `#location`, `#limit`, `#unstopOpportunity`              |
| Search action    | button `INITIATE_SEQUENCE`, then `EXECUTING...`                       |
| Abort            | button `ABORT`                                                        |
| Results          | heading `DATA_REPOSITORIES`, result row text, footer `Total Datasets` |
| Inspector        | heading `INSPECTOR_PROTOCOL`, button title `Back to List`             |
| Result actions   | button titles `View Raw JSON`, `Download JSON`, `Purge Record`        |

Drive the DOM through clicks and typing. A fetch call from the browser console proves the API, not the website.

### TUI

```bash
T=.agents/skills/verify-is-dl/scripts/tui.sh

$T start
$T capture "$EV/tui-scrape.txt"
$T key 3
$T capture "$EV/tui-results.txt"
$T key Enter
$T capture "$EV/tui-run-detail.txt"
$T stop
```

`tui.sh` owns one tmux session and supports `start`, `send <literal text>`, `key <tmux key>`, `capture <file>`, and `stop`. Captures contain the rendered terminal after each action. Use `Tab`, `BTab`, `Up`, `Down`, `Space`, `Enter`, and the app's numbered tabs. The TUI reads the same API state as the website and CLI.

## Evidence

Create one proof directory per run:

```bash
EV="$IS_DL_VERIFY_EVIDENCE_ROOT/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$EV"
.agents/skills/verify-is-dl/scripts/doctor.sh >"$EV/doctor.txt"
```

Keep action and result evidence together:

- CLI: command text, stdout, stderr, exit code, and written state
- API: method, URL, request body, status, response body, and resulting files
- Website: before and after screenshots or a recording, visible text, and the matching API or run-store state
- TUI: capture before the key sequence, capture after it, and the matching API or run-store state

Use the real public path. A website proof types into the form and clicks its button. A TUI proof sends keys to the running binary. Stateful proofs inspect both the visible result and the persisted file. Mocks stay in unit tests at existing source boundaries.

Unstop is the default live source because it needs no account. `--out -` skips the run store and cannot prove cross-surface persistence. Never submit an application during verification. `apps add` only records local state.

Store proofs under `.local/verify-evidence/is-dl/<UTC timestamp>/`. Cleanup preserves that tree, and `.gitignore` excludes `.local/`.

## Cleanup

```bash
.agents/skills/verify-is-dl/scripts/cleanup.sh
```

Cleanup stops the exact recorded TUI session, dedicated browser, website, and API. It then removes only `.local/verify-is-dl/`. Evidence under `.local/verify-evidence/is-dl/` and the stored LinkedIn login under `.local/verify-is-dl-login/` both survive.

Run cleanup after failed attempts. If launch failed before writing `session.env`, it already stops any process it started. Never kill by process name or by port.

## Helpers

| Script                | Purpose                                                      |
| --------------------- | ------------------------------------------------------------ |
| `scripts/cli.sh`      | Run this tree's CLI with isolated state and no session       |
| `scripts/launch.sh`   | Build every app and start isolated API, website, and browser |
| `scripts/login.sh`    | Store one LinkedIn session that survives cleanup             |
| `scripts/doctor.sh`   | Check builds, isolation, processes, ports, API, and browser  |
| `scripts/drive.sh`    | Run the packed CLI inside the isolated session               |
| `scripts/browser.mjs` | Drive and capture the dedicated Chromium over CDP            |
| `scripts/tui.sh`      | Start, drive, capture, and stop the TUI tmux session         |
| `scripts/cleanup.sh`  | Stop owned processes, remove scratch state, keep evidence    |
