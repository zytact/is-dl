# TUI

The Go terminal interface for search configuration, live logs, saved runs, job inspection, ZIP export, and deletion.

## Sub-features

- Navigate SCRAPE, LOGS, and RESULTS with Tab, Shift+Tab, or keys 1 through 3.
- Edit search inputs, source checkboxes, Unstop opportunity and roles, Y Combinator roles and experience ceiling, and toggles.
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

For a TUI-originated Unstop search, start on SCRAPE, send the keywords, use Down through the fields to Sources, toggle LinkedIn off with Space, move Down twice to `ycombinator` and toggle it off too, continue with Down to `[ START SCAN ]`, and press Enter. For a Y Combinator search, toggle `linkedin` and `unstop` off instead, and set Limit to 4 first: focus it, send `BSpace` twice, then send `4`. Tab changes screens rather than moving between form fields. Capture the form before submission, active LOGS, completed LOGS, and RESULTS.

### Proof

The first capture shows the SCRAPE form. RESULTS displays a run also returned by `/api/results`. Enter opens its jobs, and the next Enter shows job detail with source, pay, URL, and position metadata, and `Apply URL` on a Y Combinator job. A TUI-originated search also shows its keywords in LOGS and writes the run file.

## Gotchas

- `tui.sh send` types literal text. `tui.sh key` sends one tmux key such as `Tab`, `BTab`, `Space`, or `Enter`.
- The TUI talks to `--api`, else `IS_DL_API_URL`, else `http://localhost:3000`. `tui.sh` passes the session's API.
- Keys `1`, `2` and `3` switch screens and `q` quits even while a text field has focus, so none of them can be typed. A limit can only use the digits 0 and 4 to 9, and an emptied Limit field means 50.
- Starting a search moves to LOGS automatically.
- All three sources start selected. `YC Roles`, `YC Max Experience` and the `YC Skip US-only` toggle exist only while `ycombinator` is checked, and a search with no YC role checked shows `select at least one Y Combinator role`.
- The form is taller than the 40-row pane and scrolls with the focused field, so capture after moving focus to the field you want in the proof.
- Export writes `results-export.zip` to `$IS_DL_VERIFY_DIR/tui-work/` because that is the TUI working directory.
- Key `q` exits the whole app from any screen. Use `b` or `Escape` to leave detail views.
