---
name: verify-is-dl
description: Build and drive the complete is-dl repository through its packed CLI, REST API, React website, and Go TUI with isolated state and preserved evidence. Use when verifying searches, saved results, browser workflows, terminal workflows, applications, notes, or resumes.
---

# Verify is-dl

`is-dl` has four user-facing surfaces: the packed CLI, REST API, React website, and Go TUI. One verification session builds all of them, starts an isolated API and website, and makes the same saved runs visible through every client.

Read `features/README.md`, then read every feature file for the surfaces touched by the change. A repo-wide change needs proof from each affected surface. An API response does not prove the website or TUI.

This skill has byte-identical copies under `.agents/skills/verify-is-dl/` and `.claude/skills/verify-is-dl/`. Commands use the `.agents` copy. Keep both copies identical.

## Launch

```bash
.agents/skills/verify-is-dl/scripts/launch.sh
```

The launcher:

- refuses to start when port 3000 or 5173 already has a listener
- runs `vp run build` for the CLI, API, website, and TUI
- creates four isolated XDG roots under `.local/verify-is-dl/`
- starts the packed API on port 3000
- starts the built website on port 5173
- starts a dedicated headless Chromium with a disposable profile and free CDP port
- records process IDs, build hashes, logs, URLs, browser paths, and the TUI tmux name in `session.env`

Source the session before direct commands:

```bash
. ./.local/verify-is-dl/session.env
```

Every config file, saved run, seen record, application record, note, resume file, LinkedIn session, and API cache entry produced by the run stays inside `.local/verify-is-dl/`. The TUI starts in `.local/verify-is-dl/tui-work/`, so its ZIP export also stays isolated.

Readiness means `scripts/doctor.sh` passes. The CLI needs no process. Run it through `scripts/drive.sh`. Drive the dedicated verification browser through `scripts/browser.mjs`. Drive the TUI through `scripts/tui.sh`.

LinkedIn needs a session inside the isolated state directory. Create it only for a LinkedIn proof:

```bash
.agents/skills/verify-is-dl/scripts/drive.sh login
```

That command needs a TTY and opens Chromium. Cleanup deletes this verification-only login.

## Doctor

```bash
.agents/skills/verify-is-dl/scripts/doctor.sh
```

The doctor is read-only. It checks the session, Node version, packed CLI hash and version, build freshness, isolated paths, TUI binary, recorded process IDs, exact port ownership, `/api/results`, the browser CDP endpoint, React hydration, and the isolated download path.

Run it whenever a screen, response, path, or build looks wrong. Cleanup and launch again when it reports a stale build. The product's `is-dl doctor` checks optional LinkedIn and resume dependencies, so it may fail correctly during an Unstop-only proof.

## Drive

### CLI

```bash
D=.agents/skills/verify-is-dl/scripts/drive.sh

$D --version
$D search -k software --source unstop --unstop-roles software-development --limit 1 --json
$D runs show latest --json
```

Pass `--json` whenever supported and parse stdout only. Preserve exit codes before piping. Exit 0 can include a failed source, so inspect `meta.sources[]`. LinkedIn-only exit 3 needs `$D login` in a TTY. Exit 4 needs `vp exec playwright install chromium` followed by a fresh launch.

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

Cleanup stops the exact recorded TUI session, dedicated browser, website, and API. It then removes only `.local/verify-is-dl/`. Evidence under `.local/verify-evidence/is-dl/` survives.

Run cleanup after failed attempts. If launch failed before writing `session.env`, it already stops any process it started. Never kill by process name or by port.

## Helpers

| Script                | Purpose                                                      |
| --------------------- | ------------------------------------------------------------ |
| `scripts/launch.sh`   | Build every app and start isolated API, website, and browser |
| `scripts/doctor.sh`   | Check builds, isolation, processes, ports, API, and browser  |
| `scripts/drive.sh`    | Run the packed CLI inside the isolated session               |
| `scripts/browser.mjs` | Drive and capture the dedicated Chromium over CDP            |
| `scripts/tui.sh`      | Start, drive, capture, and stop the TUI tmux session         |
| `scripts/cleanup.sh`  | Stop owned processes, remove scratch state, keep evidence    |
