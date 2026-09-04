#!/usr/bin/env bash
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../../../.." && pwd)"
run="$repo/.local/verify-is-dl"
session="$run/session.env"
evidence_root="$repo/.local/verify-evidence/is-dl"

if [[ ! -f "$session" ]]; then
  echo "No verification session to remove."
  exit 0
fi

# shellcheck disable=SC1090
. "$session"

if tmux has-session -t "$IS_DL_VERIFY_TMUX" 2>/dev/null; then
  tmux kill-session -t "$IS_DL_VERIFY_TMUX"
  echo "Stopped TUI session $IS_DL_VERIFY_TMUX."
fi

node "$here/browser.mjs" close >/dev/null 2>&1 || true
for _ in {1..20}; do
  kill -0 "$IS_DL_VERIFY_BROWSER_PID" 2>/dev/null || break
  sleep 0.25
done
kill -TERM -"$IS_DL_VERIFY_BROWSER_PID" 2>/dev/null || kill "$IS_DL_VERIFY_BROWSER_PID" 2>/dev/null || true

for entry in "website:$IS_DL_VERIFY_WEB_PID" "API:$IS_DL_VERIFY_API_PID"; do
  name="${entry%%:*}"
  pid="${entry##*:}"
  kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  for _ in {1..40}; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.25
  done
  if kill -0 "$pid" 2>/dev/null; then
    echo "$name PID $pid did not stop in 10 seconds; forcing its process group." >&2
    kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  fi
done

rm -rf -- "$run"
echo "Removed $run"
echo "Evidence kept in $evidence_root"
