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

if [[ "${1:-}" == "--tty" ]]; then
  shift
  exec python3 -c 'import os, pty, sys; sys.exit(os.waitstatus_to_exitcode(pty.spawn(sys.argv[1:])))' "$IS_DL_VERIFY_BIN" "$@"
fi

exec "$IS_DL_VERIFY_BIN" "$@"
