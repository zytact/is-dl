#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
session_file="$repo/.local/verify-is-dl/session.env"

if [[ ! -f "$session_file" ]]; then
  echo "No verification session. Run scripts/launch.sh first." >&2
  exit 2
fi

# shellcheck disable=SC1090
. "$session_file"

case "${1:-}" in
  start)
    if tmux has-session -t "$IS_DL_VERIFY_TMUX" 2>/dev/null; then
      echo "TUI session $IS_DL_VERIFY_TMUX is already running." >&2
      exit 2
    fi
    tmux new-session -d -s "$IS_DL_VERIFY_TMUX" -x 120 -y 40 \
      -c "$IS_DL_VERIFY_DIR/tui-work" "$IS_DL_VERIFY_TUI_BIN" --api "$IS_DL_VERIFY_API_URL"
    for _ in {1..40}; do
      tmux capture-pane -p -t "$IS_DL_VERIFY_TMUX" 2>/dev/null | grep -q '1: SCRAPE' && exit 0
      sleep 0.1
    done
    echo "TUI did not render its SCRAPE tab." >&2
    exit 1
    ;;
  send)
    shift
    [[ $# -gt 0 ]] || { echo "Usage: tui.sh send <literal text>" >&2; exit 2; }
    tmux send-keys -t "$IS_DL_VERIFY_TMUX" -l -- "$*"
    ;;
  key)
    [[ $# -eq 2 ]] || { echo "Usage: tui.sh key <tmux key>" >&2; exit 2; }
    tmux send-keys -t "$IS_DL_VERIFY_TMUX" "$2"
    ;;
  capture)
    [[ $# -eq 2 ]] || { echo "Usage: tui.sh capture <file>" >&2; exit 2; }
    mkdir -p "$(dirname "$2")"
    tmux capture-pane -p -t "$IS_DL_VERIFY_TMUX" >"$2"
    ;;
  stop)
    if tmux has-session -t "$IS_DL_VERIFY_TMUX" 2>/dev/null; then
      tmux send-keys -t "$IS_DL_VERIFY_TMUX" q
      for _ in {1..20}; do
        tmux has-session -t "$IS_DL_VERIFY_TMUX" 2>/dev/null || exit 0
        sleep 0.1
      done
      tmux kill-session -t "$IS_DL_VERIFY_TMUX"
    fi
    ;;
  *)
    echo "Usage: tui.sh start|send <text>|key <key>|capture <file>|stop" >&2
    exit 2
    ;;
esac
