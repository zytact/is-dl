#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TUI_DIR="$ROOT/apps/tui"
API_LOG="$ROOT/apps/api/out/api.log"
MODE="${1:-start}"
API_PID=""
API_STARTED=0

if [[ "$MODE" != "dev" && "$MODE" != "start" ]]; then
  echo "Usage: $0 [dev|start]" >&2
  exit 2
fi

mkdir -p "$(dirname "$API_LOG")"

api_ready() {
  curl -fsS http://localhost:3000/api/results >/dev/null 2>&1
}

kill_port_3000() {
  lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs -r kill -9 || true
}

start_api() {
  if api_ready; then
    return
  fi

  kill_port_3000
  : >"$API_LOG"

  setsid bash -c 'cd "$1" && exec vp run "$2:api"' bash "$ROOT" "$MODE" >>"$API_LOG" 2>&1 &

  API_PID="$!"
  API_STARTED=1

  for _ in {1..60}; do
    if api_ready; then
      return
    fi
    if ! kill -0 "$API_PID" 2>/dev/null; then
      echo "API failed to start. See $API_LOG" >&2
      exit 1
    fi
    sleep 0.5
  done

  echo "API did not become ready. See $API_LOG" >&2
  exit 1
}

cleanup() {
  if [[ "$API_STARTED" == "1" && -n "$API_PID" ]]; then
    kill -TERM "-$API_PID" 2>/dev/null || kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

start_api

if [[ "$MODE" == "dev" ]]; then
  TUI_CMD=(go run ./...)
elif [[ -f "$TUI_DIR/bin/is-dl-tui" ]]; then
  TUI_CMD=(./bin/is-dl-tui)
else
  echo "TUI binary not found. Run 'vp run --filter @repo/tui build' or use 'vp run dev:tui'." >&2
  exit 1
fi

cd "$TUI_DIR"
"${TUI_CMD[@]}"
