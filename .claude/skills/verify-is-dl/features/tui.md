# TUI

The Go terminal interface for search configuration, live logs, saved runs, job inspection, ZIP export, and deletion.

## Sub-features

- Navigate SCRAPE, LOGS, and RESULTS with Tab, Shift+Tab, or keys 1 through 3.
- Edit search inputs, source checkboxes, opportunity choices, role filters, and toggles.
- Start and abort a scrape.
- Follow the SSE status and log stream.
- Refresh, inspect, filter, export, and delete saved results.
- Open a full job detail and move between jobs.

## How to get to it (user POV)

Launch the verification session, then run `scripts/tui.sh start`. It starts the built `is-dl-tui` binary in a 120 by 40 tmux pane against the isolated API.

## Driving it with tmux

```bash
T=.agents/skills/verify-is-dl/scripts/tui.sh

$T start
$T capture "$EV/tui-scrape-before.txt"
$T key 3
$T capture "$EV/tui-results.txt"
$T key Enter
$T capture "$EV/tui-run-detail.txt"
$T key Enter
$T capture "$EV/tui-job-detail.txt"
$T key b
$T key b
$T stop
```

For a TUI-originated Unstop search, start on SCRAPE, send the keywords, use Down through the fields to Sources, toggle LinkedIn off with Space, continue with Down to `[ START SCAN ]`, and press Enter. Tab changes screens rather than moving between form fields. Capture the form before submission, active LOGS, completed LOGS, and RESULTS.

### Proof

The first capture shows the SCRAPE form. RESULTS displays a run also returned by `/api/results`. Enter opens its jobs, and the next Enter shows job detail with source, pay, URL, and position metadata. A TUI-originated search also shows its keywords in LOGS and writes the run file.

## Gotchas

- `tui.sh send` types literal text. `tui.sh key` sends one tmux key such as `Tab`, `BTab`, `Space`, or `Enter`.
- The TUI talks to `--api`, else `IS_DL_API_URL`, else `http://localhost:3000`. `tui.sh` passes the session's API.
- Starting a search moves to LOGS automatically.
- Export writes `results-export.zip` to `$IS_DL_VERIFY_DIR/tui-work/` because that is the TUI working directory.
- Key `q` exits the whole app from any screen. Use `b` or `Escape` to leave detail views.
