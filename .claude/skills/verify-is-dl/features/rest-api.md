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

Run `is-dl serve`, then use the `/api/*` routes on its port, 3000 by default. `--port`, `IS_DL_SERVE_PORT`, or `[serve].port` can change it. The normal website and TUI call these routes.

## Driving it with HTTP

```bash
curl -fsS "$IS_DL_VERIFY_API_URL/api/results" >"$EV/api-results.json"
curl -N --max-time 30 "$IS_DL_VERIFY_API_URL/api/logs" >"$EV/api-logs.txt" 2>"$EV/api-logs.stderr" &
logs_pid=$!
trap 'kill "$logs_pid" 2>/dev/null || true; wait "$logs_pid" 2>/dev/null || true' EXIT
for _ in {1..100}; do
  grep -q '"type":"status"' "$EV/api-logs.txt" && break
  sleep 0.1
done
grep -q '"type":"status"' "$EV/api-logs.txt" || exit 1
curl -fsS -X POST "$IS_DL_VERIFY_API_URL/api/scrape" \
  -H 'Content-Type: application/json' \
  --data '{"keywords":"software","limit":1,"sources":["unstop"],"unstopRoles":["software-development"],"headless":true}' \
  >"$EV/api-scrape.json"
wait "$logs_pid" || [[ "$?" == 28 ]]
trap - EXIT
```

### Proof

The bounded SSE capture starts before the POST; curl exit 28 is its expected timeout, not proof of success. The scrape request returns success, SSE changes from active to idle and includes `SCRAPE FINISHED`, and `/api/results` gains one run. The run file exists below `$XDG_DATA_HOME/is-dl/runs/`. For delete and export, also inspect the removed file or ZIP entries.

## Gotchas

- `POST /api/scrape` returns before the search finishes. Observe SSE or poll results.
- A second active scrape returns HTTP 400.
- Abort with no active scrape returns HTTP 409.
- List fields take a JSON array or a comma-separated string. The search keys are `SEARCH_FIELDS` camelCased except `outDir`, plus `debug`, `excludeSeen`, `excludeApplied` and `excludeUnpaid`. API results always enter the run store. An unknown key or source is HTTP 400 with the reason.
- The body resolves over the server's config and `IS_DL_*` env, the way `search` flags do.
- A failed search logs `SCRAPE FAILED: <reason>` on the SSE stream.
- API state is process-global, so one verification session owns its API.
