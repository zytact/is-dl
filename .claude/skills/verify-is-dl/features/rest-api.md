# REST API

The HTTP service used by the website and TUI. It starts searches, streams logs and status, reads saved runs, exports them, and deletes them.

## Sub-features

- Start and abort a scrape.
- Stream current status and accumulated logs over SSE.
- List and read saved runs.
- Export every run as a ZIP.
- Delete one run.
- Reject invalid requests and concurrent scrapes.

## How to get to it (user POV)

Run `is-dl serve`, then use the `/api/*` routes on port 3000. The normal website and TUI call these routes.

## Driving it with HTTP

```bash
curl -fsS "$IS_DL_VERIFY_API_URL/api/results" >"$EV/api-results.json"
curl -fsS -X POST "$IS_DL_VERIFY_API_URL/api/scrape" \
  -H 'Content-Type: application/json' \
  --data '{"keywords":"software","limit":1,"sources":["unstop"],"unstopRoles":["software-development"],"headless":true}' \
  >"$EV/api-scrape.json"
curl -N "$IS_DL_VERIFY_API_URL/api/logs" >"$EV/api-logs.txt"
```

### Proof

The scrape request returns success, SSE changes from active to idle and includes `SCRAPE FINISHED`, and `/api/results` gains one run. The run file exists below `$XDG_DATA_HOME/is-dl/runs/`. For delete and export, also inspect the removed file or ZIP entries.

## Gotchas

- `POST /api/scrape` returns before the search finishes. Observe SSE or poll results.
- A second active scrape returns HTTP 400.
- Abort with no active scrape returns HTTP 409.
- Source names in JSON arrays and comma-separated strings are both accepted.
- API state is process-global, so one verification launcher owns port 3000.
