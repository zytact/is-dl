#!/usr/bin/env bash
set -euo pipefail

# One interactive LinkedIn login, stored where cleanup will not delete it.
# Needs a TTY and opens a real browser window. Every later launch.sh reuses it.

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../../../.." && pwd)"
login="${IS_DL_VERIFY_LOGIN_DIR:-$repo/.local/verify-is-dl-login}"
bin="$repo/dist/cli.mjs"

[[ -t 0 ]] || { echo "scripts/login.sh needs an interactive terminal." >&2; exit 2; }

if [[ ! -x "$bin" ]]; then
  command -v vp >/dev/null 2>&1 || { echo "Vite+ is required to build the CLI." >&2; exit 4; }
  (cd "$repo" && vp pack >/dev/null)
fi

mkdir -p "$login/state" "$login/scratch/config" "$login/scratch/data" "$login/scratch/cache"

# Playwright resolves its browser registry through XDG_CACHE_HOME on Linux, so
# the scratch cache below would hide the installed Chromium. Pin the registry to
# the host's before the cache moves.
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-${XDG_CACHE_HOME:-$HOME/.cache}/ms-playwright}"

# Only the state directory persists between runs, and only the session file
# lives in it. Config, data and cache are scratch so this never reads or writes
# the developer's real is-dl state.
export XDG_STATE_HOME="$login/state"
export XDG_CONFIG_HOME="$login/scratch/config"
export XDG_DATA_HOME="$login/scratch/data"
export XDG_CACHE_HOME="$login/scratch/cache"

"$bin" "${1:-login}" "${@:2}"

session="$login/state/is-dl/storageState.json"
if [[ -f "$session" ]]; then
  printf 'Stored at %s\n' "$session"
  printf 'Cleanup keeps this. Run scripts/login.sh logout to drop it.\n'
fi
