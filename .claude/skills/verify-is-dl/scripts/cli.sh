#!/usr/bin/env bash
# Runs this working tree's CLI with isolated state and nothing else running.
#   cli.sh <args>         packs the CLI, then runs it
#   cli.sh --tty <args>   the same under a pseudo-terminal, for $EDITOR and other TTY-only paths
#   cli.sh --reset        deletes the isolated state
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
run="$repo/.local/verify-is-dl-cli"
login="${IS_DL_VERIFY_LOGIN_DIR:-$repo/.local/verify-is-dl-login}"

if [[ "${1:-}" == "--reset" ]]; then
  rm -rf -- "$run"
  exit 0
fi

tty=0
if [[ "${1:-}" == "--tty" ]]; then
  tty=1
  shift
fi

# Packing on every call costs ~100ms and means dist is this working tree, never a
# bundle `vp run build` replayed from its cache.
(cd "$repo" && vp pack >/dev/null)

# Same reason as launch.sh: Playwright finds its browsers through the cache root.
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-${XDG_CACHE_HOME:-$HOME/.cache}/ms-playwright}"

mkdir -p "$run/config" "$run/data" "$run/cache" "$login/state"
export XDG_CONFIG_HOME="$run/config"
export XDG_DATA_HOME="$run/data"
export XDG_STATE_HOME="$login/state"
export XDG_CACHE_HOME="$run/cache"

bin="$repo/dist/cli.mjs"
if [[ "$tty" == "1" ]]; then
  # stdout and stderr share the terminal, so they arrive merged on stdout.
  exec python3 -c 'import os, pty, sys; sys.exit(os.waitstatus_to_exitcode(pty.spawn(sys.argv[1:])))' "$bin" "$@"
fi
exec "$bin" "$@"
