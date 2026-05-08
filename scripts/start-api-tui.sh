#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TUI_DIR="$ROOT/apps/tui"

if [[ -f "$TUI_DIR/bin/is-dl-tui" ]]; then
  TUI_CMD="cd '$TUI_DIR' && ./bin/is-dl-tui"
else
  TUI_CMD="cd '$TUI_DIR' && go run ./..."
fi

if command -v ghostty &>/dev/null; then
  ghostty -e bash -c "$TUI_CMD; exec bash" &
elif command -v kitty &>/dev/null; then
  kitty --detach -- bash -c "$TUI_CMD; exec bash"
elif command -v gnome-terminal &>/dev/null; then
  gnome-terminal -- bash -c "$TUI_CMD; exec bash"
elif command -v alacritty &>/dev/null; then
  alacritty -e bash -c "$TUI_CMD; exec bash" &
elif command -v xterm &>/dev/null; then
  xterm -e bash -c "$TUI_CMD; exec bash" &
else
  echo "No terminal emulator found. Open new terminal and run: bun run start:tui"
fi

lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs -r kill -9 || true

cd "$ROOT"
bun run start:api
