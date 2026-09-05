#!/usr/bin/env bash
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../../../.." && pwd)"
session="$repo/.local/verify-is-dl/session.env"
failures=0

check() {
  local name="$1"
  shift
  if "$@"; then printf 'ok   %s\n' "$name"; else printf 'FAIL %s\n' "$name"; failures=$((failures + 1)); fi
}

[[ -f "$session" ]] || { echo "FAIL session file - run scripts/launch.sh"; exit 1; }
# shellcheck disable=SC1090
. "$session"

sha() {
  node -e 'const{createHash}=require("node:crypto"),{readFileSync}=require("node:fs");process.stdout.write(createHash("sha256").update(readFileSync(process.argv[1])).digest("hex"))' "$1" 2>/dev/null
}

dist_sha() {
  node -e '
const {createHash}=require("node:crypto");
const {readdirSync,readFileSync}=require("node:fs");
const {join}=require("node:path");
const dir=process.argv[1];
const h=createHash("sha256");
for (const name of readdirSync(dir).filter((n)=>n.endsWith(".mjs")).sort()) {
  h.update(name);
  h.update(readFileSync(join(dir,name)));
}
process.stdout.write(h.digest("hex"));' "$1" 2>/dev/null
}

node_major="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
actual_sha="$(dist_sha "$(dirname "$IS_DL_VERIFY_BIN")" || true)"
actual_tui_sha="$(sha "$IS_DL_VERIFY_TUI_BIN" || true)"
expected_version="$(node -p 'require(process.argv[1]).version' "$repo/package.json" 2>/dev/null || true)"
actual_version="$($IS_DL_VERIFY_BIN --version 2>/dev/null || true)"
config_json="$($IS_DL_VERIFY_BIN config path --json 2>/dev/null || true)"
doctor_json="$($IS_DL_VERIFY_BIN doctor --json 2>/dev/null || true)"
api_json="$(curl -fsS "$IS_DL_VERIFY_API_URL/api/results" 2>/dev/null || true)"
page_json="$(node "$here/browser.mjs" eval "$IS_DL_VERIFY_WEB_URL" 'JSON.stringify({origin:location.origin,hydrated:Object.keys(document.getElementById("root")).some((key)=>key.startsWith("__reactContainer$"))})' 2>/dev/null || true)"

check "session directory" test "$IS_DL_VERIFY_DIR" = "$repo/.local/verify-is-dl"
check "node >=24" test "$node_major" -ge 24
check "packed CLI" test -x "$IS_DL_VERIFY_BIN"
check "CLI build hash" test -n "$actual_sha" -a "$actual_sha" = "$IS_DL_VERIFY_BUILD_SHA"
check "CLI source freshness" bash -c 'newest="$(ls -t "$1"/dist/*.mjs 2>/dev/null | head -1)"; [[ -n "$newest" ]] && ! find "$1/apps/api/src" "$1/package.json" "$1/vite.config.ts" -type f -newer "$newest" -print -quit | grep -q .' _ "$repo"
check "package version" test -n "$actual_version" -a "$actual_version" = "$expected_version"
check "isolated config path" node -e 'const v=JSON.parse(process.argv[1]);process.exit(v.ok&&v.path.startsWith(process.argv[2]+"/")?0:1)' "$config_json" "$XDG_CONFIG_HOME"
check "session path outside the run dir" test "$XDG_STATE_HOME" = "${IS_DL_VERIFY_LOGIN_DIR:-}/state"
check "Chromium visible to the isolated run" node -e 'const v=JSON.parse(process.argv[1]);const c=v.checks?.find((x)=>x.name==="chromium");process.exit(c&&c.ok?0:1)' "$doctor_json"
check "TUI binary" test -x "$IS_DL_VERIFY_TUI_BIN"
check "TUI build hash" test -n "$actual_tui_sha" -a "$actual_tui_sha" = "$IS_DL_VERIFY_TUI_SHA"
check "TUI source freshness" bash -c '! find "$1/apps/tui" -type f -name "*.go" -newer "$2" -print -quit | grep -q .' _ "$repo" "$IS_DL_VERIFY_TUI_BIN"
check "web source freshness" bash -c '! find "$1/apps/web/src" "$1/apps/web/package.json" "$1/apps/web/vite.config.ts" -type f -newer "$2" -print -quit | grep -q .' _ "$repo" "$repo/apps/web/dist/index.html"
check "API process" kill -0 "$IS_DL_VERIFY_API_PID"
check "API port owner" bash -c 'lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | grep -qx "$2"' _ "$IS_DL_VERIFY_API_PORT" "$IS_DL_VERIFY_API_PID"
check "API response" node -e 'const v=JSON.parse(process.argv[1]);process.exit(Array.isArray(v.results)?0:1)' "$api_json"
check "web process" kill -0 "$IS_DL_VERIFY_WEB_PID"
check "web port owner" bash -c 'lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | grep -qx "$2"' _ "$IS_DL_VERIFY_WEB_PORT" "$IS_DL_VERIFY_WEB_PID"
check "browser process" kill -0 "$IS_DL_VERIFY_BROWSER_PID"
check "CDP endpoint" bash -c 'curl -fsS "$1" >/dev/null' _ "http://127.0.0.1:$IS_DL_VERIFY_CDP_PORT/json/version"
check "website hydrated" node -e 'const v=JSON.parse(process.argv[1]);process.exit(v.hydrated&&v.origin===process.argv[2]?0:1)' "$page_json" "$IS_DL_VERIFY_WEB_URL"
check "downloads isolated" node -e 'const{readFileSync}=require("node:fs");const p=JSON.parse(readFileSync(process.argv[1],"utf8"));process.exit(p.download?.default_directory===process.argv[2]?0:1)' "$IS_DL_VERIFY_PROFILE/Default/Preferences" "$IS_DL_VERIFY_DOWNLOADS"

# LinkedIn is optional: an Unstop-only run is a correct run without a session.
if [[ -f "${IS_DL_VERIFY_SESSION_FILE:-}" ]]; then
  printf 'note LinkedIn session stored (%s)\n' "${IS_DL_VERIFY_SESSION_FILE}"
else
  printf 'note no LinkedIn session; Unstop-only proofs work, run scripts/login.sh for LinkedIn\n'
fi

exit "$failures"
